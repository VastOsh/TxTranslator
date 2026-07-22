import { INDEXER_BASE, fetchJsonOverHttps } from '../injective';
import { loadMarkets } from '../feed/watch';

// ── Perp trading track record for a single inj1 address ──
//
// Two classes of number live in here and they are NOT equally trustworthy:
//
//   Window totals (realized PnL, fees, volume) come from summing the chain's
//   own per-fill `pnl` and `fee` fields. They are exact for whatever window we
//   fetched, no position state required.
//
//   Round trips (win rate, avg win/loss, hold time) require replaying fills
//   into position state. A position opened BEFORE the fetch window has no
//   observable entry, so closing it would invent a bogus trade. Those are
//   counted separately as `orphanCloses` and kept out of the stats — their PnL
//   still lands in the window totals, which is why the two can disagree.

export interface PnlTrade {
  ticker: string;
  direction: 'long' | 'short';
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  grossPnlUsd: number;
  feesUsd: number;
  netPnlUsd: number;
  volumeUsd: number;
  fills: number;
  openedAt: number;
  closedAt: number;
}

export interface PnlMarketRow {
  ticker: string;
  grossPnlUsd: number;
  feesUsd: number;
  netPnlUsd: number;
  volumeUsd: number;
  fills: number;
}

export interface PnlOpenPosition {
  ticker: string;
  direction: 'long' | 'short';
  quantity: number;
  entryPrice: number;
  markPrice: number;
  notionalUsd: number;
  marginUsd: number;
  leverage: number | null;
  liquidationPrice: number | null;
  unrealizedPnlUsd: number;
}

export interface PnlReport {
  address: string;
  /** Requested lookback in days; null = as far back as the fill cap allows. */
  rangeDays: number | null;
  windowFrom: number;
  windowTo: number;
  /** True when the fill cap cut the window short — stats cover less than asked. */
  truncated: boolean;

  fills: number;
  volumeUsd: number;
  grossPnlUsd: number;
  feesUsd: number;
  netPnlUsd: number;

  roundTrips: number;
  wins: number;
  losses: number;
  winRate: number | null;
  avgWinUsd: number | null;
  avgLossUsd: number | null;
  profitFactor: number | null;
  bestUsd: number | null;
  worstUsd: number | null;
  avgHoldMs: number | null;
  /** Closes whose opening predates the window — excluded from the stats above. */
  orphanCloses: number;
  orphanPnlUsd: number;

  marketsTraded: number;
  markets: PnlMarketRow[];
  trades: PnlTrade[];
  openPositions: PnlOpenPosition[];
  unrealizedPnlUsd: number;
  equityCurve: Array<{ t: number; v: number }>;
}

interface IndexerTrade {
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
  fee?: string;
  pnl?: string;
  executedAt: number;
  tradeId: string;
  executionSide: string;
}

interface IndexerPosition {
  ticker?: string;
  marketId?: string;
  direction?: string;
  quantity?: string;
  entryPrice?: string;
  markPrice?: string;
  margin?: string;
  liquidationPrice?: string;
}

const FILLS_PER_PAGE = 1000;
// Six sequential pages ≈ 6s against the indexer — the ceiling that keeps the
// route inside its time budget. Market makers blow through this in hours;
// they get a truncated window and a banner saying so.
const MAX_PAGES = 6;
const EPS = 1e-9;
const CURVE_POINTS = 160;
const MAX_TRADES_RETURNED = 100;

export const PNL_RANGES: Record<string, number | null> = {
  '24h': 1,
  '7d': 7,
  '30d': 30,
  all: null,
};

async function fetchFillPage(address: string, endTime: number, startTime: number | null): Promise<IndexerTrade[]> {
  const params = [
    `accountAddress=${address}`,
    `limit=${FILLS_PER_PAGE}`,
    `endTime=${endTime}`,
    ...(startTime ? [`startTime=${startTime}`] : []),
  ].join('&');
  const result = await fetchJsonOverHttps(
    `${INDEXER_BASE}/api/exchange/derivative/v1/trades?${params}`,
  );
  const trades = result?.body?.trades;
  return Array.isArray(trades) ? trades : [];
}

