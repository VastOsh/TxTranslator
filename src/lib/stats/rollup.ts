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
  addr: string | null; // set for unlabeled single-wallet buckets
  volumeUsd: number;
  trades: number;
  share: number; // fraction of front-end-attributed volume
}

export interface Rollup {
  period: Period;
  totals: { volumeUsd: number; trades: number; derivUsd: number; spotUsd: number };
  series: DayPoint[];
  markets: MarketRollup[];
  dapps: DappBreakdown[];
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
    { name: string; kind: RecipientKind; addr: string | null; vol: number; n: number }
  >();
  let dappVolume = 0;
  let daysWithData = 0;
  for (const date of chosen) {
    const recips = blob.days[date].recipients;
    if (!recips) continue;
    daysWithData++;
    for (const r of recips) {
      dappVolume += r.volumeUsd;
      const lbl = labelRecipient(r.addr);
      const key = lbl.kind === 'unknown' ? `addr:${r.addr}` : `name:${lbl.name}`;
      const cur = bucket.get(key);
      if (cur) {
        cur.vol += r.volumeUsd;
        cur.n += r.trades;
      } else {
        bucket.set(key, {
          name: lbl.name,
          kind: lbl.kind,
          addr: lbl.kind === 'unknown' ? r.addr : null,
          vol: r.volumeUsd,
          n: r.trades,
        });
      }
    }
  }

  const ranked = [...bucket.values()].sort((a, b) => b.vol - a.vol);
  const dapps: DappBreakdown[] = [];
  let restVol = 0;
  let restN = 0;
  ranked.forEach((b, i) => {
    if (i < TOP_DAPPS && b.kind !== 'other') {
      dapps.push({ name: b.name, kind: b.kind, addr: b.addr, volumeUsd: b.vol, trades: b.n, share: 0 });
    } else {
      restVol += b.vol;
      restN += b.n;
    }
  });
  if (restN > 0) dapps.push({ name: 'Other', kind: 'other', addr: null, volumeUsd: restVol, trades: restN, share: 0 });
  for (const d of dapps) d.share = dappVolume > 0 ? d.volumeUsd / dappVolume : 0;
  dapps.sort((a, b) => {
    if (a.kind === 'other') return 1; // Other always last
    if (b.kind === 'other') return -1;
    return b.volumeUsd - a.volumeUsd;
  });

  return {
    period,
    totals: { volumeUsd: derivUsd + spotUsd, trades, derivUsd, spotUsd },
    series,
    markets,
    dapps,
    dappCoverage: { daysWithData, volumeUsd: dappVolume },
    daysAvailable: dates.length,
    daysCounted: chosen.length,
    updatedAt: blob.updatedAt,
  };
}

// ── DeFiLlama comparison ────────────────────────────────────────────────────
// The whole point of the tracker: DeFiLlama's free API exposes only Helix's
// SPOT adapter (perps are paywalled), and even that captures a tiny fraction of
// real on-chain activity. We surface their number next to ours, honestly.

export interface LlamaComparison {
  spot7d: number | null;
  spotAllTime: number | null;
  note: string;
}

export async function fetchLlamaComparison(): Promise<LlamaComparison> {
  const note =
    'DeFiLlama free API exposes only Helix spot volume; perps (~99% of Helix) are paywalled.';
  try {
    const res = await fetch('https://api.llama.fi/summary/dexs/helix?dataType=dailyVolume', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { spot7d: null, spotAllTime: null, note };
    const d = await res.json();
    return {
      spot7d: typeof d.total7d === 'number' ? d.total7d : null,
      spotAllTime: typeof d.totalAllTime === 'number' ? d.totalAllTime : null,
      note,
    };
  } catch {
    return { spot7d: null, spotAllTime: null, note };
  }
}
