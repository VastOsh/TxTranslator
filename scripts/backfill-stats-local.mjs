#!/usr/bin/env node
// LOCAL historical backfill for the volume tracker — for the heavy days that
// time out the deployed endpoint.
//
// The deployed /api/cron/stats?wait=1 reconstructs a whole day synchronously
// inside Vercel's 300s function cap. A normal day is ~200-250s; the busiest days
// (e.g. mid-Oct 2025) need more than 300s of windowed indexer calls, so Vercel
// kills the function and returns a plaintext error page ("An error o...") that
// the network backfill script can't parse as JSON.
//
// This runner does the identical, verified reconstruction locally (no timeout)
// and writes the result straight to the same Vercel Blob aggregate the live
// /stats page reads. Math is copied verbatim from src/lib/stats/reconstruct.ts
// and the write matches src/lib/stats/store.ts (same path/shape), so a day filled
// here is indistinguishable from one the cron produced.
//
// Usage (from the repo root):
//   node scripts/backfill-stats-local.mjs --from 2025-10-12 --to 2025-10-22
//   node scripts/backfill-stats-local.mjs --days 7
//   node scripts/backfill-stats-local.mjs --from 2025-10-12 --to 2025-10-22 --concurrency 16
//
// Needs BLOB_READ_WRITE_TOKEN (read from .env.local automatically). Writes are
// sequential + read-modify-write per day, so it is safe to stop and re-run;
// re-running a day simply overwrites it identically.

import https from 'node:https';
import zlib from 'node:zlib';
import { readFileSync } from 'node:fs';
import { get, put } from '@vercel/blob';

// ── env: load .env.local (existing env wins) ────────────────────────────────
try {
  for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!m) continue;
    const key = m[1];
    let val = m[2].replace(/\r$/, '').trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
} catch {
  /* rely on real env */
}

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
if (!BLOB_TOKEN) {
  console.error('Missing BLOB_READ_WRITE_TOKEN (env or .env.local).');
  process.exit(1);
}

// ── args ────────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);
const CONCURRENCY = Number(args.concurrency || 12);

// ── indexer fetch (mirrors src/lib/injective.ts fetchJsonOverHttps) ──────────
const INDEXER_BASE = 'https://sentry.exchange.grpc-web.injective.network';
const HEADERS = {
  Accept: 'application/json',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept-Encoding': 'gzip, deflate',
};