/** Walks fills backwards in time, newest first, until the cap or the range end. */
async function fetchFills(address: string, startTime: number | null) {
  const fills: IndexerTrade[] = [];
  const seen = new Set<string>();
  let cursor = Date.now();
  let truncated = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await fetchFillPage(address, cursor, startTime);
    if (batch.length === 0) break;

    let added = 0;
    let oldest = Infinity;
    for (const t of batch) {
      const key = `${t.tradeId}:${t.subaccountId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      fills.push(t);
      added++;
      if (t.executedAt < oldest) oldest = t.executedAt;
    }
    // A full page that added nothing new means the cursor stopped advancing.
    if (added === 0) break;
    cursor = oldest - 1;
    if (page === MAX_PAGES - 1 && batch.length === FILLS_PER_PAGE) truncated = true;
  }

  fills.sort((a, b) => a.executedAt - b.executedAt || (a.tradeId > b.tradeId ? 1 : -1));
  return { fills, truncated };
}

async function fetchOpenPositions(
  address: string,
  markets: Awaited<ReturnType<typeof loadMarkets>>,
): Promise<PnlOpenPosition[]> {
  const result = await fetchJsonOverHttps(
    `${INDEXER_BASE}/api/exchange/derivative/v1/positions?accountAddress=${address}`,
  );
  const raw: IndexerPosition[] = result?.body?.positions ?? [];
  const out: PnlOpenPosition[] = [];

  for (const p of raw) {
    const market = markets.get((p.marketId ?? '').toLowerCase());
    const scale = Math.pow(10, market?.quoteDecimals ?? 6);
    const quantity = parseFloat(p.quantity ?? '0');
    const entryPrice = parseFloat(p.entryPrice ?? '0') / scale;
    const markPrice = parseFloat(p.markPrice ?? '0') / scale;
    const margin = parseFloat(p.margin ?? '0') / scale;
    if (!(quantity > 0) || !(entryPrice > 0)) continue;

    const direction = p.direction === 'short' ? 'short' : 'long';
    const side = direction === 'long' ? 1 : -1;
    const notional = markPrice > 0 ? markPrice * quantity : entryPrice * quantity;
    const liq = parseFloat(p.liquidationPrice ?? '0') / scale;

    out.push({
      ticker: market?.ticker ?? p.ticker ?? 'Unknown',
      direction,
      quantity,
      entryPrice,
      markPrice,
      notionalUsd: notional,
      marginUsd: margin,
      leverage: margin > 0 ? notional / margin : null,
      liquidationPrice: liq > 0 ? liq : null,
      unrealizedPnlUsd: markPrice > 0 ? (markPrice - entryPrice) * quantity * side : 0,
    });
  }

  out.sort((a, b) => b.notionalUsd - a.notionalUsd);
  return out;
}

/** Running position for one (subaccount, market) pair while replaying fills. */
interface Book {
  qty: number; // signed: positive long, negative short
  entryNotional: number;
  openQty: number;
  openedAt: number;
  direction: 'long' | 'short' | null;
  grossPnl: number;
  fees: number;
  volume: number;
  fills: number;
  /** False when the position was already open when the window started. */
  sawOpen: boolean;
}

function emptyBook(): Book {
  return {
    qty: 0, entryNotional: 0, openQty: 0, openedAt: 0, direction: null,
    grossPnl: 0, fees: 0, volume: 0, fills: 0, sawOpen: false,
  };
}

function downsample(points: Array<{ t: number; v: number }>): Array<{ t: number; v: number }> {
  if (points.length <= CURVE_POINTS) return points;
  const step = points.length / CURVE_POINTS;
  const out: Array<{ t: number; v: number }> = [];
  for (let i = 0; i < CURVE_POINTS; i++) out.push(points[Math.floor(i * step)]);
  // The last point is the current total — never drop it to a bucket boundary.
  out.push(points[points.length - 1]);
  return out;
}

export async function buildPnlReport(address: string, rangeKey: string): Promise<PnlReport> {
  const rangeDays = rangeKey in PNL_RANGES ? PNL_RANGES[rangeKey] : 7;
  const startTime = rangeDays ? Date.now() - rangeDays * 86_400_000 : null;

  const markets = await loadMarkets();
  const [{ fills, truncated }, openPositions] = await Promise.all([
    fetchFills(address, startTime),
    fetchOpenPositions(address, markets),
  ]);

  const books = new Map<string, Book>();
  const closed: PnlTrade[] = [];
  const byMarket = new Map<string, PnlMarketRow>();
  const curve: Array<{ t: number; v: number }> = [];

  let volumeUsd = 0;
  let grossPnlUsd = 0;
  let feesUsd = 0;
  let counted = 0;
  let orphanCloses = 0;
  let orphanPnlUsd = 0;

  for (const t of fills) {
    // 'synthetic' rows are the RFQ contract shuffling a fill between its own
    // subaccounts, not a trade this address chose to make — same exclusion the
    // whale feed makes, for the same reason.
    if (t.tradeExecutionType === 'synthetic') continue;
    const market = markets.get((t.marketId ?? '').toLowerCase());
    if (!market || !t.positionDelta) continue;

    const scale = Math.pow(10, market.quoteDecimals);
    const price = parseFloat(t.positionDelta.executionPrice ?? '0') / scale;
    const qty = parseFloat(t.positionDelta.executionQuantity ?? '0');
    if (!(price > 0) || !(qty > 0)) continue;

    const fee = (parseFloat(t.fee ?? '0') || 0) / scale;
    const pnl = (parseFloat(t.pnl ?? '0') || 0) / scale;
    const sign = t.positionDelta.tradeDirection === 'buy' ? 1 : -1;
    const notional = price * qty;

    volumeUsd += notional;
    grossPnlUsd += pnl;
    feesUsd += fee;
    counted++;
    curve.push({ t: t.executedAt, v: grossPnlUsd - feesUsd });

    const row = byMarket.get(market.ticker) ?? {
      ticker: market.ticker, grossPnlUsd: 0, feesUsd: 0, netPnlUsd: 0, volumeUsd: 0, fills: 0,
    };
    row.grossPnlUsd += pnl;
    row.feesUsd += fee;
    row.netPnlUsd = row.grossPnlUsd - row.feesUsd;
    row.volumeUsd += notional;
    row.fills++;
    byMarket.set(market.ticker, row);

    const key = `${t.subaccountId}|${t.marketId}`;
    let book = books.get(key);
    if (!book) {
      book = emptyBook();
      books.set(key, book);
    }

    let remaining = qty;

    if (Math.abs(book.qty) > EPS && Math.sign(book.qty) !== sign) {
      // Reducing the open position — possibly flipping through zero.
      const reduced = Math.min(remaining, Math.abs(book.qty));
      const entryPrice = book.openQty > 0 ? book.entryNotional / book.openQty : price;
      book.qty += sign * reduced;
      remaining -= reduced;
      book.grossPnl += pnl;
      book.fees += fee;
      book.volume += price * reduced;
      book.fills++;

      if (Math.abs(book.qty) < EPS) {
        if (book.sawOpen && book.direction) {
          closed.push({
            ticker: market.ticker,
            direction: book.direction,
            quantity: book.openQty,
            entryPrice,
            exitPrice: price,
            grossPnlUsd: book.grossPnl,
            feesUsd: book.fees,
            netPnlUsd: book.grossPnl - book.fees,
            volumeUsd: book.volume,
            fills: book.fills,
            openedAt: book.openedAt,
            closedAt: t.executedAt,
          });
        } else {
          orphanCloses++;
          orphanPnlUsd += book.grossPnl;
        }
        book = emptyBook();
        books.set(key, book);
      }
    } else if (Math.abs(book.qty) < EPS && pnl !== 0) {
      // Realized PnL with no position on our books: the entry predates the
      // window. Counted in the totals above, excluded from round-trip stats.
      orphanCloses++;
      orphanPnlUsd += pnl;
      continue;
    }

    if (remaining > EPS) {
      if (Math.abs(book.qty) < EPS) {
        book.openedAt = t.executedAt;
        book.direction = sign > 0 ? 'long' : 'short';
        book.sawOpen = true;
        book.openQty = 0;
        book.entryNotional = 0;
      }
      book.qty += sign * remaining;
      book.openQty += remaining;
      book.entryNotional += price * remaining;
      book.volume += price * remaining;
      book.fees += fee;
      book.fills++;
    }
  }

  const wins = closed.filter(c => c.netPnlUsd > 0);
  const losses = closed.filter(c => c.netPnlUsd < 0);
  const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
  const winTotal = sum(wins.map(c => c.netPnlUsd));
  const lossTotal = Math.abs(sum(losses.map(c => c.netPnlUsd)));

  const timestamps = fills.map(f => f.executedAt);
  const recent = closed.slice().sort((a, b) => b.closedAt - a.closedAt).slice(0, MAX_TRADES_RETURNED);

  return {
    address,
    rangeDays,
    windowFrom: timestamps.length ? Math.min(...timestamps) : 0,
    windowTo: timestamps.length ? Math.max(...timestamps) : 0,
    truncated,

    fills: counted,
    volumeUsd,
    grossPnlUsd,
    feesUsd,
    netPnlUsd: grossPnlUsd - feesUsd,

    roundTrips: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length ? (wins.length / closed.length) * 100 : null,
    avgWinUsd: wins.length ? winTotal / wins.length : null,
    avgLossUsd: losses.length ? -lossTotal / losses.length : null,
    profitFactor: lossTotal > 0 ? winTotal / lossTotal : null,
    bestUsd: closed.length ? Math.max(...closed.map(c => c.netPnlUsd)) : null,
    worstUsd: closed.length ? Math.min(...closed.map(c => c.netPnlUsd)) : null,
    avgHoldMs: closed.length ? sum(closed.map(c => c.closedAt - c.openedAt)) / closed.length : null,
    orphanCloses,
    orphanPnlUsd,

    marketsTraded: byMarket.size,
    markets: [...byMarket.values()].sort((a, b) => Math.abs(b.netPnlUsd) - Math.abs(a.netPnlUsd)),
    trades: recent,
    openPositions,
    unrealizedPnlUsd: sum(openPositions.map(p => p.unrealizedPnlUsd)),
    equityCurve: downsample(curve),
  };
}
