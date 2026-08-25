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
const MAX_PER_COLLECTION = 24; // thumbnails rendered per collection — the owned count stays exact
const OWNER_PAGE_LIMIT = 30; // tokens{owner} page size
const MAX_OWNER_COUNT_PAGES = 100; // safety bound on full-count paging (~3k tokens/collection)
const METADATA_CONCURRENCY = 10;
// Absolute wall-clock budget for the whole /api/portfolio request (ownership
// scan + metadata resolution), measured from the function start. When IPFS
// gateways are slow, metadata resolution stops issuing new fetches past this
// mark and the response returns with the thumbnails it has (the rest resolve
// client-side / via the "load images" expander), so the function can never hit
// its maxDuration and 504. Kept comfortably under the route's maxDuration (120s)
// to leave room for in-flight requests to drain.
const OVERALL_TIME_BUDGET_MS = 70_000;
// "Show all" expander: how many images one collection can resolve on demand.
// Generous but bounded so a whale's collection can't spin forever.
const MAX_EXPAND_ITEMS = 300;

// Ordered by current reliability. The Protocol Labs gateways (ipfs.io, dweb.link)
// have become slow/unresponsive, so a faster public gateway leads and they trail
// as fallbacks. Metadata resolution and the initial <img> src both use [0] first;
// the client retries down this same list on error (see PortfolioView handleImgError).
const IPFS_GATEWAYS = [
  'https://ipfs.filebase.io/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://dweb.link/ipfs/',
  'https://ipfs.io/ipfs/',
];

// Server-side metadata JSON resolution only tries the first N (fast) gateways
// with a short timeout, so a slow/rate-limited gateway can't push the whole
// /api/portfolio function past its maxDuration. The remaining gateways still
// serve as client-side <img> fallbacks (which don't count against that budget).
const METADATA_JSON_GATEWAYS = 2;
const METADATA_JSON_TIMEOUT_MS = 5_000;

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
  /** Talis profile id (Mongo id) for this wallet, or null if it has no Talis
   *  profile. Talis profile URLs key on this id, not the raw address. */
  talisProfileId: string | null;
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

/**
 * Public URL the browser should load a thumbnail from. When the Cloudflare
 * Worker proxy is configured (TALIS_PROXY_URL), route images through its
 * `/ipfs/<cid>` route: the Worker fetches each CID from an IPFS gateway once
 * and caches it at Cloudflare's edge (NFT content is immutable), so repeat
 * loads for any visitor are instant and immune to the public gateways' rate
 * limits. Without the proxy, fall back to a direct gateway URL. Only ipfs://
 * images are proxied; already-HTTP images are left as-is.
 */
