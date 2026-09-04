import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { readStats } from '@/lib/stats/store';
import { rollup, rollupRange, fetchLlamaComparison, type Period, type Rollup } from '@/lib/stats/rollup';
import { fetchBurnSummary } from '@/lib/stats/burn';

// Public read model for the /stats page. Everything is served from stored daily
// aggregates (no chain re-scan), plus the live burn summary and the DeFiLlama
// comparison. Cached 10 min — the underlying data only changes once a day.
export const maxDuration = 30;

const PERIODS: Period[] = ['1d', '7d', '30d', '1y', 'all'];
const TOP_MARKETS = 50;

// `sel` names the window: a fixed period id, or "custom:<from>:<to>". Passing it
// as the cache argument gives every window its own cache entry.
const buildStats = unstable_cache(
  async (sel: string) => {
    const [blob, burn, defillama] = await Promise.all([
      readStats(),
      fetchBurnSummary(),
      fetchLlamaComparison(),
    ]);

    let r: Rollup;
    if (sel.startsWith('custom:')) {
      const [, from, to] = sel.split(':');
      r = rollupRange(blob, from, to);
    } else {
      r = rollup(blob, sel as Period);
    }

    // Fixed bases for the DeFiLlama gap panel — always valid regardless of the
    // timeframe the user is viewing.
    const own7d = rollup(blob, '7d').totals.volumeUsd;
    const ownAll = rollup(blob, 'all').totals.volumeUsd;

    // Full stored span, so the UI can bound a custom range to real data.
    const dates = Object.keys(blob.days).sort();
    const bounds = dates.length ? { first: dates[0], last: dates[dates.length - 1] } : null;

    // INJ price from the most recent stored day (for burn USD valuation).
    const injPrice = dates.length ? blob.days[dates[dates.length - 1]].injPrice : 0;
    const latestUsd = burn.latest ? burn.latest.injBurned * injPrice : null;

    return {
      period: r.period,
      range: r.series.length ? { from: r.series[0].date, to: r.series[r.series.length - 1].date } : null,
      bounds,
      updatedAt: r.updatedAt,
      injPrice,
      coverage: { daysAvailable: r.daysAvailable, daysCounted: r.daysCounted },
      totals: r.totals,
      series: r.series,
      markets: r.markets.slice(0, TOP_MARKETS),
      burn: {
        latestRound: burn.latest?.round ?? null,
        latestInj: burn.latest?.injBurned ?? null,
        latestUsd,
        cumulativeInj: burn.cumulativeInj,
        roundsCovered: burn.roundsCovered,
      },
      defillama,
      compare: {
        own7d,
        ownAll,
        llamaSpot7d: defillama.spot7d,
        llamaSpotAll: defillama.spotAllTime,
      },
    };
  },
  ['stats-api-v2'], // bumped: series now carries the per-day perp/spot split
  { revalidate: 600 },
);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const from = sp.get('from');
  const to = sp.get('to');

  let sel: string;
  if (from && to && DATE_RE.test(from) && DATE_RE.test(to)) {
    sel = `custom:${from}:${to}`;
  } else {
    const p = (sp.get('period') ?? '7d') as Period;
    sel = PERIODS.includes(p) ? p : '7d';
  }

  try {
    return NextResponse.json(await buildStats(sel));
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
