import { INDEXER_BASE, fetchJsonOverHttps } from '../injective';

export type FeedEventKind = 'perp_open' | 'liquidation';

export interface FeedCandidate {
  kind: FeedEventKind;
  /** Unique per aggressing order — the dedup key. */
  orderHash: string;
  /** Tx hash (lowercase hex, no 0x). Empty until resolveTxHash() succeeds. */
  hash: string;
  executedAt: number; // ms
  blockHeight: number;
  marketId: string;
  ticker: string;
  baseSymbol: string;
  quoteSymbol: string;
  direction: 'long' | 'short' | null;
  notionalUsd: number; // Σ price × quantity across fills (USDT/USDC ≈ USD)
  marginUsd: number | null;
  leverage: number | null;
  price: number | null; // volume-weighted average fill price
  quantity: number | null;
  /** Liquidations: realized PnL of the wiped position (negative). */
  pnlUsd: number | null;
  subaccountId: string;
  isTradFi: boolean;
}

// If the checkpoint is missing (first run / state loss), only look back this
// far instead of backfilling old history.
const FIRST_RUN_LOOKBACK_MS = 10 * 60 * 1000;

// ── Derivative market registry, loaded live from the indexer ──
// 284+ active markets; resolved dynamically rather than hardcoded.

interface DerivativeMarketInfo {
  marketId: string;
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
      marketId,
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

// ── Trade discovery ──
// Orders match in the EndBlocker (frequent batch auction), so fills never
// appear in tx events — the indexer trades endpoint is the only ground truth
// for executed trades. It requires market filters; we chunk all active
// market ids into a few calls.

const MARKETIDS_PER_CALL = 40;

interface IndexerTrade {
  orderHash: string;
  subaccountId: string;
  marketId: string;
  tradeExecutionType: string;
  isLiquidation: boolean;
  positionDelta?: {
    tradeDirection: string;
    executionPrice: string;
    executionQuantity: string;
    executionMargin: string;
  };
  payout: string;
  pnl?: string;
  executedAt: number;
  tradeId: string;
  executionSide: string;
}

async function fetchTradesChunk(marketIds: string[]): Promise<IndexerTrade[]> {
  const params = marketIds.map(id => `marketIds=${id}`).join('&');
  const result = await fetchJsonOverHttps(
    `${INDEXER_BASE}/api/exchange/derivative/v1/trades?${params}&limit=100`,
  );
  const trades = result?.body?.trades;
  return Array.isArray(trades) ? trades : [];
}

export interface PollResult {
  candidates: FeedCandidate[];
  /** Newest executedAt seen (ms) — the next checkpoint. */
  maxTimestamp: number;
  scanned: number;
}

export async function pollCandidates(sinceMs: number): Promise<PollResult> {
  const markets = await loadMarkets();
  const ids = [...markets.keys()];

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += MARKETIDS_PER_CALL) {
    chunks.push(ids.slice(i, i + MARKETIDS_PER_CALL));
  }
  const results = await Promise.all(chunks.map(fetchTradesChunk));
  const trades = results.flat();

  let maxTimestamp = sinceMs;
  for (const t of trades) {
    if (t.executedAt > maxTimestamp) maxTimestamp = t.executedAt;
  }
  const effectiveSince = sinceMs > 0 ? sinceMs : maxTimestamp - FIRST_RUN_LOOKBACK_MS;

  // A single aggressing order fills as one trade row per maker matched —
  // aggregate by orderHash or a whale order fragments into small fills.
  const groups = new Map<string, IndexerTrade[]>();
  for (const t of trades) {
    if (t.executedAt <= effectiveSince) continue;
    const interesting = t.isLiquidation || t.executionSide === 'taker';
    if (!interesting || !t.positionDelta || !t.orderHash) continue;
    const group = groups.get(t.orderHash);
    if (group) group.push(t);
    else groups.set(t.orderHash, [t]);
  }

  const candidates: FeedCandidate[] = [];
  for (const fills of groups.values()) {
    const first = fills[0];
    const market = markets.get((first.marketId ?? '').toLowerCase());
    if (!market) continue;

    const scale = Math.pow(10, market.quoteDecimals);
    let quantity = 0;
    let notional = 0;
    let margin = 0;
    let pnl = 0;
    let executedAt = 0;
    for (const t of fills) {
      const p = parseFloat(t.positionDelta!.executionPrice ?? '0') / scale;
      const q = parseFloat(t.positionDelta!.executionQuantity ?? '0');
      if (p <= 0 || q <= 0) continue;
      quantity += q;
      notional += p * q;
      margin += parseFloat(t.positionDelta!.executionMargin ?? '0') / scale;
      pnl += parseFloat(t.pnl ?? '0') / scale;
      if (t.executedAt > executedAt) executedAt = t.executedAt;
    }
    if (quantity <= 0 || notional <= 0) continue;

    const isLiquidation = first.isLiquidation;
    // margin == 0 on a non-liquidation taker fill means reduce-only (closing) —
    // "closed position" posts with PnL are M4 territory
    if (!isLiquidation && margin <= 0) continue;

    const tradeDir = (first.positionDelta!.tradeDirection ?? '').toLowerCase();
    // For liquidations the forced trade closes the position, so the wiped
    // position's side is the opposite of the trade direction.
    const direction: FeedCandidate['direction'] =
      tradeDir === 'buy' ? (isLiquidation ? 'short' : 'long')
      : tradeDir === 'sell' ? (isLiquidation ? 'long' : 'short')
      : null;

    candidates.push({
      kind: isLiquidation ? 'liquidation' : 'perp_open',
      orderHash: first.orderHash.toLowerCase(),
      hash: '',
      executedAt,
      blockHeight: parseInt((first.tradeId ?? '0').split('_')[0], 10) || 0,
      marketId: market.marketId,
      ticker: market.ticker,
      baseSymbol: market.baseSymbol,
      quoteSymbol: market.quoteSymbol,
      direction,
      notionalUsd: notional,
      marginUsd: margin > 0 ? margin : null,
      leverage: margin > 0 ? notional / margin : null,
      price: notional / quantity,
      quantity,
      pnlUsd: isLiquidation && pnl !== 0 ? pnl : null,
      subaccountId: (first.subaccountId ?? '').toLowerCase(),
      isTradFi: market.isTradFi,
    });
  }

  candidates.sort((a, b) => b.notionalUsd - a.notionalUsd);
  return { candidates, maxTimestamp, scanned: trades.length };
}

// ── Tx hash resolution ──
// Trades don't carry a tx hash. The aggressing order (taker) or the
// liquidator's MsgLiquidatePosition landed in the block the trade executed
// in, and its message JSON names the subaccount — find it there. Called only
// for candidates that passed thresholds, so it's one call per whale.

export async function resolveTxHash(c: FeedCandidate): Promise<string | null> {
  if (!c.blockHeight) return null;
  const result = await fetchJsonOverHttps(
    `${INDEXER_BASE}/api/explorer/v1/blocks/${c.blockHeight}`,
  );
  const txs: any[] = result?.body?.data?.txs ?? result?.body?.txs ?? [];
  for (const tx of txs) {
    if ((tx.code ?? 0) !== 0) continue;
    const messages = JSON.stringify(tx.messages ?? '');
    if (messages.toLowerCase().includes(c.subaccountId)) {
      return (tx.hash as string).replace(/^0x/i, '').toLowerCase();
    }
  }
  return null;
}
