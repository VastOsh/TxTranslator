import { NextRequest, NextResponse } from 'next/server';
import { readRollup, type LeaderRange, type LeaderRow } from '@/lib/leaderboard/store';

// Public read model for the /leaderboard lens. Everything is served from the
// precomputed rollup blob (rebuilt once a day by the stats cron), so this is a
// single blob fetch with no chain scan. Ranks perp traders by the chain's own
// realized per-fill PnL; see lib/stats/reconstruct.ts and lib/leaderboard/store.ts.
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const RANGES: LeaderRange[] = ['7d', '30d'];
const TOP = 100;

const NOTE =
  'Ranked by realized net PnL from the chain\'s own per-fill numbers (maker and taker), across the top traders recorded each day and summed over the window. Open a trader for full round-trip stats.';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const range = (RANGES as string[]).includes(sp.get('range') ?? '')
    ? (sp.get('range') as LeaderRange)
    : '7d';
  const sort = sp.get('sort') === 'volume' ? 'volume' : 'pnl';

  try {
    const rollup = await readRollup();
    if (!rollup) {
      return NextResponse.json(
        { range, sort, updatedAt: 0, daysCovered: 0, note: NOTE, traders: [] },
        { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=1800' } },
      );
    }

    const r = rollup.ranges[range];
    const rows: LeaderRow[] = [...r.rows].sort((a, b) =>
      sort === 'volume' ? b.volumeUsd - a.volumeUsd : b.netPnlUsd - a.netPnlUsd,
    ).slice(0, TOP);

    return NextResponse.json(
      { range, sort, updatedAt: rollup.updatedAt, daysCovered: r.daysCovered, note: NOTE, traders: rows },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=1800' } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error.';
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
