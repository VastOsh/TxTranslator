import { NextRequest, NextResponse, after } from 'next/server';
import { fetchDayVolume, dayBoundsUtc, utcDate } from '@/lib/stats/reconstruct';
import { upsertDay } from '@/lib/stats/store';
import { upsertTraderDay, rebuildRollup } from '@/lib/leaderboard/store';
import { fetchTokenPrices } from '@/lib/prices';
import { fetchBridgedSnapshot } from '@/lib/stats/bridged';
import { upsertBridgedSnapshot } from '@/lib/stats/bridgedStore';

// Daily ingestion: reconstruct one completed UTC day of on-chain volume and
// store it. One day of all markets is ~200-250s of windowed indexer calls.
//
// Because triggers like cron-job.org cap the request at ~30s, the default path
// is FIRE-AND-FORGET: we authenticate, schedule the work with `after()` (which
// keeps running up to this route's 300s maxDuration), and return immediately so
// the trigger sees a fast 200. The work finishes server-side after the response.
//
// The backfill script instead passes ?wait=1 to run synchronously and confirm
// each day before moving on (it runs from a machine with no 30s cap, and its
// sequential calls avoid clobbering the read-modify-write aggregate blob).
//
//   GET /api/cron/stats                  → fire-and-forget ingest of yesterday
//   GET /api/cron/stats?date=2026-08-30  → a specific day
//   GET /api/cron/stats?wait=1&date=...  → run synchronously, return the result
//   GET /api/cron/stats?dry=1            → reconstruct only, do not store (sync)
export const maxDuration = 300;

async function ingestDay(date: string, dry: boolean) {
  const { start, end } = dayBoundsUtc(date);
  const t0 = Date.now();
  const { rows, injPrice, recipients, traders } = await fetchDayVolume(start, end);
  const volumeUsd = rows.reduce((s, r) => s + r.volumeUsd, 0);
  const trades = rows.reduce((s, r) => s + r.trades, 0);
  if (!dry) {
    await upsertDay(date, { rows, injPrice, recipients });
    // Store this day's trader rows, then rebuild the 7d/30d leaderboard rollup
    // so /api/leaderboard stays a single blob read. Piggybacks the same scan.
    await upsertTraderDay(date, traders);
    await rebuildRollup();
  }
  return { date, markets: rows.length, recipients: recipients.length, traders: traders.length, volumeUsd, trades, injPrice, elapsedMs: Date.now() - t0 };
}

// Snapshot today's bridged-asset value and append it to the time series. Fast
// (a handful of bank queries), keyed to the current UTC date so the daily run
// builds a clean day-over-day series regardless of which volume day it ingests.
async function snapshotBridged(): Promise<{ date: string; totalUsd: number } | null> {
  const prices = await fetchTokenPrices();
  const snap = await fetchBridgedSnapshot(prices);
  if (!snap) return null;
  const date = utcDate(Date.now());
  await upsertBridgedSnapshot(date, snap);
  return { date, totalUsd: snap.totalUsd };
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const dry = sp.get('dry') === '1';
  const wait = sp.get('wait') === '1';
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

  // Bridged-only snapshot (fast, synchronous): seed or manually refresh the
  // bridged time series without running the heavy volume reconstruction.
  if (sp.get('bridged') === '1') {
    try {
      const bridged = await snapshotBridged();
      return NextResponse.json({ ok: true, bridged });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unexpected error.';
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  const date = sp.get('date') ?? utcDate(Date.now() - 24 * 3600 * 1000);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'bad date (want YYYY-MM-DD)' }, { status: 400 });
  }

  // Synchronous path: dry previews and the backfill script (?wait=1).
  if (dry || wait) {
    try {
      const result = await ingestDay(date, dry);
      return NextResponse.json({ ok: true, dry, ...result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unexpected error.';
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // Default fire-and-forget path: return fast, keep working via after().
  after(async () => {
    try {
      const bridged = await snapshotBridged();
      if (bridged) console.log('[cron/stats] bridged snapshot', JSON.stringify(bridged));
    } catch (err) {
      console.error('[cron/stats] bridged snapshot failed', err);
    }
    try {
      const result = await ingestDay(date, false);
      console.log('[cron/stats] ingested', JSON.stringify(result));
    } catch (err) {
      console.error('[cron/stats] ingest failed', date, err);
    }
  });
  return NextResponse.json({ ok: true, started: true, date });
}
