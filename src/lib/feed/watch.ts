import { LCD_ENDPOINTS, INDEXER_BASE, fetchJsonOverHttps } from '../injective';

export type FeedEventKind = 'perp_open' | 'liquidation';

export interface FeedCandidate {
  kind: FeedEventKind;
  hash: string; // lowercase hex, no 0x prefix
  height: number;
  timestamp: string;
  marketId: string;
  ticker: string;
  baseSymbol: string;
  quoteSymbol: string;
  direction: 'long' | 'short' | null;
  notionalUsd: number; // quantity × price in quote units (USDT/USDC ≈ USD)
  marginUsd: number | null;
  leverage: number | null;
  price: number | null;
  quantity: number | null;
  subaccountId: string | null; // liquidations: the rekt party, for M4 enrichment
  isTradFi: boolean;
}

// If the checkpoint is missing (first run / state loss), only look back this
// many blocks (~10 min at 1.5s/block) instead of backfilling old history.
const FIRST_RUN_LOOKBACK_BLOCKS = 400;

const PERP_OPEN_ACTIONS = [
  '/injective.exchange.v2.MsgCreateDerivativeMarketOrder',
  '/injective.exchange.v1beta1.MsgCreateDerivativeMarketOrder',
];

const LIQUIDATION_ACTIONS = [
  '/injective.exchange.v2.MsgLiquidatePosition',
  '/injective.exchange.v1beta1.MsgLiquidatePosition',
];

// ── Derivative market registry, loaded live from the indexer ──
// 284+ active markets; the static HELIX_DERIVATIVE_MARKETS registry only
// covers a handful, so the feed resolves tickers dynamically instead.

interface DerivativeMarketInfo {
  ticker: string;
  baseSymbol: string;
  quoteSymbol: string;
  quoteDecimals: number;
  isTradFi: boolean;
}

// Stocks price via SEDA ("sedafast"), FX/commodities via Pyth Pro ("pythpro");
// crypto perps use chainlinkdatastreams/pyth/band. TradFi = the former two.
const TRADFI_ORACLE_TYPES = new Set(['sedafast', 'pythpro']);

let marketCache: Map<string, DerivativeMarketInfo> | null = null;
let marketCacheAt = 0;
const MARKET_CACHE_TTL_MS = 60 * 60 * 1000;

async function loadMarkets(): Promise<Map<string, DerivativeMarketInfo>> {
  if (marketCache && Date.now() - marketCacheAt < MARKET_CACHE_TTL_MS) {
    return marketCache;
  }
  const result = await fetchJsonOverHttps(
    `${INDEXER_BASE}/api/exchange/derivative/v1/markets?market_status=active`,
  );
  const markets: any[] = result?.body?.markets ?? [];
  if (markets.length === 0) {
    // Keep serving a stale cache over an empty one
    return marketCache ?? new Map();
  }

  const map = new Map<string, DerivativeMarketInfo>();
  for (const entry of markets) {
    const m = entry.market ?? entry;
    const marketId: string = (m.marketId ?? '').toLowerCase();
    const ticker: string = m.ticker ?? '';
    if (!marketId || !ticker) continue;
    map.set(marketId, {
      ticker,
      baseSymbol: ticker.split('/')[0] ?? ticker,
      quoteSymbol: m.quoteTokenMeta?.symbol ?? 'USD',
      quoteDecimals: m.quoteTokenMeta?.decimals ?? 6,
      isTradFi: TRADFI_ORACLE_TYPES.has(m.oracleType ?? ''),
    });
  }
  marketCache = map;
  marketCacheAt = Date.now();
  return map;
}

// ── LCD tx search ──

interface RawTxHit {
  hash: string;
  height: number;
  code: number;
  timestamp: string;
  messages: Array<{ '@type': string; [key: string]: any }>;
  events: Array<{ type: string; attributes: Array<{ key: string; value: string }> }>;
}

