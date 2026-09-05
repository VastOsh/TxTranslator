import type { StatsBlob } from './store';
import type { MarketType } from './reconstruct';
import { labelRecipient, type RecipientKind } from './frontends';

// ── Rollups ─────────────────────────────────────────────────────────────────
// Turn the stored per-day rows into the totals a given timeframe needs. Every
// period is just "sum the most recent N complete days".

export type Period = '1d' | '7d' | '30d' | '1y' | 'all' | 'custom';

const PERIOD_DAYS: Record<Exclude<Period, 'custom'>, number> = {
  '1d': 1,
  '7d': 7,
  '30d': 30,
  '1y': 365,
  all: Infinity,
};

export interface MarketRollup {
  ticker: string;
  type: MarketType;
  volumeUsd: number;
  trades: number;
}

export interface DayPoint {
  date: string;
  volumeUsd: number;
  derivUsd: number;
  spotUsd: number;
  trades: number;
}

export interface DappBreakdown {
  name: string;
  kind: RecipientKind;
  walletCount: number; // distinct fee-recipient wallets folded into this bucket
  volumeUsd: number;
  trades: number;
  share: number; // fraction of front-end-attributed volume
}

/** One day of per-dApp volume, for the selectable "By dApp" chart. */
export interface DappDayPoint {
  date: string;
  values: Record<string, number>; // dApp name -> volumeUsd that day
}

export interface Rollup {
  period: Period;
  totals: { volumeUsd: number; trades: number; derivUsd: number; spotUsd: number };
  series: DayPoint[];
  markets: MarketRollup[];
  dapps: DappBreakdown[];
  dappSeries: DappDayPoint[]; // only days with recipient data
  dappNames: string[]; // legend order, matches dapps
  // Front-end attribution only covers days ingested with recipient data.
  dappCoverage: { daysWithData: number; volumeUsd: number };
  daysAvailable: number;
  daysCounted: number;
  updatedAt: number;
}

const TOP_DAPPS = 9;

export function rollup(blob: StatsBlob, period: Period): Rollup {
  const dates = Object.keys(blob.days).sort(); // ascending
  if (period === 'custom') return build(blob, dates, 'custom'); // full range fallback
  const n = PERIOD_DAYS[period];
  const chosen = Number.isFinite(n) ? dates.slice(-n) : dates;
  return build(blob, chosen, period);
}

/** Rollup over an inclusive [from, to] UTC-date window (YYYY-MM-DD strings). */
export function rollupRange(blob: StatsBlob, from: string, to: string): Rollup {
  const [lo, hi] = from <= to ? [from, to] : [to, from];
  const chosen = Object.keys(blob.days)
    .sort()
    .filter((d) => d >= lo && d <= hi); // date strings sort chronologically
  return build(blob, chosen, 'custom');
}

function build(blob: StatsBlob, chosen: string[], period: Period): Rollup {
  const dates = Object.keys(blob.days);

  let derivUsd = 0;
  let spotUsd = 0;
  let trades = 0;
  const byMarket = new Map<string, MarketRollup>();
  const series: DayPoint[] = [];

  for (const date of chosen) {
    const entry = blob.days[date];
    let dayDeriv = 0;
    let daySpot = 0;
    let dayTrades = 0;
    for (const r of entry.rows) {
      if (r.type === 'derivative') dayDeriv += r.volumeUsd;
      else daySpot += r.volumeUsd;
      dayTrades += r.trades;
      const key = r.ticker + '|' + r.type;
      const m = byMarket.get(key);
      if (m) {
        m.volumeUsd += r.volumeUsd;
        m.trades += r.trades;
      } else {
        byMarket.set(key, { ticker: r.ticker, type: r.type, volumeUsd: r.volumeUsd, trades: r.trades });
      }
    }
    derivUsd += dayDeriv;
    spotUsd += daySpot;
    trades += dayTrades;
    series.push({ date, volumeUsd: dayDeriv + daySpot, derivUsd: dayDeriv, spotUsd: daySpot, trades: dayTrades });
  }

  const markets = [...byMarket.values()].sort((a, b) => b.volumeUsd - a.volumeUsd);

  // ── Front-end (dApp) attribution ──────────────────────────────────────────
  // Sum each day's per-recipient volume, label the wallets, and group: known
  // front-ends and the direct/API bucket merge by name; unidentified wallets
  // stay separate (by address) so a big unlabeled relayer is still visible.
  const bucket = new Map<
    string,
    { name: string; kind: RecipientKind; vol: number; n: number; addrs: Set<string> }
  >();
  let dappVolume = 0;
  let daysWithData = 0;
  const recipDays: Array<{ date: string; recips: NonNullable<StatsBlob['days'][string]['recipients']> }> = [];
  for (const date of chosen) {
    const recips = blob.days[date].recipients;
    if (!recips) continue;
    daysWithData++;
    recipDays.push({ date, recips });
    for (const r of recips) {
      dappVolume += r.volumeUsd;
      const lbl = labelRecipient(r.addr);
      let cur = bucket.get(lbl.name);
      if (!cur) {
        cur = { name: lbl.name, kind: lbl.kind, vol: 0, n: 0, addrs: new Set() };
        bucket.set(lbl.name, cur);
      }
      cur.vol += r.volumeUsd;
      cur.n += r.trades;
      if (lbl.kind === 'mm' || lbl.kind === 'frontend') cur.addrs.add(r.addr);
    }
  }

  const ranked = [...bucket.values()].sort((a, b) => b.vol - a.vol);
  const dapps: DappBreakdown[] = [];
  let restVol = 0;
  let restN = 0;
  const restAddrs = new Set<string>();
  ranked.forEach((b, i) => {
    if (i < TOP_DAPPS && b.kind !== 'other') {
      dapps.push({ name: b.name, kind: b.kind, walletCount: b.addrs.size, volumeUsd: b.vol, trades: b.n, share: 0 });
    } else {
      restVol += b.vol;
      restN += b.n;
      b.addrs.forEach((a) => restAddrs.add(a));
    }
  });
  if (restN > 0) dapps.push({ name: 'Other', kind: 'other', walletCount: restAddrs.size, volumeUsd: restVol, trades: restN, share: 0 });
  for (const d of dapps) d.share = dappVolume > 0 ? d.volumeUsd / dappVolume : 0;
  dapps.sort((a, b) => {
    if (a.kind === 'other') return 1; // Other always last
    if (b.kind === 'other') return -1;
    return b.volumeUsd - a.volumeUsd;
  });

  // Per-day series, folding any name not kept as a top bucket into "Other" so it
  // lines up with the aggregate breakdown above.
  const kept = new Set(dapps.filter((d) => d.name !== 'Other').map((d) => d.name));
  const dappSeries: DappDayPoint[] = recipDays.map(({ date, recips }) => {
    const values: Record<string, number> = {};
    for (const r of recips) {
      const nm = labelRecipient(r.addr).name;
      const bn = kept.has(nm) ? nm : 'Other';
      values[bn] = (values[bn] ?? 0) + r.volumeUsd;
    }
    return { date, values };
  });
  const dappNames = dapps.map((d) => d.name);

  return {
    period,
    totals: { volumeUsd: derivUsd + spotUsd, trades, derivUsd, spotUsd },
    series,
    markets,
    dapps,
    dappSeries,
    dappNames,
    dappCoverage: { daysWithData, volumeUsd: dappVolume },
    daysAvailable: dates.length,
    daysCounted: chosen.length,
    updatedAt: blob.updatedAt,
  };
}
