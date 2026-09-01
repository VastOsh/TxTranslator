import { NextRequest, NextResponse, after } from 'next/server';
import { fetchDayVolume, dayBoundsUtc, utcDate } from '@/lib/stats/reconstruct';
import { upsertDay } from '@/lib/stats/store';

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
  const { rows, injPrice } = await fetchDayVolume(start, end);
  const volumeUsd = rows.reduce((s, r) => s + r.volumeUsd, 0);
  const trades = rows.reduce((s, r) => s + r.trades, 0);
  if (!dry) await upsertDay(date, { rows, injPrice });
  return { date, markets: rows.length, volumeUsd, trades, injPrice, elapsedMs: Date.now() - t0 };
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

  // Diagnostic: report whether the Blob credentials actually reached this
  // deployment's runtime — presence and length only, never the values.
  if (sp.get('diag') === '1') {
    return NextResponse.json({
      vercelEnv: process.env.VERCEL_ENV ?? null,
      hasBlobToken: !!process.env.BLOB_READ_WRITE_TOKEN,
      blobTokenLen: (process.env.BLOB_READ_WRITE_TOKEN || '').length,
      hasBlobStoreId: !!process.env.BLOB_STORE_ID,
      hasCronSecret: !!process.env.CRON_SECRET,
      // any env var whose name mentions BLOB, so a custom-named token shows up
      blobVarNames: Object.keys(process.env).filter((k) => k.includes('BLOB')),
    });
  }

  // Probe: actually attempt a Blob write/read and report the real outcome, so we
  // can see the exact failure instead of guessing. `codeVersion` confirms which
  // build is being hit.
  if (sp.get('probe') === '1') {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    const out: Record<string, unknown> = {
      codeVersion: 'probe-2',
      tokenLenInRoute: (token || '').length,
    };
    const { put, get } = await import('@vercel/blob');
    try {
      const w = await put('stats/_probe.json', JSON.stringify({ t: Date.now() }), {
        access: 'public',
        contentType: 'application/json',
        allowOverwrite: true,
        addRandomSuffix: false,
        token,
      });
      out.putOk = true;
      out.putUrl = w.url;
    } catch (e) {
      out.putOk = false;
      out.putError = e instanceof Error ? e.message : String(e);
    }
    try {
      const r = await get('stats/_probe.json', { access: 'public', useCache: false, token });
      out.getOk = !!r && r.statusCode === 200;
    } catch (e) {
      out.getOk = false;
      out.getError = e instanceof Error ? e.message : String(e);
    }
    return NextResponse.json(out);
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
      const result = await ingestDay(date, false);
      console.log('[cron/stats] ingested', JSON.stringify(result));
    } catch (err) {
      console.error('[cron/stats] ingest failed', date, err);
    }
  });
  return NextResponse.json({ ok: true, started: true, date });
}
