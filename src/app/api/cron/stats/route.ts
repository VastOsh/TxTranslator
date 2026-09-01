import { NextRequest, NextResponse } from 'next/server';
import { fetchDayVolume, dayBoundsUtc, utcDate } from '@/lib/stats/reconstruct';
import { upsertDay } from '@/lib/stats/store';

// Daily ingestion: reconstruct one completed UTC day of on-chain volume and
// store it. Fired by an external cron (cron-job.org) once a day with the
// CRON_SECRET bearer, same as the whale-feed tick. One day of all markets is a
// few hundred windowed indexer calls — comfortably inside the 300s budget.
//
//   GET /api/cron/stats                  → ingest yesterday (last complete day)
//   GET /api/cron/stats?date=2026-08-30  → ingest a specific day (backfill)
//   GET /api/cron/stats?dry=1            → reconstruct only, do not store
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  const dateParam = req.nextUrl.searchParams.get('date');
  const secret = process.env.CRON_SECRET;

  if (secret) {
    if (req.headers.get('authorization') !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  } else if (!dry) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured — only ?dry=1 is available' },
      { status: 403 },
    );
  }

  // Default: the last complete UTC day.
  const date = dateParam ?? utcDate(Date.now() - 24 * 3600 * 1000);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'bad date (want YYYY-MM-DD)' }, { status: 400 });
  }

  try {
    const { start, end } = dayBoundsUtc(date);
    const t0 = Date.now();
    const { rows, injPrice } = await fetchDayVolume(start, end);
    const volumeUsd = rows.reduce((s, r) => s + r.volumeUsd, 0);
    const trades = rows.reduce((s, r) => s + r.trades, 0);

    if (!dry) await upsertDay(date, { rows, injPrice });

    return NextResponse.json({
      ok: true,
      dry,
      date,
      markets: rows.length,
      volumeUsd,
      trades,
      injPrice,
      elapsedMs: Date.now() - t0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
