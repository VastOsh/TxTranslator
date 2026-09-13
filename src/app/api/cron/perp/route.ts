import { NextRequest, NextResponse, after } from 'next/server';
import { buildPerpSnapshot } from '@/lib/perps/snapshot';

// Snapshot open interest + long/short skew across every active perp market and
// store it for the Perp Markets lens. Funding is read live on the page; only
// OI/skew (a per-market position scan) needs this cached snapshot.
//
// Auth + shape mirror /api/cron/stats: shares the same CRON_SECRET, defaults to
// fire-and-forget via after() so an external trigger sees a fast 200, and takes
// ?wait=1 to run synchronously (from a machine with no request-time cap) and
// ?dry=1 to build without storing.
//
//   GET /api/cron/perp            → fire-and-forget rebuild
//   GET /api/cron/perp?wait=1     → run synchronously, return the summary
//   GET /api/cron/perp?dry=1      → build only, do not store (sync)
export const maxDuration = 300;

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

  if (dry || wait) {
    try {
      const t0 = Date.now();
      const snap = await buildPerpSnapshot(!dry); // dry = build but do not store
      return NextResponse.json({
        ok: true,
        markets: snap.markets.length,
        truncated: snap.markets.filter((m) => m.truncated).length,
        elapsedMs: Date.now() - t0,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unexpected error.';
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  after(async () => {
    try {
      const snap = await buildPerpSnapshot();
      console.log('[cron/perp] snapshot', JSON.stringify({ markets: snap.markets.length }));
    } catch (err) {
      console.error('[cron/perp] snapshot failed', err);
    }
  });
  return NextResponse.json({ ok: true, started: true });
}
