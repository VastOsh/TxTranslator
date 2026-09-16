import { INDEXER_BASE, fetchJsonOverHttps } from '../injective';

// ── On-chain volume reconstruction ──────────────────────────────────────────
// Injective's exchange module is a shared central limit order book; Helix is its
// main front-end. There is no public per-market volume feed (the old chronos
// summary endpoints are gone), so we reconstruct volume the only honest way:
// summing the notional of every matched trade straight from the indexer.
//
// Verified conventions (checked to the cent against each market's minNotional):
//   • Every match appears twice — once as `maker`, once as `taker`. We count the
//     TAKER side only, so each trade is counted exactly once (no double count).
//   • Derivative notional (USD) = executionPrice / 10^quoteDec × executionQuantity
//   • Spot notional (quote)     = price.price × price.quantity / 10^quoteDec,
//     then × the quote token's USD price (USDT/USDC = 1, INJ = live INJ price).
//   • The /trades endpoint hard-caps at 1000 records and refuses skip beyond it,
//     but time-windowing reports true counts. So we recurse: split any window
//     that hits the cap until each slice holds < 1000, then page it fully.

const PAGE = 100;
const CAP = 1000;

export type MarketType = 'derivative' | 'spot';

export interface MarketMeta {
  marketId: string;
  ticker: string;
  type: MarketType;
  quoteDec: number;
  quoteSym: string;
  baseDec: number; // spot only; 0 for derivatives
}

export interface MarketDayVolume {
  marketId: string;
  ticker: string;
  type: MarketType;
  quoteSym: string;
  volumeUsd: number;
  trades: number; // taker-side trade count
}

/** Per-front-end attribution: taker volume grouped by the trade's feeRecipient. */
export interface RecipientVolume {
  addr: string;
  volumeUsd: number;
  trades: number;
}

/**
 * Per-trader perp track record for one day, keyed by raw subaccount id. Built
 * from the SAME derivative-trade rows the volume scan already fetches, so it
 * costs no extra indexer calls. netPnlUsd is the sum of each fill's own chain
 * `pnl` minus `fee` (maker and taker alike, since realized PnL lands on both
 * sides); the owner inj1 address is resolved later, at rollup time.
 */
export interface TraderDayRow {
  subaccountId: string;
  netPnlUsd: number;
  volumeUsd: number;
  fills: number;
}

type TraderMap = Map<string, { pnl: number; vol: number; n: number }>;

function mergeTraders(into: TraderMap, from: TraderMap): void {
  for (const [sub, e] of from) {
    const cur = into.get(sub);
    if (cur) {
      cur.pnl += e.pnl;
      cur.vol += e.vol;
      cur.n += e.n;
    } else {
      into.set(sub, { pnl: e.pnl, vol: e.vol, n: e.n });
    }
  }
}

// Cap the per-day recipient list so the blob stays small; the long tail of
// one-off market-maker addresses is folded into a single "other" bucket that
// keeps the day's recipient total exact.
const TOP_RECIPIENTS = 60;
const OTHER_ADDR = '__other__';

// Bound the stored per-day trader list: keep the day's top movers by realized
// PnL and, unioned in, its highest-volume traders (a consistent whale can lead
// on volume without topping the daily PnL swing). The rollup sums these days,
// so mid-tier traders outside both caps every single day are not ranked; the
// /leaderboard UI states this coverage plainly.
const TOP_TRADERS_PNL = 600;
const TOP_TRADERS_VOL = 300;

type RecipMap = Map<string, { vol: number; n: number }>;

function mergeRecip(into: RecipMap, from: RecipMap): void {
  for (const [addr, e] of from) {
    const cur = into.get(addr);
    if (cur) {
      cur.vol += e.vol;
      cur.n += e.n;
    } else {
      into.set(addr, { vol: e.vol, n: e.n });
    }
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */

async function idx(path: string): Promise<any | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetchJsonOverHttps(`${INDEXER_BASE}${path}`);
    if (r && r.status === 200 && r.body) return r.body;
    await new Promise((res) => setTimeout(res, 300 * (attempt + 1)));
  }
  return null;
}

function stableUsd(sym: string): boolean {
  const s = sym.toUpperCase();
  return s === 'USDT' || s === 'USDC' || s === 'USD';
}

