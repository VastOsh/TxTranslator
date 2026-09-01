import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { readStats } from '@/lib/stats/store';
import { rollup, fetchLlamaComparison, type Period } from '@/lib/stats/rollup';
import { fetchBurnSummary } from '@/lib/stats/burn';

// Public read model for the /stats page. Everything is served from stored daily
// aggregates (no chain re-scan), plus the live burn summary and the DeFiLlama
// comparison. Cached 10 min — the underlying data only changes once a day.
export const maxDuration = 30;

const PERIODS: Period[] = ['1d', '7d', '30d', '1y', 'all'];
const TOP_MARKETS = 50;

const buildStats = unstable_cache(
  async (period: Period) => {
    const [blob, burn, defillama] = await Promise.all([
      readStats(),
      fetchBurnSummary(),
      fetchLlamaComparison(),
    ]);
    const r = rollup(blob, period);

    // Fixed bases for the DeFiLlama gap panel — always valid regardless of the
    // timeframe the user is viewing.
    const own7d = rollup(blob, '7d').totals.volumeUsd;
    const ownAll = rollup(blob, 'all').totals.volumeUsd;

    // INJ price from the most recent stored day (for burn USD valuation).
    const dates = Object.keys(blob.days).sort();
    const injPrice = dates.length ? blob.days[dates[dates.length - 1]].injPrice : 0;
    const latestUsd = burn.latest ? burn.latest.injBurned * injPrice : null;

    return {
      period: r.period,
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
  ['stats-api-v1'],
  { revalidate: 600 },
);

export async function GET(req: NextRequest) {
  const p = (req.nextUrl.searchParams.get('period') ?? '7d') as Period;
  const period = PERIODS.includes(p) ? p : '7d';
  try {
    return NextResponse.json(await buildStats(period));
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
