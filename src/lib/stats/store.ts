import { put, get } from '@vercel/blob';
import type { MarketDayVolume, RecipientVolume } from './reconstruct';

// ── Aggregate storage (Vercel Blob) ─────────────────────────────────────────
// The whole dataset is one JSON blob: per-UTC-day, the per-market volume rows.
// Every timeframe (day/week/month/year/all) is a rollup of these rows, so the
// page never re-scans the chain — it just sums stored days. ~160 markets × 365
// days ≈ 58k rows/yr, a few MB; fine for a single blob. Split by year later if
// it ever grows past comfort.

const BLOB_PATH = 'stats/aggregates-v1.json';

export interface DayEntry {
  rows: MarketDayVolume[];
  injPrice: number;
  // Per-front-end taker volume (top wallets + a folded "other"). Optional: days
  // ingested before front-end attribution existed simply omit it.
  recipients?: RecipientVolume[];
}

export interface StatsBlob {
  updatedAt: number;
  days: Record<string, DayEntry>; // key: YYYY-MM-DD (UTC)
}

function empty(): StatsBlob {
  return { updatedAt: 0, days: {} };
}

// Pass the token explicitly rather than trusting the SDK's zero-config lookup:
// under Next 16 + Turbopack the SDK's internal `process.env.BLOB_READ_WRITE_TOKEN`
// read can come back empty even when the var is present in the runtime (our own
// read of it works), yielding a misleading "No blob credentials found" error.
function blobToken(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN;
}

/** Read the aggregate blob. `fresh` bypasses the CDN cache (use after a write). */
export async function readStats(fresh = false): Promise<StatsBlob> {
  try {
    const res = await get(BLOB_PATH, { access: 'private', useCache: !fresh, token: blobToken() });
    if (!res || res.statusCode !== 200) return empty();
    const data = await new Response(res.stream).json();
    if (data && typeof data === 'object' && (data as StatsBlob).days) return data as StatsBlob;
    return empty();
  } catch {
    return empty();
  }
}

export async function writeStats(blob: StatsBlob): Promise<void> {
  blob.updatedAt = Date.now();
  await put(BLOB_PATH, JSON.stringify(blob), {
    access: 'private',
    contentType: 'application/json',
    allowOverwrite: true,
    addRandomSuffix: false,
    token: blobToken(),
  });
}

/** Insert or replace one day, then persist. Returns the updated blob. */
export async function upsertDay(date: string, entry: DayEntry): Promise<StatsBlob> {
  const blob = await readStats(true);
  blob.days[date] = entry;
  await writeStats(blob);
  return blob;
}
