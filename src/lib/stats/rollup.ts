import type { StatsBlob } from './store';
import type { MarketType } from './reconstruct';

// ── Rollups ─────────────────────────────────────────────────────────────────
// Turn the stored per-day rows into the totals a given timeframe needs. Every
// period is just "sum the most recent N complete days".

export type Period = '1d' | '7d' | '30d' | '1y' | 'all';

const PERIOD_DAYS: Record<Period, number> = {
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

export interface Rollup {
  period: Period;
  totals: { volumeUsd: number; trades: number; derivUsd: number; spotUsd: number };
  series: DayPoint[];
  markets: MarketRollup[];
  daysAvailable: number;
  daysCounted: number;
  updatedAt: number;
}

export function rollup(blob: StatsBlob, period: Period): Rollup {
  const dates = Object.keys(blob.days).sort(); // ascending
  const n = PERIOD_DAYS[period];
  const chosen = Number.isFinite(n) ? dates.slice(-n) : dates;

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
  return {
    period,
    totals: { volumeUsd: derivUsd + spotUsd, trades, derivUsd, spotUsd },
    series,
    markets,
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