function resolveImageUrl(uri: string): string {
  const base = process.env.TALIS_PROXY_URL;
  if (base && uri.startsWith('ipfs://')) {
    const path = uri.slice('ipfs://'.length).replace(/#/g, '%23').replace(/\?/g, '%3F');
    return `${base.replace(/\/+$/, '')}/ipfs/${path}`;
  }
  return resolveIpfs(uri);
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

/**
 * What `owner` holds in `collection`: the EXACT owned count (paged in full) plus
 * the token ids, kept up to `idCap`. A wallet holding 50 in a collection must
 * report "50 owned" even when we only render a slice — so counting and the id
 * list are decoupled here, with `idCap` bounding how many ids we retain.
 */
async function pageOwnedTokenIds(
  collection: string,
  owner: string,
  lcdSeed: number,
  idCap: number,
): Promise<{ count: number; ids: string[] }> {
  const ids: string[] = [];
  let startAfter: string | undefined;
  let count = 0;
  for (let page = 0; page < MAX_OWNER_COUNT_PAGES; page++) {
    const query: { tokens: { owner: string; limit: number; start_after?: string } } = {
      tokens: { owner, limit: OWNER_PAGE_LIMIT },
    };
    if (startAfter !== undefined) query.tokens.start_after = startAfter;

    // A null response is a request failure (timeout / rate-limit), which is NOT
    // the same as an empty holding — retry on the next node before believing it,
    // so a flaky node never silently erases (or under-counts) a real collection.
    let body = null;
    for (let attempt = 0; attempt < LCD_NODES.length && body === null; attempt++) {
      body = await getJson(smartQueryUrl(lcdFor(lcdSeed + page + attempt), collection, query), 8_000);
    }

    const batch: string[] = Array.isArray(body?.data?.ids) ? body.data.ids.map(String) : [];
    count += batch.length;
    for (const id of batch) {
      if (ids.length < idCap) ids.push(id);
    }
    if (batch.length < OWNER_PAGE_LIMIT) break; // short page ⇒ last page
    startAfter = batch[batch.length - 1];
  }
  return { count, ids };
}

/** Ownership scan default — keeps only the thumbnails the grid renders. */
function ownedTokenIds(collection: string, owner: string, lcdSeed: number) {
  return pageOwnedTokenIds(collection, owner, lcdSeed, MAX_PER_COLLECTION);
}

interface Hit {
  collection: Collection;
  tokenIds: string[];
  /** Exact number owned — may exceed tokenIds.length, which is display-capped. */
  count: number;
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
      const { count, ids } = await ownedTokenIds(collections[i].address, owner, slot);
      if (count > 0) hits.push({ collection: collections[i], tokenIds: ids, count });
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
  deadline = Infinity,
): Promise<NftItem> {
  // Past the wall-clock budget, don't start new network work — return a
  // placeholder so the response can come back before the function times out.
  // The client still renders the tile and can load the image on demand.
  if (Date.now() > deadline) return { tokenId, name: null, image: null };

  // metadata_u_r_i → the token's IPFS metadata JSON URL.
  const uriBody = await getJson(
    smartQueryUrl(lcdFor(lcdSeed), collection, { metadata_u_r_i: { token_id: tokenId } }),
    8_000,
  );
  const uri: string | undefined = typeof uriBody?.data === 'string' ? uriBody.data : undefined;
  if (!uri) return { tokenId, name: null, image: null };

  // Resolve the JSON, trying only the fast gateways in turn (bounded so this
  // can't blow the function budget); the client retries images across all gateways.
  const jsonGateways = Math.min(METADATA_JSON_GATEWAYS, IPFS_GATEWAYS.length);
  for (let g = 0; g < jsonGateways; g++) {
    const meta = await getJson(resolveIpfs(uri, g), METADATA_JSON_TIMEOUT_MS);
    if (!meta) continue;
    const name: string | null = meta.title ?? meta.name ?? null;
    const rawImage: string | undefined = meta.media ?? meta.image ?? meta.image_url;
    return { tokenId, name, image: rawImage ? resolveImageUrl(rawImage) : null };
  }
  return { tokenId, name: null, image: null };
}

// ── Talis profile lookup ─────────────────────────────────────────────────────

// Talis profile URLs key on a Mongo id, not the raw address (/profile/<address>
// resolves to nothing). Talis's GraphQL maps address → profile id, but it sits
// behind Cloudflare, which 403s datacenter IPs — so a direct call from Vercel
// always fails. Instead we go through a small Cloudflare Worker (see
// cloudflare/talis-profile-proxy) whose egress is on Cloudflare's own network
// and passes Talis's bot protection. The Worker is gated by a shared secret.
//
// When the proxy env vars are unset the lookup is skipped and callers fall back
// to the collection link, so the portfolio works with or without the Worker.
async function resolveTalisProfileId(address: string): Promise<string | null> {
  const proxyUrl = process.env.TALIS_PROXY_URL;
  const proxySecret = process.env.TALIS_PROXY_SECRET;
  if (!proxyUrl || !proxySecret) return null;
  try {
    const res = await fetch(`${proxyUrl}?address=${encodeURIComponent(address)}`, {
      headers: { Authorization: `Bearer ${proxySecret}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body?.id === 'string' && body.id ? body.id : null;
  } catch {
    return null;
  }
}

// ── Public entry point ───────────────────────────────────────────────────────

export async function buildPortfolio(address: string): Promise<Portfolio> {
  const started = Date.now();
  const collections = await getCollections();

  // Ownership scan and the profile-id lookup are independent — run them together.
  const [{ hits, scanned, partial }, talisProfileId] = await Promise.all([
    scanOwnership(address, collections),
    resolveTalisProfileId(address),
  ]);

  // Whatever the scan consumed, metadata resolution must stop by this mark so the
  // whole request returns before the route's maxDuration (see OVERALL_TIME_BUDGET_MS).
  const metaDeadline = started + OVERALL_TIME_BUDGET_MS;

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
          (id, idx) => fetchTokenMeta(hit.collection.address, id, idx, metaDeadline),
        )
      : [];
    return {
      address: hit.collection.address,
      name: v?.name ?? hit.collection.name, // verified name wins over on-chain string
      symbol: hit.collection.symbol,
      count: hit.count,
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
    talisProfileId,
    totalNfts,
    collectionsScanned: scanned,
    collectionsKnown: collections.length,
    partial,
    holdings,
  };
}

export interface CollectionItems {
  address: string;
  /** Exact number owned. */
  count: number;
  /** Metadata resolved for up to MAX_EXPAND_ITEMS of them. */
  items: NftItem[];
  /** True when the owner holds more than we resolve images for. */
  truncated: boolean;
}

/**
 * Every NFT `owner` holds in a single `collection`, with metadata — the "show
 * all" expander. Unlike the portfolio scan this targets one contract, so it
 * pages the full owned set (bounded by MAX_EXPAND_ITEMS) and resolves an image
 * for each. Cheap enough to run on demand when a user expands a collection.
 */
export async function fetchCollectionItems(
  owner: string,
  collection: string,
): Promise<CollectionItems> {
  const started = Date.now();
  const { count, ids } = await pageOwnedTokenIds(collection, owner, 0, MAX_EXPAND_ITEMS);
  const deadline = started + OVERALL_TIME_BUDGET_MS;
  const items = await mapWithConcurrency(ids, METADATA_CONCURRENCY, (id, idx) =>
    fetchTokenMeta(collection, id, idx, deadline),
  );
  return { address: collection, count, items, truncated: count > ids.length };
}
