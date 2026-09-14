import { put, get } from '@vercel/blob';
import { INDEXER_BASE, fetchJsonOverHttps } from '../injective';
import { loadMarkets } from '../feed/watch';
import { readRollup } from '../leaderboard/store';

// ── Smart Money Positions ────────────────────────────────────────────────────
// The leaderboard says WHO is profitable. This says what those wallets are
// holding right now. It takes the top traders by realized net PnL over the last
// 30 days and reads each one's live open perpetual positions straight from the
// exchange module (one call per trader, across all their subaccounts), then
// aggregates the book into a per-market read: how much of the smart-money
// notional is long vs short in each market.
//
// Unlike a whole-market skew, this is a real directional signal: it sums only a
// chosen subset of wallets, whose longs and shorts do not have to balance. Every
// number is live and on-chain (entry, mark, margin and the chain's own
// liquidation price); unrealized PnL is mark minus entry times size. Honest
// framing: these are the realized-PnL leaders, and it is a snapshot in time, not
// a recommendation.

/* eslint-disable @typescript-eslint/no-explicit-any */

const SNAP_PATH = 'smart-positions/snapshot-v1.json';
const TOP_TRADERS = 60;      // top wallets by 30d realized net PnL
const POS_CONCURRENCY = 8;
const MIN_NOTIONAL = 100;    // ignore dust positions below $100
const MAX_POSITIONS = 300;   // cap stored rows to bound the blob
const KEEP_MARKETS = 60;

export interface SmartPosition {
  address: string;
  marketId: string;
  ticker: string;
  direction: 'long' | 'short';
  notionalUsd: number;
  entryPrice: number;
  markPrice: number;
  liqPrice: number | null;
  liqDistancePct: number | null;
  uPnlUsd: number;
  leverage: number | null;
  isTradFi: boolean;
}

export interface SmartMarketAgg {
  marketId: string;
  ticker: string;
  longNotionalUsd: number;
  shortNotionalUsd: number;
  netNotionalUsd: number;    // long minus short: positive = net long
  longTraders: number;
  shortTraders: number;
  isTradFi: boolean;
}

export interface SmartPositionsSnapshot {
  asOf: number;
  tradersScanned: number;    // top wallets we read
  tradersWithPositions: number;
  positionCount: number;
  markets: SmartMarketAgg[];
  positions: SmartPosition[];
}

function blobToken(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN;
}

async function pool<T>(items: T[], workers: number, fn: (x: T) => Promise<void>): Promise<void> {
  let next = 0;
  async function run() {
    while (next < items.length) await fn(items[next++]);
  }
  await Promise.all(Array.from({ length: Math.min(workers, items.length) }, run));
}

async function fetchAccountPositions(addr: string): Promise<any[]> {
  const all: any[] = [];
  for (let page = 0; page < 3; page++) {
    const res = await fetchJsonOverHttps(
      `${INDEXER_BASE}/api/exchange/derivative/v1/positions?accountAddress=${addr}&limit=100&skip=${page * 100}`,
    );
    const ps: any[] = res?.body?.positions ?? [];
    all.push(...ps);
    if (ps.length < 100) break;
  }
  return all;
}

