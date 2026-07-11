import { INDEXER_BASE, fetchJsonOverHttps } from '../injective';

export type FeedEventKind = 'perp_open' | 'liquidation' | 'position_close';

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
  /** Liquidations/closes: realized PnL (negative for a wiped/losing position). */
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

// Stocks and oil price via SEDA ("sedafast") — that oracle is TradFi-only.
// FX and metals share "pythpro" with 200+ crypto perps (NEAR, ALGO, …), so
// they're recognized by ticker instead: fiat-code pairs like EURUSD/USDNOK
// plus spot metals XAU/XAG.
const FIAT_CODES = 'USD|EUR|GBP|AUD|NZD|CHF|CAD|JPY|NOK|SEK';
const FX_BASE_RE = new RegExp(`^(?:${FIAT_CODES})(?:${FIAT_CODES})$`);
const METAL_BASES = new Set(['XAU', 'XAG']);

function isTradFiMarket(oracleType: string, baseSymbol: string): boolean {
  if (oracleType === 'sedafast') return true;
  return FX_BASE_RE.test(baseSymbol) || METAL_BASES.has(baseSymbol);
}

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
    const baseSymbol = ticker.split('/')[0] ?? ticker;
    map.set(marketId, {
      marketId,
      ticker,
      baseSymbol,
      quoteSymbol: m.quoteTokenMeta?.symbol ?? 'USD',
      quoteDecimals: m.quoteTokenMeta?.decimals ?? 6,
      isTradFi: isTradFiMarket(m.oracleType ?? '', baseSymbol),
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
  // RFQ/contract-routed orders (e.g. accept_quote) carry an all-zero
  // orderHash; group those per block+subaccount+market+direction instead,
  // or unrelated whales worldwide would merge into one candidate and share
  // one dedup key.
  const ZERO_HASH_RE = /^0x0+$/;
  const groups = new Map<string, IndexerTrade[]>();
  for (const t of trades) {
    if (t.executedAt <= effectiveSince) continue;
    const interesting = t.isLiquidation || t.executionSide === 'taker';
    if (!interesting || !t.positionDelta || !t.orderHash) continue;
    const key = ZERO_HASH_RE.test(t.orderHash)
      ? `${(t.tradeId ?? '').split('_')[0]}:${(t.subaccountId ?? '').toLowerCase()}:${(t.marketId ?? '').toLowerCase()}:${t.positionDelta.tradeDirection ?? ''}`
      : t.orderHash.toLowerCase();
    const group = groups.get(key);
    if (group) group.push(t);
    else groups.set(key, [t]);
  }

  const candidates: FeedCandidate[] = [];
  for (const [groupKey, fills] of groups) {
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
    // margin == 0 on a non-liquidation taker fill means reduce-only: the
    // order closed a position, and pnl is the realized result
    const kind: FeedEventKind =
      isLiquidation ? 'liquidation' : margin > 0 ? 'perp_open' : 'position_close';

    const tradeDir = (first.positionDelta!.tradeDirection ?? '').toLowerCase();
    // Liquidations and closes are trades that exit a position, so the
    // position's side is the opposite of the trade direction.
    const exiting = kind !== 'perp_open';
    const direction: FeedCandidate['direction'] =
      tradeDir === 'buy' ? (exiting ? 'short' : 'long')
      : tradeDir === 'sell' ? (exiting ? 'long' : 'short')
      : null;

    candidates.push({
      kind,
      orderHash: groupKey,
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
      pnlUsd: exiting && pnl !== 0 ? pnl : null,
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
// in, and its message JSON names either the subaccount hex or — for
// contract-routed flows like RFQ accept_quote — only the trader's inj1…
// address, which is the subaccount's first 20 bytes bech32-encoded. Match
// on both. Called only for candidates that passed thresholds, so it's one
// call per whale.

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32Polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= GEN[i];
  }
  return chk;
}

/** First 20 bytes of a subaccount id → bech32 inj address (BIP-173). */
export function subaccountToInjAddress(subaccountId: string): string | null {
  const hex = subaccountId.replace(/^0x/, '').slice(0, 40);
  if (!/^[0-9a-f]{40}$/i.test(hex)) return null;
  const words: number[] = [];
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < 40; i += 2) {
    acc = (acc << 8) | parseInt(hex.slice(i, i + 2), 16);
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      words.push((acc >> bits) & 31);
    }
  }
  if (bits > 0) words.push((acc << (5 - bits)) & 31);
  const hrp = 'inj';
  const hrpExpanded = [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31)];
  const polymod = bech32Polymod([...hrpExpanded, ...words, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum = Array.from({ length: 6 }, (_, i) => (polymod >> (5 * (5 - i))) & 31);
  return `${hrp}1${[...words, ...checksum].map((w) => BECH32_CHARSET[w]).join('')}`;
}

export async function resolveTxHash(c: FeedCandidate): Promise<string | null> {
  if (!c.blockHeight) return null;
  const address = subaccountToInjAddress(c.subaccountId);
  const result = await fetchJsonOverHttps(
    `${INDEXER_BASE}/api/explorer/v1/blocks/${c.blockHeight}`,
  );
  const txs: any[] = result?.body?.data?.txs ?? result?.body?.txs ?? [];
  for (const tx of txs) {
    if ((tx.code ?? 0) !== 0) continue;
    const messages = JSON.stringify(tx.messages ?? '').toLowerCase();
    if (messages.includes(c.subaccountId) || (address && messages.includes(address))) {
      return (tx.hash as string).replace(/^0x/i, '').toLowerCase();
    }
  }
  return null;
}
