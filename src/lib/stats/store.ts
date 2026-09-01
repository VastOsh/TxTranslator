import { put, get } from '@vercel/blob';
import type { MarketDayVolume } from './reconstruct';

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
}

export interface StatsBlob {
  updatedAt: number;
  days: Record<string, DayEntry>; // key: YYYY-MM-DD (UTC)
}

function empty(): StatsBlob {
  return { updatedAt: 0, days: {} };
}

/** Read the aggregate blob. `fresh` bypasses the CDN cache (use after a write). */
export async function readStats(fresh = false): Promise<StatsBlob> {
  try {
    const res = await get(BLOB_PATH, { access: 'public', useCache: !fresh });
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
    access: 'public',
    contentType: 'application/json',
    allowOverwrite: true,
    addRandomSuffix: false,
  });
}

/** Insert or replace one day, then persist. Returns the updated blob. */
export async function upsertDay(date: string, entry: DayEntry): Promise<StatsBlob> {
  const blob = await readStats(true);
  blob.days[date] = entry;
  await writeStats(blob);
  return blob;
}