export async function buildSmartPositions(store = true): Promise<SmartPositionsSnapshot> {
  const rollup = await readRollup();
  const rows = rollup?.ranges['30d'].rows ?? [];
  const addresses = rows
    .filter((r) => r.netPnlUsd > 0)
    .sort((a, b) => b.netPnlUsd - a.netPnlUsd)
    .slice(0, TOP_TRADERS)
    .map((r) => r.address);

  const markets = await loadMarkets();
  const positions: SmartPosition[] = [];
  let tradersWithPositions = 0;

  await pool(addresses, POS_CONCURRENCY, async (addr) => {
    const raw = await fetchAccountPositions(addr);
    let had = false;
    for (const p of raw) {
      const m = markets.get(String(p.marketId ?? '').toLowerCase());
      if (!m) continue;
      const scale = 10 ** m.quoteDecimals;
      const qty = Number(p.quantity) || 0;
      const mark = (Number(p.markPrice) || 0) / scale;
      const entry = (Number(p.entryPrice) || 0) / scale;
      const notionalUsd = qty * mark;
      if (!(notionalUsd >= MIN_NOTIONAL) || mark <= 0) continue;
      const direction: 'long' | 'short' = p.direction === 'short' ? 'short' : 'long';
      const sign = direction === 'long' ? 1 : -1;
      const marginUsd = (Number(p.margin) || 0) / scale;
      const liqRaw = (Number(p.liquidationPrice) || 0) / scale;
      const liqPrice = liqRaw > 0 ? liqRaw : null;
      positions.push({
        address: addr,
        marketId: m.marketId,
        ticker: m.ticker,
        direction,
        notionalUsd,
        entryPrice: entry,
        markPrice: mark,
        liqPrice,
        liqDistancePct: liqPrice ? (Math.abs(liqPrice - mark) / mark) * 100 : null,
        uPnlUsd: qty * (mark - entry) * sign,
        leverage: marginUsd > 0 ? notionalUsd / marginUsd : null,
        isTradFi: m.isTradFi,
      });
      had = true;
    }
    if (had) tradersWithPositions++;
  });

  // Per-market aggregate over the smart-money book.
  const aggMap = new Map<string, SmartMarketAgg & { longSet: Set<string>; shortSet: Set<string> }>();
  for (const p of positions) {
    let a = aggMap.get(p.marketId);
    if (!a) {
      a = {
        marketId: p.marketId, ticker: p.ticker, isTradFi: p.isTradFi,
        longNotionalUsd: 0, shortNotionalUsd: 0, netNotionalUsd: 0,
        longTraders: 0, shortTraders: 0, longSet: new Set(), shortSet: new Set(),
      };
      aggMap.set(p.marketId, a);
    }
    if (p.direction === 'long') { a.longNotionalUsd += p.notionalUsd; a.longSet.add(p.address); }
    else { a.shortNotionalUsd += p.notionalUsd; a.shortSet.add(p.address); }
  }
  const marketsAgg: SmartMarketAgg[] = [...aggMap.values()]
    .map((a) => ({
      marketId: a.marketId, ticker: a.ticker, isTradFi: a.isTradFi,
      longNotionalUsd: a.longNotionalUsd, shortNotionalUsd: a.shortNotionalUsd,
      netNotionalUsd: a.longNotionalUsd - a.shortNotionalUsd,
      longTraders: a.longSet.size, shortTraders: a.shortSet.size,
    }))
    .sort((a, b) => (b.longNotionalUsd + b.shortNotionalUsd) - (a.longNotionalUsd + a.shortNotionalUsd))
    .slice(0, KEEP_MARKETS);

  positions.sort((a, b) => b.notionalUsd - a.notionalUsd);

  const snap: SmartPositionsSnapshot = {
    asOf: Date.now(),
    tradersScanned: addresses.length,
    tradersWithPositions,
    positionCount: positions.length,
    markets: marketsAgg,
    positions: positions.slice(0, MAX_POSITIONS),
  };

  if (store) {
    await put(SNAP_PATH, JSON.stringify(snap), {
      access: 'private',
      contentType: 'application/json',
      allowOverwrite: true,
      addRandomSuffix: false,
      token: blobToken(),
    });
  }
  return snap;
}

export async function readSmartPositions(): Promise<SmartPositionsSnapshot | null> {
  try {
    const res = await get(SNAP_PATH, { access: 'private', useCache: true, token: blobToken() });
    if (!res || res.statusCode !== 200) return null;
    const data = await new Response(res.stream).json();
    if (data && typeof data === 'object' && Array.isArray((data as SmartPositionsSnapshot).positions)) {
      return data as SmartPositionsSnapshot;
    }
    return null;
  } catch {
    return null;
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */
