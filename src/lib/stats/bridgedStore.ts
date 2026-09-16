import { put, get } from '@vercel/blob';
import type { BridgedSnapshot } from './bridged';

// ── Bridged snapshot store (Vercel Blob) ─────────────────────────────────────
// A small time series of daily bridged-value snapshots, one per UTC date. The
// daily cron appends today's snapshot; the day-over-day delta gives net inflows.
// Separate from the volume aggregate blob so the two have independent lifecycles
// and neither read-modify-write races the other (the daily cron is the sole
// writer of both, sequentially). Mirrors store.ts's private-store + explicit
// token handling (see that file for why the token is passed explicitly).

const BLOB_PATH = 'stats/bridged-v1.json';

export interface BridgedStore {
  updatedAt: number;
  snapshots: Record<string, BridgedSnapshot>; // key: YYYY-MM-DD (UTC)
}

function blobToken(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN;
}

function empty(): BridgedStore {
  return { updatedAt: 0, snapshots: {} };
}

export async function readBridged(fresh = false): Promise<BridgedStore> {
  try {
    const res = await get(BLOB_PATH, { access: 'private', useCache: !fresh, token: blobToken() });
    if (!res || res.statusCode !== 200) return empty();
    const data = await new Response(res.stream).json();
    if (data && typeof data === 'object' && (data as BridgedStore).snapshots) return data as BridgedStore;
    return empty();
  } catch {
    return empty();
  }
}

/** Insert or replace one day's snapshot, then persist. */
export async function upsertBridgedSnapshot(date: string, snap: BridgedSnapshot): Promise<void> {
  const store = await readBridged(true);
  store.snapshots[date] = snap;
  store.updatedAt = Date.now();
  await put(BLOB_PATH, JSON.stringify(store), {
    access: 'private',
    contentType: 'application/json',
    allowOverwrite: true,
    addRandomSuffix: false,
    token: blobToken(),
  });
}