function fetchJsonOverHttps(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: HEADERS }, (res) => {
      const status = res.statusCode ?? 0;
      const encoding = (res.headers['content-encoding'] ?? '').toLowerCase();
      const stream =
        encoding === 'gzip' ? res.pipe(zlib.createGunzip())
        : encoding === 'deflate' ? res.pipe(zlib.createInflate())
        : encoding === 'br' ? res.pipe(zlib.createBrotliDecompress())
        : res;
      const chunks = [];
      stream.on('data', (c) => chunks.push(Buffer.from(c)));
      stream.on('error', () => resolve({ status, body: null }));
      stream.on('end', () => {
        try {
          resolve({ status, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
        } catch {
          resolve({ status, body: null });
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(10_000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

async function idx(path) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetchJsonOverHttps(`${INDEXER_BASE}${path}`);
    if (r && r.status === 200 && r.body) return r.body;
    await new Promise((res) => setTimeout(res, 300 * (attempt + 1)));
  }
  return null;
}

// ── reconstruction (verbatim math from src/lib/stats/reconstruct.ts) ─────────
const PAGE = 100;
const CAP = 1000;
const TOP_RECIPIENTS = 60;
const OTHER_ADDR = '__other__';

function mergeRecip(into, from) {
  for (const [addr, e] of from) {
    const c = into.get(addr);
    if (c) { c.vol += e.vol; c.n += e.n; } else into.set(addr, { vol: e.vol, n: e.n });
  }
}

function stableUsd(sym) {
  const s = sym.toUpperCase();
  return s === 'USDT' || s === 'USDC' || s === 'USD';
}

async function fetchMarkets() {
  const [der, spo] = await Promise.all([
    idx('/api/exchange/derivative/v1/markets?market_status=active'),
    idx('/api/exchange/spot/v1/markets'),
  ]);
  const out = [];
  for (const m of der?.markets ?? []) {
    out.push({
      marketId: m.marketId,
      ticker: m.ticker,
      type: 'derivative',
      quoteDec: Number(m.quoteTokenMeta?.decimals ?? 6),
      quoteSym: (m.quoteTokenMeta?.symbol ?? m.ticker.split('/').pop() ?? '').toUpperCase(),
      baseDec: 0,
    });
  }
  for (const m of spo?.markets ?? []) {
    out.push({
      marketId: m.marketId,
      ticker: m.ticker,
      type: 'spot',
      quoteDec: Number(m.quoteTokenMeta?.decimals ?? 6),
      quoteSym: (m.quoteTokenMeta?.symbol ?? m.ticker.split('/').pop() ?? '').toUpperCase(),
      baseDec: Number(m.baseTokenMeta?.decimals ?? 6),
    });
  }
  return out;
}

async function fetchInjPrice(markets) {
  const inj = markets.find((m) => m.type === 'spot' && m.ticker === 'INJ/USDT');
  if (!inj) return 0;
  const d = await idx(`/api/exchange/spot/v1/trades?marketId=${inj.marketId}&limit=1`);
  const t = d?.trades?.[0]?.price;
  if (!t) return 0;
  return Number(t.price) * 10 ** (18 - inj.quoteDec);
}

function quoteUsd(m, injPrice) {
  if (stableUsd(m.quoteSym)) return 1;
  if (m.quoteSym === 'INJ') return injPrice || null;
  return null;
}

async function windowCount(m, start, end) {
  const d = await idx(
    `/api/exchange/${m.type}/v1/trades?marketId=${m.marketId}&startTime=${start}&endTime=${end}&limit=1`,
  );
  return d?.paging?.total ?? 0;
}

async function windowSum(m, start, end, total, qUsd) {
  let vol = 0;
  let n = 0;
  const byRecip = new Map();
  for (let skip = 0; skip < total; skip += PAGE) {
    const d = await idx(
      `/api/exchange/${m.type}/v1/trades?marketId=${m.marketId}&startTime=${start}&endTime=${end}&limit=${PAGE}&skip=${skip}`,
    );
    for (const t of d?.trades ?? []) {
      if (t.executionSide !== 'taker') continue;
      let dv;
      if (m.type === 'derivative') {
        const pd = t.positionDelta;
        dv = (Number(pd.executionPrice) / 10 ** m.quoteDec) * Number(pd.executionQuantity);
      } else {
        const p = t.price;
        dv = ((Number(p.price) * Number(p.quantity)) / 10 ** m.quoteDec) * qUsd;
      }
      vol += dv;
      n++;
      const fr = t.feeRecipient || '';
      const e = byRecip.get(fr);
      if (e) { e.vol += dv; e.n++; } else byRecip.set(fr, { vol: dv, n: 1 });
    }
  }
  return { vol, n, byRecip };
}

async function marketVolume(m, start, end, qUsd) {
  const total = await windowCount(m, start, end);
  if (total === 0) return { vol: 0, n: 0, byRecip: new Map() };
  if (total < CAP || end - start <= 2000) {
    return windowSum(m, start, end, Math.min(total, CAP), qUsd);
  }
  const mid = Math.floor((start + end) / 2);
  const a = await marketVolume(m, start, mid, qUsd);
  const b = await marketVolume(m, mid, end, qUsd);
  mergeRecip(a.byRecip, b.byRecip);
  return { vol: a.vol + b.vol, n: a.n + b.n, byRecip: a.byRecip };
}

async function pool(items, workers, fn) {
  const out = new Array(items.length);
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

async function fetchDayVolume(dayStartMs, dayEndMs) {
  const markets = await fetchMarkets();
  const injPrice = await fetchInjPrice(markets);
  const globalRecip = new Map();
  const results = await pool(markets, CONCURRENCY, async (m) => {
    const qUsd = quoteUsd(m, injPrice);
    if (qUsd === null) return null;
    const { vol, n, byRecip } = await marketVolume(m, dayStartMs, dayEndMs, qUsd);
    if (n === 0) return null;
    mergeRecip(globalRecip, byRecip);
    return {
      marketId: m.marketId,
      ticker: m.ticker,
      type: m.type,
      quoteSym: m.quoteSym,
      volumeUsd: vol,
      trades: n,
    };
  });
  const rows = results.filter((r) => r !== null);
  rows.sort((a, b) => b.volumeUsd - a.volumeUsd);

  const sorted = [...globalRecip.entries()].sort((a, b) => b[1].vol - a[1].vol);
  const recipients = [];
  let otherVol = 0, otherN = 0;
  sorted.forEach(([addr, e], i) => {
    if (i < TOP_RECIPIENTS && addr !== OTHER_ADDR) recipients.push({ addr, volumeUsd: e.vol, trades: e.n });
    else { otherVol += e.vol; otherN += e.n; }
  });
  if (otherN > 0) recipients.push({ addr: OTHER_ADDR, volumeUsd: otherVol, trades: otherN });

  return { rows, injPrice, recipients };
}

function dayBoundsUtc(date) {
  const start = Date.parse(`${date}T00:00:00.000Z`);
  return { start, end: start + 24 * 3600 * 1000 };
}
function utcDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// ── blob store (mirrors src/lib/stats/store.ts) ──────────────────────────────
const BLOB_PATH = 'stats/aggregates-v1.json';

async function readStats() {
  try {
    const res = await get(BLOB_PATH, { access: 'private', useCache: false, token: BLOB_TOKEN });
    if (!res || res.statusCode !== 200) return { updatedAt: 0, days: {} };
    const data = await new Response(res.stream).json();
    if (data && typeof data === 'object' && data.days) return data;
    return { updatedAt: 0, days: {} };
  } catch {
    return { updatedAt: 0, days: {} };
  }
}

async function upsertDay(date, entry) {
  const blob = await readStats();
  blob.days[date] = entry;
  blob.updatedAt = Date.now();
  await put(BLOB_PATH, JSON.stringify(blob), {
    access: 'private',
    contentType: 'application/json',
    allowOverwrite: true,
    addRandomSuffix: false,
    token: BLOB_TOKEN,
  });
  return blob;
}

// ── dates ────────────────────────────────────────────────────────────────────
let dates = [];
if (args.from && args.to) {
  let d = Date.parse(`${args.from}T00:00:00Z`);
  const end = Date.parse(`${args.to}T00:00:00Z`);
  while (d <= end) {
    dates.push(utcDate(d));
    d += 86400_000;
  }
} else {
  const n = Number(args.days || 7);
  for (let i = n; i >= 1; i--) dates.push(utcDate(Date.now() - i * 86400_000));
}

console.log(
  `Local backfill: ${dates.length} day(s) ${dates[0]} → ${dates[dates.length - 1]} ` +
    `(concurrency ${CONCURRENCY})`,
);

let okDays = 0;
let totalVol = 0;
for (const date of dates) {
  const t0 = Date.now();
  try {
    const { start, end } = dayBoundsUtc(date);
    const { rows, injPrice, recipients } = await fetchDayVolume(start, end);
    const volumeUsd = rows.reduce((s, r) => s + r.volumeUsd, 0);
    const trades = rows.reduce((s, r) => s + r.trades, 0);
    if (rows.length === 0) {
      console.warn(`  ${date}  NO ROWS (skipped, not stored)`);
      continue;
    }
    await upsertDay(date, { rows, injPrice, recipients });
    okDays++;
    totalVol += volumeUsd;
    console.log(
      `  ${date}  $${Math.round(volumeUsd).toLocaleString('en-US')}  ` +
        `${rows.length} mkts  ${trades} trades  (${((Date.now() - t0) / 1000).toFixed(0)}s)`,
    );
  } catch (e) {
    console.warn(`  ${date}  ERROR  ${e.message}`);
  }
}

console.log(
  `\nDone. ${okDays}/${dates.length} days stored. Summed volume: $${Math.round(totalVol).toLocaleString('en-US')}`,
);
