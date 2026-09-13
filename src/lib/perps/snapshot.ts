import { put, get } from '@vercel/blob';
import { INDEXER_BASE, fetchJsonOverHttps } from '../injective';
import { loadMarkets } from '../feed/watch';

// ── Open interest + long/short skew snapshot ─────────────────────────────────
// OI and skew need every open position in a market, so they cannot be read live
// on the request path. A cron scans each active derivative market's positions,
// sums long vs short notional at the current mark, and stores the result with
// an `asOf` timestamp. Open-position counts on Injective are small (tens per
// market), so a full scan is cheap; the page cap and `truncated` flag guard the
// rare market that ever grows large, rather than sampling and guessing.

/* eslint-disable @typescript-eslint/no-explicit-any */

const SNAP_PATH = 'perp/snapshot-v1.json';
const PAGE = 100;
const MAX_PAGES = 12; // 1200 positions/market before we flag truncation

export interface PerpSnapRow {
  marketId: string;
  /** One-sided open interest in quote units (USD for stable-quoted perps). */
  oiUsd: number;
  /** Share of notional that is long, 0-100, or null when no positions. */
  skewLongPct: number | null;
  positionCount: number;
  markPrice: number;
  truncated: boolean;
}

export interface PerpSnapshot {
  asOf: number;
  markets: PerpSnapRow[];
}

function blobToken(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN;
}

async function pool<T, R>(items: T[], workers: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(workers, items.length) }, run));
  return out;
}

async function scanMarket(marketId: string, quoteDec: number): Promise<PerpSnapRow | null> {
  const scale = 10 ** quoteDec;
  let longN = 0;
  let shortN = 0;
  let count = 0;
  let mark = 0;
  let truncated = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetchJsonOverHttps(
      `${INDEXER_BASE}/api/exchange/derivative/v1/positions?marketIds=${marketId}&limit=${PAGE}&skip=${page * PAGE}`,
    );
    const ps: any[] = res?.body?.positions ?? [];
    if (page === 0) count = res?.body?.paging?.total ?? ps.length;
    if (ps.length === 0) break;

    for (const p of ps) {
      const qty = Number(p.quantity) || 0;
      const mp = (Number(p.markPrice) || 0) / scale;
      if (mp > 0) mark = mp;
      const notional = qty * mp;
      if (p.direction === 'short') shortN += notional;
      else longN += notional;
    }

    if (ps.length < PAGE) break;
    if (page === MAX_PAGES - 1) truncated = true;
  }

  if (count === 0 && longN === 0 && shortN === 0) return null;
  const tot = longN + shortN;
  return {
    marketId,
    oiUsd: longN,
    skewLongPct: tot > 0 ? (longN / tot) * 100 : null,
    positionCount: count,
    markPrice: mark,
    truncated,
  };
}

export async function buildPerpSnapshot(store = true): Promise<PerpSnapshot> {
  const markets = await loadMarkets();
  const entries = [...markets.values()];
  const rows = await pool(entries, 8, (m) => scanMarket(m.marketId, m.quoteDecimals));
  const snap: PerpSnapshot = {
    asOf: Date.now(),
    markets: rows.filter((r): r is PerpSnapRow => r !== null),
  };
  if (store) {
    await put(SNAP_PATH, JSON.stringify(snap), {
      access: 'private',
      contentType: 'application/json',
      allowOverwrite: true,
      addRandomSuffix: false,
      token: blobToken(),
    });
  }
  return snap;
}

export async function readPerpSnapshot(): Promise<PerpSnapshot | null> {
  try {
    const res = await get(SNAP_PATH, { access: 'private', useCache: true, token: blobToken() });
    if (!res || res.statusCode !== 200) return null;
    const data = await new Response(res.stream).json();
    if (data && typeof data === 'object' && Array.isArray((data as PerpSnapshot).markets)) {
      return data as PerpSnapshot;
    }
    return null;
  } catch {
    return null;
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */
