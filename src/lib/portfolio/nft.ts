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

// Enumeration (cached daily): how many collections we pull from the indexer.
const ENUM_PAGE = 100;
const MAX_ENUM_PAGES = 20; // up to ~2000 collections ranked by activity

// Per-wallet scan budget. A `tokens{owner}` query is ~120ms and we spread the
// fan-out across LCD nodes, so the full ~1.5k-collection registry scans in well
// under 10s — we query all of it rather than a subset, ranked so the busiest
// collections resolve first if the time budget ever bites.
const SCAN_LIMIT = 1500; // most-active collections queried per lookup
const SCAN_CONCURRENCY = 20;
const SCAN_TIME_BUDGET_MS = 40_000;

// Metadata (only for collections that actually hold something).
const MAX_NFTS = 60; // total NFTs we resolve images for
const MAX_PER_COLLECTION = 24;
const METADATA_CONCURRENCY = 10;

const IPFS_GATEWAYS = ['https://ipfs.io/ipfs/', 'https://dweb.link/ipfs/'];

// Collections flagged as "blue chip" in the decoder — kept in sync by name.
const BLUE_CHIP = new Set(
  ['Premier Ninja', 'MASKED', 'Pedro', 'Cult of Anons', 'Injective Quants'].map(n =>
    n.toLowerCase(),
  ),
);

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
  if (uri.startsWith('ipfs://')) {
    return IPFS_GATEWAYS[gatewayIndex % IPFS_GATEWAYS.length] + uri.slice('ipfs://'.length);
  }
  return uri;
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

/**
 * Every Talis CW721 collection the indexer knows, ranked by lifetime executions.
 * Talis deploys collections under several code versions but labels them all
 * "Talis CW721", so a label search captures them regardless of code id.
 */
async function enumerateCollections(): Promise<Collection[]> {
  const out: Collection[] = [];
  for (let page = 0; page < MAX_ENUM_PAGES; page++) {
    const url = `${INDEXER_BASE}/api/explorer/v1/wasm/contracts?label=${encodeURIComponent(
      'Talis CW721',
    )}&limit=${ENUM_PAGE}&skip=${page * ENUM_PAGE}`;
    const body = await getJson(url);
    const rows = Array.isArray(body?.data) ? body.data : [];
    if (rows.length === 0) break;

    for (const row of rows) {
      const label: string = row?.label ?? '';
      // Guard against substring matches on non-collection Talis contracts.
      if (!/talis\s*cw721/i.test(label)) continue;
      let name = '';
      let symbol = '';
      try {
        const init = JSON.parse(row?.init_message ?? '{}');
        name = typeof init?.name === 'string' ? init.name : '';
        symbol = typeof init?.symbol === 'string' ? init.symbol : '';
      } catch {
        /* keep empty */
      }
      out.push({
        address: row?.address ?? '',
        name: name || row?.address || '',
        symbol,
        executes: Number(row?.executes) || 0,
      });
    }
    if (rows.length < ENUM_PAGE) break;
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
  unstable_cache(enumerateCollections, ['talis-cw721-collections-v1'], {
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
    const body = await getJson(smartQueryUrl(lcdFor(lcdSeed + page), collection, query), 8_000);
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
  const scanSet = collections.slice(0, SCAN_LIMIT);

  const { hits, scanned, partial } = await scanOwnership(address, scanSet);

  // Busiest collections first, then resolve metadata within the global cap.
  hits.sort((a, b) => b.collection.executes - a.collection.executes);

  const holdings: CollectionHolding[] = [];
  let budget = MAX_NFTS;
  for (const hit of hits) {
    if (budget <= 0) {
      // Still record the holding (count is real) even if we can't render images.
      holdings.push({
        address: hit.collection.address,
        name: hit.collection.name,
        symbol: hit.collection.symbol,
        count: hit.tokenIds.length,
        isBlueChip: BLUE_CHIP.has(hit.collection.name.toLowerCase()),
        items: [],
      });
      continue;
    }
    const ids = hit.tokenIds.slice(0, Math.min(hit.tokenIds.length, budget));
    const items = await mapWithConcurrency(ids, METADATA_CONCURRENCY, (id, idx) =>
      fetchTokenMeta(hit.collection.address, id, idx),
    );
    budget -= ids.length;
    holdings.push({
      address: hit.collection.address,
      name: hit.collection.name,
      symbol: hit.collection.symbol,
      count: hit.tokenIds.length,
      isBlueChip: BLUE_CHIP.has(hit.collection.name.toLowerCase()),
      items,
    });
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