/** Active derivative + spot markets with the decimals needed for notional math. */
export async function fetchMarkets(): Promise<MarketMeta[]> {
  const [der, spo] = await Promise.all([
    idx('/api/exchange/derivative/v1/markets?market_status=active'),
    idx('/api/exchange/spot/v1/markets'),
  ]);
  const out: MarketMeta[] = [];
  for (const m of der?.markets ?? []) {
    out.push({
      marketId: m.marketId,
      ticker: m.ticker,
      type: 'derivative',
      quoteDec: Number(m.quoteTokenMeta?.decimals ?? 6),
      quoteSym: (m.quoteTokenMeta?.symbol ?? m.ticker.split('/').pop() ?? '').toUpperCase(),
      baseDec: 0,
    });
  }
  for (const m of spo?.markets ?? []) {
    out.push({
      marketId: m.marketId,
      ticker: m.ticker,
      type: 'spot',
      quoteDec: Number(m.quoteTokenMeta?.decimals ?? 6),
      quoteSym: (m.quoteTokenMeta?.symbol ?? m.ticker.split('/').pop() ?? '').toUpperCase(),
      baseDec: Number(m.baseTokenMeta?.decimals ?? 6),
    });
  }
  return out;
}

/** Live INJ/USDT price (human) — the only non-stable quote we convert for MVP. */
export async function fetchInjPrice(markets: MarketMeta[]): Promise<number> {
  const inj = markets.find((m) => m.type === 'spot' && m.ticker === 'INJ/USDT');
  if (!inj) return 0;
  const d = await idx(`/api/exchange/spot/v1/trades?marketId=${inj.marketId}&limit=1`);
  const t = d?.trades?.[0]?.price;
  if (!t) return 0;
  return (Number(t.price) * 10 ** (18 - inj.quoteDec)); // raw chainPrice → human
}

/** USD value of one unit of a market's quote token. Returns null if unknown. */
function quoteUsd(m: MarketMeta, injPrice: number): number | null {
  if (stableUsd(m.quoteSym)) return 1;
  if (m.quoteSym === 'INJ') return injPrice || null;
  return null; // exotic quote — skipped (negligible USD volume)
}

async function windowCount(m: MarketMeta, start: number, end: number): Promise<number> {
  const d = await idx(
    `/api/exchange/${m.type}/v1/trades?marketId=${m.marketId}&startTime=${start}&endTime=${end}&limit=1`,
  );
  return d?.paging?.total ?? 0;
}

async function windowSum(
  m: MarketMeta,
  start: number,
  end: number,
  total: number,
  qUsd: number,
): Promise<{ vol: number; n: number; byRecip: RecipMap; byTrader: TraderMap }> {
  let vol = 0;
  let n = 0;
  const byRecip: RecipMap = new Map();
  const byTrader: TraderMap = new Map();
  for (let skip = 0; skip < total; skip += PAGE) {
    const d = await idx(
      `/api/exchange/${m.type}/v1/trades?marketId=${m.marketId}&startTime=${start}&endTime=${end}&limit=${PAGE}&skip=${skip}`,
    );
    for (const t of d?.trades ?? []) {
      // ── Per-trader PnL (derivatives only) ──
      // Every fill, maker or taker, carries its own realized `pnl` and `fee`;
      // both rows of a match belong to different subaccounts, so grouping by
      // subaccount counts each trader's fill exactly once. Synthetic RFQ rows
      // (the contract shuffling a fill between its own subaccounts) are excluded,
      // same as the per-address PnL engine.
      if (
        m.type === 'derivative' &&
        t.tradeExecutionType !== 'synthetic' &&
        t.positionDelta &&
        t.subaccountId
      ) {
        const pd = t.positionDelta;
        const notional = (Number(pd.executionPrice) / 10 ** m.quoteDec) * Number(pd.executionQuantity);
        const pnl = (Number(t.pnl ?? 0) || 0) / 10 ** m.quoteDec;
        const fee = (Number(t.fee ?? 0) || 0) / 10 ** m.quoteDec;
        const te = byTrader.get(t.subaccountId);
        if (te) {
          te.pnl += pnl - fee;
          te.vol += notional;
          te.n++;
        } else {
          byTrader.set(t.subaccountId, { pnl: pnl - fee, vol: notional, n: 1 });
        }
      }

      if (t.executionSide !== 'taker') continue; // count each match once
      let dv: number;
      if (m.type === 'derivative') {
        const pd = t.positionDelta;
        dv = (Number(pd.executionPrice) / 10 ** m.quoteDec) * Number(pd.executionQuantity);
      } else {
        const p = t.price;
        dv = ((Number(p.price) * Number(p.quantity)) / 10 ** m.quoteDec) * qUsd;
      }
      vol += dv;
      n++;
      // Attribute to the order's fee recipient (the front-end that relayed it).
      // An unset recipient stays '' so it groups as direct/API downstream.
      const fr: string = t.feeRecipient || '';
      const e = byRecip.get(fr);
      if (e) {
        e.vol += dv;
        e.n++;
      } else {
        byRecip.set(fr, { vol: dv, n: 1 });
      }
    }
  }
  return { vol, n, byRecip, byTrader };
}

