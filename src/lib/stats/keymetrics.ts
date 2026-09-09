import type { StatsBlob } from './store';

// ── Key metrics ──────────────────────────────────────────────────────────────
// A window-independent volume summary for the Volume lens header (24h / 7d / 30d
// + week-over-week change), computed from the stored daily aggregate. Same
// verified reconstruction as the rest of the page; these are just fixed windows
// so the summary reads the same no matter which timeframe the chart is on.

export interface KeyMetrics {
  vol24h: number;
  vol7d: number;
  vol30d: number;
  deriv24h: number;
  spot24h: number;
  weeklyChange: number | null; // fraction, this 7d vs the prior 7d
  daysAvailable: number;
}

function windowTotals(blob: StatsBlob, dates: string[]): { vol: number; deriv: number; spot: number } {
  let deriv = 0;
  let spot = 0;
  for (const d of dates) {
    const entry = blob.days[d];
    if (!entry) continue;
    for (const r of entry.rows) {
      if (r.type === 'derivative') deriv += r.volumeUsd;
      else spot += r.volumeUsd;
    }
  }
  return { vol: deriv + spot, deriv, spot };
}

export function computeKeyMetrics(blob: StatsBlob): KeyMetrics {
  const dates = Object.keys(blob.days).sort(); // ascending; strings sort chronologically

  const w24 = windowTotals(blob, dates.slice(-1));
  const w7 = windowTotals(blob, dates.slice(-7));
  const w30 = windowTotals(blob, dates.slice(-30));
  const wPrev7 = windowTotals(blob, dates.slice(-14, -7));

  return {
    vol24h: w24.vol,
    vol7d: w7.vol,
    vol30d: w30.vol,
    deriv24h: w24.deriv,
    spot24h: w24.spot,
    weeklyChange: wPrev7.vol > 0 ? (w7.vol - wPrev7.vol) / wPrev7.vol : null,
    daysAvailable: dates.length,
  };
}