async function searchTxsFromEndpoint(base: string, action: string): Promise<RawTxHit[] | null> {
  const query = encodeURIComponent(`message.action='${action}'`);
  const url = `${base}/cosmos/tx/v1beta1/txs?query=${query}&order_by=ORDER_BY_DESC&pagination.limit=50`;
  const result = await fetchJsonOverHttps(url);
  if (!result || result.status !== 200) return null;
  const txs: any[] = result.body?.txs;
  const responses: any[] = result.body?.tx_responses;
  if (!Array.isArray(txs) || !Array.isArray(responses)) return null;

  const hits: RawTxHit[] = [];
  for (let i = 0; i < responses.length; i++) {
    const r = responses[i];
    const t = txs[i];
    if (!r?.txhash || !t?.body?.messages) continue;
    hits.push({
      hash: (r.txhash as string).toLowerCase(),
      height: parseInt(r.height ?? '0', 10),
      code: r.code ?? 0,
      timestamp: r.timestamp ?? '',
      messages: t.body.messages,
      events: r.events ?? [],
    });
  }
  return hits;
}

async function searchTxs(action: string): Promise<RawTxHit[]> {
  // Race all LCD endpoints — same pattern as fetchTransaction. Endpoints on
  // older gateways that reject the `query=` param simply lose the race.
  const result = await Promise.any(
    LCD_ENDPOINTS.map(base =>
      searchTxsFromEndpoint(base, action).then(r => {
        if (r === null) throw new Error('no result');
        return r;
      })
    )
  ).catch(() => [] as RawTxHit[]);
  return result;
}

// ── Candidate extraction ──

function unwrapAuthz(messages: any[]): any[] {
  const out: any[] = [];
  for (const m of messages) {
    if (m['@type'] === '/cosmos.authz.v1beta1.MsgExec' && Array.isArray(m.msgs)) {
      out.push(...m.msgs);
    } else {
      out.push(m);
    }
  }
  return out;
}

// Trade objects inside EventBatchDerivativeExecution differ between chain
// versions; probe both flat and position_delta shapes.
function tradeFromEvents(
  events: RawTxHit['events'],
  marketId: string,
): { price: number; quantity: number; isLong: boolean | null } | null {
  for (const ev of events) {
    if (!ev.type.includes('DerivativeExecution')) continue;
    const attrs: Record<string, string> = {};
    for (const a of ev.attributes) attrs[a.key] = a.value;
    const tradesRaw = attrs['trades'] ?? attrs['_trades'];
    if (!tradesRaw) continue;
    try {
      const trades = JSON.parse(tradesRaw);
      if (!Array.isArray(trades)) continue;
      for (const t of trades) {
        const tMarket = (t.market_id ?? t.marketId ?? '').toLowerCase();
        if (tMarket && tMarket !== marketId) continue;
        const price = parseFloat(t.price ?? t.position_delta?.execution_price ?? '0');
        const quantity = parseFloat(t.quantity ?? t.position_delta?.execution_quantity ?? '0');
        if (price <= 0 || quantity <= 0) continue;
        const dirRaw = (t.position_delta?.trade_direction ?? '').toString().toLowerCase();
        const isLong = t.position_delta?.is_long ?? (dirRaw ? dirRaw.includes('buy') || dirRaw.includes('long') : null);
        return { price, quantity, isLong: typeof isLong === 'boolean' ? isLong : null };
      }
    } catch { /* malformed attribute — keep scanning */ }
  }
  return null;
}

function extractPerpOpen(hit: RawTxHit, markets: Map<string, DerivativeMarketInfo>): FeedCandidate | null {
  const msg = unwrapAuthz(hit.messages).find(m =>
    PERP_OPEN_ACTIONS.includes(m['@type'] ?? '')
  );
  const order = msg?.order;
  if (!order?.order_info) return null;

  const marketId = (order.market_id ?? '').toLowerCase();
  const market = markets.get(marketId);
  if (!market) return null;

  const scale = Math.pow(10, market.quoteDecimals);
  const margin = parseFloat(order.margin ?? order.order_info.margin ?? '0') / scale;
  // margin == 0 means reduce-only (closing a position) — closes are M4 territory
  if (margin <= 0) return null;

  const orderPrice = parseFloat(order.order_info.price ?? '0') / scale;
  const orderQty = parseFloat(order.order_info.quantity ?? '0');

  // Prefer the actual fill from execution events over the order's worst-price bound
  const fill = tradeFromEvents(hit.events, marketId);
  const price = fill ? fill.price / scale : orderPrice;
  const quantity = fill ? fill.quantity : orderQty;
  if (price <= 0 || quantity <= 0) return null;

  const notionalUsd = price * quantity;
  return {
    kind: 'perp_open',
    hash: hit.hash,
    height: hit.height,
    timestamp: hit.timestamp,
    marketId,
    ticker: market.ticker,
    baseSymbol: market.baseSymbol,
    quoteSymbol: market.quoteSymbol,
    direction: (order.order_type ?? '').toUpperCase().includes('BUY') ? 'long' : 'short',
    notionalUsd,
    marginUsd: margin,
    leverage: margin > 0 ? notionalUsd / margin : null,
    price,
    quantity,
    subaccountId: order.order_info.subaccount_id ?? null,
    isTradFi: market.isTradFi,
  };
}

function extractLiquidation(hit: RawTxHit, markets: Map<string, DerivativeMarketInfo>): FeedCandidate | null {
  const msg = unwrapAuthz(hit.messages).find(m =>
    LIQUIDATION_ACTIONS.includes(m['@type'] ?? '')
  );
  if (!msg) return null;

  const marketId = (msg.market_id ?? '').toLowerCase();
  const market = markets.get(marketId);
  if (!market) return null;

  // Position size only exists in the forced-trade execution event. No event
  // → no numbers → skip rather than post a weak alert.
  const fill = tradeFromEvents(hit.events, marketId);
  if (!fill) return null;

  const scale = Math.pow(10, market.quoteDecimals);
  const price = fill.price / scale;
  const quantity = fill.quantity;
  if (price <= 0 || quantity <= 0) return null;

  return {
    kind: 'liquidation',
    hash: hit.hash,
    height: hit.height,
    timestamp: hit.timestamp,
    marketId,
    ticker: market.ticker,
    baseSymbol: market.baseSymbol,
    quoteSymbol: market.quoteSymbol,
    // The liquidated position's side is the opposite of the forced closing trade
    direction: fill.isLong === null ? null : fill.isLong ? 'short' : 'long',
    notionalUsd: price * quantity,
    marginUsd: null,
    leverage: null,
    price,
    quantity,
    subaccountId: msg.subaccount_id ?? null,
    isTradFi: market.isTradFi,
  };
}

export interface PollResult {
  candidates: FeedCandidate[];
  maxHeight: number;
  scanned: number;
}

export async function pollCandidates(sinceHeight: number): Promise<PollResult> {
  const markets = await loadMarkets();

  const searches = [...PERP_OPEN_ACTIONS, ...LIQUIDATION_ACTIONS].map(a => searchTxs(a));
  const results = await Promise.all(searches);

  // Dedupe by hash across the v2/v1beta1 query pairs
  const byHash = new Map<string, { hit: RawTxHit; kind: FeedEventKind }>();
  results.forEach((hits, i) => {
    const kind: FeedEventKind = i < PERP_OPEN_ACTIONS.length ? 'perp_open' : 'liquidation';
    for (const hit of hits) {
      if (!byHash.has(hit.hash)) byHash.set(hit.hash, { hit, kind });
    }
  });

  let maxHeight = sinceHeight;
  for (const { hit } of byHash.values()) {
    if (hit.height > maxHeight) maxHeight = hit.height;
  }
  const effectiveSince = sinceHeight > 0 ? sinceHeight : maxHeight - FIRST_RUN_LOOKBACK_BLOCKS;

  const candidates: FeedCandidate[] = [];
  for (const { hit, kind } of byHash.values()) {
    if (hit.code !== 0) continue; // liquidation bots race; only the winner's tx is real
    if (hit.height <= effectiveSince) continue;
    const candidate = kind === 'perp_open'
      ? extractPerpOpen(hit, markets)
      : extractLiquidation(hit, markets);
    if (candidate) candidates.push(candidate);
  }

  candidates.sort((a, b) => b.notionalUsd - a.notionalUsd);
  return { candidates, maxHeight, scanned: byHash.size };
}
