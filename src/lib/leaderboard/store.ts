import { put, get } from '@vercel/blob';
import type { TraderDayRow } from '../stats/reconstruct';
import { hexToInj } from '../address';

// ── Smart-money leaderboard storage (Vercel Blob) ────────────────────────────
// Two layers:
//   • One small blob per UTC day (`leaderboard/day-<date>.json`) holding that
//     day's capped per-subaccount rows, written by the daily stats cron off the
//     SAME trade scan the volume tracker runs (no extra chain reads).
//   • One precomputed rollup blob (`leaderboard/rollup-v1.json`) with the 7d and
//     30d boards already merged per owner address, rebuilt after each daily
//     ingest. The public /api/leaderboard read is then a single blob fetch.
//
// Realized PnL is the chain's own per-fill figure (see reconstruct.ts). The
// daily cap means the board surfaces the most notable traders, not a complete
// ranking; the UI says so.

const DAY_PREFIX = 'leaderboard/day-';
const ROLLUP_PATH = 'leaderboard/rollup-v1.json';

// Windows we precompute. 30 is the longest we keep day files for on the read
// side, so it doubles as the effective "all" until a rolling all-time aggregate
// is added.
const WINDOW_DAYS = { '7d': 7, '30d': 30 } as const;
export type LeaderRange = keyof typeof WINDOW_DAYS;

// Rows retained per range in the rollup: the union of the top movers by PnL and
// by volume, so either sort has real data without storing the whole tail.
const KEEP_PER_KEY = 120;

export interface LeaderRow {
  /** Owner inj1 address (a trader's subaccounts summed together). */
  address: string;
  /** How many of the owner's subaccounts contributed. */
  subaccounts: number;
  netPnlUsd: number;
  volumeUsd: number;
  fills: number;
}

export interface RollupRange {
  rows: LeaderRow[];
  daysCovered: number;
}

export interface LeaderboardRollup {
  updatedAt: number;
  ranges: Record<LeaderRange, RollupRange>;
}

// See stats/store.ts: pass the token explicitly rather than trusting the SDK's
// zero-config env lookup, which can read empty under Next 16 + Turbopack.
function blobToken(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN;
}

function dayPath(date: string): string {
  return `${DAY_PREFIX}${date}.json`;
}

/** YYYY-MM-DD (UTC) for a timestamp. */
function utcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The N most recent UTC dates ending yesterday (newest first). */
function recentDates(days: number): string[] {
  const out: string[] = [];
  const startOfTodayUtc = Date.parse(`${utcDate(Date.now())}T00:00:00.000Z`);
  for (let i = 1; i <= days; i++) out.push(utcDate(startOfTodayUtc - i * 86_400_000));
  return out;
}

/** Write one day's capped trader rows. Overwrites if the day is re-ingested. */
export async function upsertTraderDay(date: string, traders: TraderDayRow[]): Promise<void> {
  await put(dayPath(date), JSON.stringify({ date, traders }), {
    access: 'private',
    contentType: 'application/json',
    allowOverwrite: true,
    addRandomSuffix: false,
    token: blobToken(),
  });
}

async function readTraderDay(date: string): Promise<TraderDayRow[] | null> {
  try {
    const res = await get(dayPath(date), { access: 'private', useCache: false, token: blobToken() });
    if (!res || res.statusCode !== 200) return null;
    const data = await new Response(res.stream).json();
    const rows = (data as { traders?: unknown })?.traders;
    return Array.isArray(rows) ? (rows as TraderDayRow[]) : null;
  } catch {
    return null;
  }
}

/** subaccount id (0x + 40-hex owner + nonce) → owner inj1 address, or null. */
function ownerOf(subaccountId: string): string | null {
  return hexToInj(subaccountId);
}

/** Merge a set of daily rows into a per-owner board, keeping the notable tail. */
function mergeToBoard(days: TraderDayRow[][]): LeaderRow[] {
  const byOwner = new Map<string, { pnl: number; vol: number; fills: number; subs: Set<string> }>();
  for (const rows of days) {
    for (const r of rows) {
      const owner = ownerOf(r.subaccountId);
      if (!owner) continue;
      const e = byOwner.get(owner);
      if (e) {
        e.pnl += r.netPnlUsd;
        e.vol += r.volumeUsd;
        e.fills += r.fills;
        e.subs.add(r.subaccountId);
      } else {
        byOwner.set(owner, {
          pnl: r.netPnlUsd, vol: r.volumeUsd, fills: r.fills, subs: new Set([r.subaccountId]),
        });
      }
    }
  }

  const all: LeaderRow[] = [...byOwner.entries()].map(([address, e]) => ({
    address,
    subaccounts: e.subs.size,
    netPnlUsd: e.pnl,
    volumeUsd: e.vol,
    fills: e.fills,
  }));

  // Union of the top KEEP_PER_KEY by PnL and by volume, so the stored rollup
  // serves both sorts without carrying the whole long tail.
  const keep = new Map<string, LeaderRow>();
  [...all].sort((a, b) => b.netPnlUsd - a.netPnlUsd).slice(0, KEEP_PER_KEY).forEach((r) => keep.set(r.address, r));
  [...all].sort((a, b) => b.volumeUsd - a.volumeUsd).slice(0, KEEP_PER_KEY).forEach((r) => keep.set(r.address, r));
  return [...keep.values()];
}

/**
 * Rebuild the 7d + 30d rollup from the stored day files. Reads the last 30 day
 * blobs (tolerating gaps), merges per owner, and writes the rollup. Called from
 * the daily cron after the day's trader rows are stored.
 */
export async function rebuildRollup(): Promise<LeaderboardRollup> {
  const dates30 = recentDates(WINDOW_DAYS['30d']);
  const dayRows = await Promise.all(dates30.map(readTraderDay));

  const present = dates30.map((date, i) => ({ date, rows: dayRows[i] }))
    .filter((d): d is { date: string; rows: TraderDayRow[] } => d.rows !== null);
  const dates7 = new Set(recentDates(WINDOW_DAYS['7d']));

  const rows30 = present.map((d) => d.rows);
  const rows7 = present.filter((d) => dates7.has(d.date)).map((d) => d.rows);

  const rollup: LeaderboardRollup = {
    updatedAt: Date.now(),
    ranges: {
      '7d': { rows: mergeToBoard(rows7), daysCovered: rows7.length },
      '30d': { rows: mergeToBoard(rows30), daysCovered: rows30.length },
    },
  };

  await put(ROLLUP_PATH, JSON.stringify(rollup), {
    access: 'private',
    contentType: 'application/json',
    allowOverwrite: true,
    addRandomSuffix: false,
    token: blobToken(),
  });
  return rollup;
}

/** Read the precomputed rollup (single blob fetch). Null if not built yet. */
export async function readRollup(): Promise<LeaderboardRollup | null> {
  try {
    const res = await get(ROLLUP_PATH, { access: 'private', useCache: true, token: blobToken() });
    if (!res || res.statusCode !== 200) return null;
    const data = await new Response(res.stream).json();
    if (data && typeof data === 'object' && (data as LeaderboardRollup).ranges) {
      return data as LeaderboardRollup;
    }
    return null;
  } catch {
    return null;
  }
}