async function marketVolume(
  m: MarketMeta,
  start: number,
  end: number,
  qUsd: number,
): Promise<{ vol: number; n: number; byRecip: RecipMap; byTrader: TraderMap }> {
  const total = await windowCount(m, start, end);
  if (total === 0) return { vol: 0, n: 0, byRecip: new Map(), byTrader: new Map() };
  // Under the cap, or a ~2s window we cannot usefully split further: page it.
  if (total < CAP || end - start <= 2000) {
    return windowSum(m, start, end, Math.min(total, CAP), qUsd);
  }
  const mid = Math.floor((start + end) / 2);
  const a = await marketVolume(m, start, mid, qUsd);
  const b = await marketVolume(m, mid, end, qUsd);
  mergeRecip(a.byRecip, b.byRecip);
  mergeTraders(a.byTrader, b.byTrader);
  return { vol: a.vol + b.vol, n: a.n + b.n, byRecip: a.byRecip, byTrader: a.byTrader };
}

/** Bounded-concurrency map over an array. */
async function pool<T, R>(items: T[], workers: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(workers, items.length) }, run));
  return out;
}

/**
 * Reconstruct per-market USD volume for a single UTC day [dayStartMs, dayEndMs).
 * Pure read — no storage. Reused by the daily cron and the offline backfill.
 */
export async function fetchDayVolume(
  dayStartMs: number,
  dayEndMs: number,
  opts: { markets?: MarketMeta[]; injPrice?: number; concurrency?: number } = {},
): Promise<{ rows: MarketDayVolume[]; injPrice: number; recipients: RecipientVolume[]; traders: TraderDayRow[] }> {
  const markets = opts.markets ?? (await fetchMarkets());
  const injPrice = opts.injPrice ?? (await fetchInjPrice(markets));
  const workers = opts.concurrency ?? 12;
  const globalRecip: RecipMap = new Map();
  const globalTraders: TraderMap = new Map();

  const results = await pool(markets, workers, async (m) => {
    const qUsd = quoteUsd(m, injPrice);
    if (qUsd === null) return null; // unknown quote — skip
    const { vol, n, byRecip, byTrader } = await marketVolume(m, dayStartMs, dayEndMs, qUsd);
    // Sync merges into the shared maps — safe, single-threaded, no await inside.
    // Traders merge even for a zero-volume market row: a fill can realize PnL on
    // a quote we skip for USD volume, and the merge is cheap.
    mergeTraders(globalTraders, byTrader);
    if (n === 0) return null;
    mergeRecip(globalRecip, byRecip);
    return {
      marketId: m.marketId,
      ticker: m.ticker,
      type: m.type,
      quoteSym: m.quoteSym,
      volumeUsd: vol,
      trades: n,
    } as MarketDayVolume;
  });

  const rows = results.filter((r): r is MarketDayVolume => r !== null);
  rows.sort((a, b) => b.volumeUsd - a.volumeUsd);

  // Cap the recipient list: keep the top N by USD, fold the long MM tail into a
  // single "other" bucket so the day's recipient total stays exact.
  const sorted = [...globalRecip.entries()].sort((a, b) => b[1].vol - a[1].vol);
  const recipients: RecipientVolume[] = [];
  let otherVol = 0;
  let otherN = 0;
  sorted.forEach(([addr, e], i) => {
    if (i < TOP_RECIPIENTS && addr !== OTHER_ADDR) {
      recipients.push({ addr, volumeUsd: e.vol, trades: e.n });
    } else {
      otherVol += e.vol;
      otherN += e.n;
    }
  });
  if (otherN > 0) recipients.push({ addr: OTHER_ADDR, volumeUsd: otherVol, trades: otherN });

  // Cap the trader list: union of the top movers by |netPnl| and the top by
  // volume, deduped by subaccount. Every stored byte is a blob byte.
  const traderEntries = [...globalTraders.entries()];
  const keep = new Set<string>();
  [...traderEntries]
    .sort((a, b) => Math.abs(b[1].pnl) - Math.abs(a[1].pnl))
    .slice(0, TOP_TRADERS_PNL)
    .forEach(([sub]) => keep.add(sub));
  [...traderEntries]
    .sort((a, b) => b[1].vol - a[1].vol)
    .slice(0, TOP_TRADERS_VOL)
    .forEach(([sub]) => keep.add(sub));
  const traders: TraderDayRow[] = traderEntries
    .filter(([sub]) => keep.has(sub))
    .map(([sub, e]) => ({ subaccountId: sub, netPnlUsd: e.pnl, volumeUsd: e.vol, fills: e.n }));

  return { rows, injPrice, recipients, traders };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/** UTC midnight-to-midnight bounds (ms) for a YYYY-MM-DD string. */
export function dayBoundsUtc(date: string): { start: number; end: number } {
  const start = Date.parse(`${date}T00:00:00.000Z`);
  return { start, end: start + 24 * 3600 * 1000 };
}

/** YYYY-MM-DD (UTC) for a timestamp. */
export function utcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
