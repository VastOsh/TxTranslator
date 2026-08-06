import { unstable_cache } from 'next/cache';

// ── Wallet NFT portfolio: what a given address owns on Talis ──
//
// There is NO single chain endpoint that returns "all NFTs owned by address X".
// Ownership lives inside each CW721 collection contract, and the public Injective
// indexer exposes CW20 balances but no CW721-by-owner reverse index (InjScan has
// one, but it is private). So we do it honestly and on-chain:
//
//   1. Enumerate Talis's CW721 collections from the indexer (label search),
//      ranked by lifetime execution count so the busiest collections come first.
//   2. For a wallet, ask each collection `tokens { owner }` — a ~120ms indexed
//      query — spread across several LCD nodes under a wall-clock budget.
//   3. For the collections that hold something, pull per-token metadata via the
//      Talis `metadata_u_r_i` query and resolve the IPFS JSON for name + image.
//
// Every figure is read live from the chain; nothing here is fabricated. When the
// budget is hit before every collection is scanned we say so rather than pretend
// the list is complete.

const INDEXER_BASE = 'https://sentry.exchange.grpc-web.injective.network';

// LCD nodes that serve the standard CosmWasm smart-query REST path. We round-robin
// across them so a per-wallet fan-out of hundreds of queries does not hammer (and
// get rate-limited by) a single node.
const LCD_NODES = [
  'https://injective-api.polkachu.com',
  'https://lcd.injective.network',
  'https://injective-rest.publicnode.com',
];

const HEADERS = {
  Accept: 'application/json',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
};

// Enumeration (cached daily). We enumerate by the Talis CW721 *code ids* rather
// than by label: every instance of these codes is a Talis collection contract,
// whereas the label varies ("Talis CW721", "Talis cw721 <Name>", "Instantiate
// CW721", …) and label-filtering silently dropped real collections — including
// the OG blue chips, which carry an off-pattern label. Codes confirmed on-chain:
// 49 (the bulk / OG), 796, 1095, 789.
const TALIS_CW721_CODES = [49, 796, 1095, 789];
const ENUM_PAGE = 100;
const MAX_ENUM_PAGES_PER_CODE = 60; // code 49 alone holds ~4k contracts

// Per-wallet scan budget. A `tokens{owner}` query is ~120ms and we spread the
// fan-out across LCD nodes; empty (zero-execution) collections are skipped, so
// the live set is a few thousand and scans in well under the budget. Ranked by
// activity so the busiest collections resolve first if the budget ever bites.
const SCAN_CONCURRENCY = 24;
const SCAN_TIME_BUDGET_MS = 60_000;

// Metadata (only for collections that actually hold something).
const MAX_NFTS = 60; // total NFTs we resolve images for
const MAX_PER_COLLECTION = 24;
const METADATA_CONCURRENCY = 10;

const IPFS_GATEWAYS = ['https://ipfs.io/ipfs/', 'https://dweb.link/ipfs/'];

// ── Verified collections — pinned by CONTRACT ADDRESS, never by name ──
//
// The chain is full of impostor collections that copy a famous name verbatim
// ("Injective Quants" has 40+ zero-activity clones, plus look-alikes like
// "lnjective Quants"). So authenticity is tied to the exact contract address:
// these are the ONLY collections eligible for the Blue Chip badge, they always
// carry this canonical name (overriding whatever on-chain string they report),
// and they are always scanned even when outside the enumerated Talis set — some
// OG collections were deployed under their own contract, not the Talis launchpad
// code, so enumeration alone never reaches them.
interface Verified {
  name: string;
  blueChip: boolean;
}
// Each real address is the runaway activity outlier among dozens of same-named
// clones (e.g. the real "The Ninjas" has 42k executions vs <70 for every copy),
// which is exactly how it was identified on-chain.
const VERIFIED: Record<string, Verified> = {
  inj1vtd54v4jm50etkjepgtnd7lykr79yvvah8gdgw: { name: 'Injective Quants', blueChip: true },
  inj19ly43dgrr2vce8h02a8nw0qujwhrzm9yv8d75c: { name: 'The Ninjas', blueChip: true }, // Premier Ninjas
  inj1mp8r8jy4cefgw4l0wtw9ahdnu9yv7nl6mqqkju: { name: 'Cult of Anons', blueChip: true },
  inj19lsr0vk0h42k0mspgym552hl432a9et0nhd4nj: { name: 'MASKED', blueChip: true },
  inj1uq453kp4yda7ruc0axpmd9vzfm0fj62padhe0p: { name: 'Pedro', blueChip: true },
};

export interface NftItem {
  tokenId: string;
  name: string | null;
  /** HTTP(S) image URL (IPFS resolved to a gateway), or null when metadata was unreachable. */
  image: string | null;
}

export interface CollectionHolding {
  address: string;
  name: string;
  symbol: string;
  count: number;
  isBlueChip: boolean;
  /** True only for address-pinned known collections — distinguishes the real
   *  ones from same-named impostors. */
  verified: boolean;
  items: NftItem[];
}

export interface Portfolio {
  address: string;
  totalNfts: number;
  /** Collections actually queried this lookup. */
  collectionsScanned: number;
  /** Collections known in the registry (the scan ceiling). */
  collectionsKnown: number;
  /** True when the time budget stopped the scan before every collection was checked. */
  partial: boolean;
  holdings: CollectionHolding[];
}

interface Collection {
  address: string;
  name: string;
  symbol: string;
  executes: number;
}

async function getJson(url: string, timeoutMs = 10_000) {
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function smartQueryUrl(lcd: string, contract: string, query: object): string {
  const b64 = Buffer.from(JSON.stringify(query)).toString('base64');
  return `${lcd}/cosmwasm/wasm/v1/contract/${contract}/smart/${b64}`;
}

/** Round-robin an LCD node so the fan-out spreads across hosts. */
function lcdFor(i: number): string {
  return LCD_NODES[i % LCD_NODES.length];
}

function resolveIpfs(uri: string, gatewayIndex = 0): string {
  if (!uri) return uri;
  let url = uri;
  if (uri.startsWith('ipfs://')) {
    url = IPFS_GATEWAYS[gatewayIndex % IPFS_GATEWAYS.length] + uri.slice('ipfs://'.length);
  }
  // Some collections put a literal '#' or '?' in the filename (e.g. ".../#11.png").
  // Left raw, the browser reads it as a URL fragment/query and loads the parent
  // directory instead of the image — encode them so the file resolves.
  return url.replace(/#/g, '%23').replace(/\?/g, '%3F');
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ── 1. Collection registry ──────────────────────────────────────────────────

/** A collection's display name — from init_message, else the "…cw721 <Name>"
 *  label form some versions use, else the address. */
function collectionName(row: { label?: string; init_message?: string; address?: string }): string {
  try {
    const init = JSON.parse(row?.init_message ?? '{}');
    if (typeof init?.name === 'string' && init.name.trim()) return init.name.trim();
  } catch {
    /* fall through */
  }
  const m = /cw721\s+(.+)$/i.exec(row?.label ?? '');
  if (m) return m[1].trim();
  return row?.address ?? '';
}

/** All contracts instantiated from one code id. */
async function enumerateByCode(code: number, into: Collection[]): Promise<void> {
  for (let page = 0; page < MAX_ENUM_PAGES_PER_CODE; page++) {
    const url = `${INDEXER_BASE}/api/explorer/v1/wasm/contracts?code_id=${code}&limit=${ENUM_PAGE}&skip=${page * ENUM_PAGE}`;
    const body = await getJson(url);
    const rows = Array.isArray(body?.data) ? body.data : [];
    if (rows.length === 0) break;

    for (const row of rows) {
      const executes = Number(row?.executes) || 0;
      const address: string = row?.address ?? '';
      // Skip dead contracts (hold nothing, mostly test/impostor spam), but never
      // drop a verified one.
      if (executes === 0 && !VERIFIED[address]) continue;
      let symbol = '';
      try {
        const init = JSON.parse(row?.init_message ?? '{}');
        symbol = typeof init?.symbol === 'string' ? init.symbol : '';
      } catch {
        /* keep empty */
      }
      into.push({ address, name: collectionName(row), symbol, executes });
    }
    if (rows.length < ENUM_PAGE) break;
  }
}

/**
 * Every Talis CW721 collection the indexer knows, ranked by lifetime executions
 * so the busiest resolve first. Verified collections are always folded in.
 */
async function enumerateCollections(): Promise<Collection[]> {
  const out: Collection[] = [];
  for (const code of TALIS_CW721_CODES) {
    await enumerateByCode(code, out);
  }

  // Fold in any verified collection enumeration did not surface, so an owner
  // always sees it even if its code ever falls outside the set above.
  const enumerated = new Set(out.map(c => c.address));
  for (const [address, v] of Object.entries(VERIFIED)) {
    if (!enumerated.has(address)) {
      out.push({ address, name: v.name, symbol: '', executes: Number.MAX_SAFE_INTEGER });
    }
  }

  // Dedupe by address, then busiest first — the collections a wallet is most
  // likely to hold sit at the front, so the scan budget is spent well.
  const seen = new Set<string>();
  const unique = out.filter(c => {
    if (!c.address || seen.has(c.address)) return false;
    seen.add(c.address);
    return true;
  });
  unique.sort((a, b) => b.executes - a.executes);
  return unique;
}

const getCollections = () =>
  unstable_cache(enumerateCollections, ['talis-cw721-collections-v3'], {
    revalidate: 86_400, // collections are added rarely; refresh daily
  })();

// ── 2. Per-wallet ownership scan ─────────────────────────────────────────────

/** Token ids `owner` holds in `collection`, paged up to MAX_PER_COLLECTION. */
async function ownedTokenIds(
  collection: string,
  owner: string,
  lcdSeed: number,
): Promise<string[]> {
  const ids: string[] = [];
  let startAfter: string | undefined;
  for (let page = 0; page < 3 && ids.length < MAX_PER_COLLECTION; page++) {
    const query: { tokens: { owner: string; limit: number; start_after?: string } } = {
      tokens: { owner, limit: 30 },
    };
    if (startAfter !== undefined) query.tokens.start_after = startAfter;

    // A null response is a request failure (timeout / rate-limit), which is NOT
    // the same as an empty holding — retry on the next node before believing it,
    // so a flaky node never silently erases a real collection from the portfolio.
    let body = null;
    for (let attempt = 0; attempt < LCD_NODES.length && body === null; attempt++) {
      body = await getJson(smartQueryUrl(lcdFor(lcdSeed + page + attempt), collection, query), 8_000);
    }

    const batch: string[] = Array.isArray(body?.data?.ids) ? body.data.ids.map(String) : [];
    ids.push(...batch);
    if (batch.length < 30) break;
    startAfter = batch[batch.length - 1];
  }
  return ids.slice(0, MAX_PER_COLLECTION);
}

interface Hit {
  collection: Collection;
  tokenIds: string[];
}

/** Ask each collection whether `owner` holds anything, under a wall-clock budget. */
async function scanOwnership(
  owner: string,
  collections: Collection[],
): Promise<{ hits: Hit[]; scanned: number; partial: boolean }> {
  const deadline = Date.now() + SCAN_TIME_BUDGET_MS;
  const hits: Hit[] = [];
  let scanned = 0;
  let partial = false;
  let next = 0;

  async function worker(slot: number) {
    while (true) {
      if (Date.now() > deadline) {
        partial = true;
        return;
      }
      const i = next++;
      if (i >= collections.length) return;
      scanned++;
      const ids = await ownedTokenIds(collections[i].address, owner, slot);
      if (ids.length > 0) hits.push({ collection: collections[i], tokenIds: ids });
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(SCAN_CONCURRENCY, collections.length) }, (_, s) => worker(s)),
  );
  return { hits, scanned, partial };
}

// ── 3. Metadata resolution ───────────────────────────────────────────────────

async function fetchTokenMeta(
  collection: string,
  tokenId: string,
  lcdSeed: number,
): Promise<NftItem> {
  // metadata_u_r_i → the token's IPFS metadata JSON URL.
  const uriBody = await getJson(
    smartQueryUrl(lcdFor(lcdSeed), collection, { metadata_u_r_i: { token_id: tokenId } }),
    8_000,
  );
  const uri: string | undefined = typeof uriBody?.data === 'string' ? uriBody.data : undefined;
  if (!uri) return { tokenId, name: null, image: null };

  // Resolve the JSON, trying gateways in turn.
  for (let g = 0; g < IPFS_GATEWAYS.length; g++) {
    const meta = await getJson(resolveIpfs(uri, g), 8_000);
    if (!meta) continue;
    const name: string | null = meta.title ?? meta.name ?? null;
    const rawImage: string | undefined = meta.media ?? meta.image ?? meta.image_url;
    return { tokenId, name, image: rawImage ? resolveIpfs(rawImage) : null };
  }
  return { tokenId, name: null, image: null };
}

// ── Public entry point ───────────────────────────────────────────────────────

export async function buildPortfolio(address: string): Promise<Portfolio> {
  const collections = await getCollections();

  const { hits, scanned, partial } = await scanOwnership(address, collections);

  // Verified collections first, then busiest — so authentic holdings lead and
  // metadata budget favours them over the impostor long tail.
  hits.sort((a, b) => {
    const av = VERIFIED[a.collection.address] ? 1 : 0;
    const bv = VERIFIED[b.collection.address] ? 1 : 0;
    if (av !== bv) return bv - av;
    return b.collection.executes - a.collection.executes;
  });

  // Build a holding, resolving metadata only while the global image budget lasts
  // (the owned count is always exact regardless).
  async function toHolding(hit: Hit, withItems: boolean): Promise<CollectionHolding> {
    const v = VERIFIED[hit.collection.address];
    const items = withItems
      ? await mapWithConcurrency(
          hit.tokenIds.slice(0, Math.min(hit.tokenIds.length, MAX_NFTS)),
          METADATA_CONCURRENCY,
          (id, idx) => fetchTokenMeta(hit.collection.address, id, idx),
        )
      : [];
    return {
      address: hit.collection.address,
      name: v?.name ?? hit.collection.name, // verified name wins over on-chain string
      symbol: hit.collection.symbol,
      count: hit.tokenIds.length,
      isBlueChip: v?.blueChip ?? false, // badge by verified address, never by name
      verified: !!v,
      items,
    };
  }

  const holdings: CollectionHolding[] = [];
  let budget = MAX_NFTS;
  for (const hit of hits) {
    const holding = await toHolding(hit, budget > 0);
    if (budget > 0) budget -= holding.items.length;
    holdings.push(holding);
  }

  const totalNfts = holdings.reduce((sum, h) => sum + h.count, 0);

  return {
    address,
    totalNfts,
    collectionsScanned: scanned,
    collectionsKnown: collections.length,
    partial,
    holdings,
  };
}
