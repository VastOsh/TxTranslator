#!/usr/bin/env node
// Offline historical backfill for the volume tracker.
//
// Drives the deployed daily-ingest endpoint one UTC day at a time, so it reuses
// the exact same verified reconstruction + storage as the live cron. Writes are
// sequential on purpose — the aggregate blob is read-modify-write, so parallel
// days would clobber each other.
//
// Usage:
//   BASE_URL=https://your-app.vercel.app CRON_SECRET=xxx \
//     node scripts/backfill-stats.mjs --days 90
//   ... or an explicit range:
//   node scripts/backfill-stats.mjs --from 2026-06-01 --to 2026-08-31
//
// The indexer retains ~2+ years of trades, so any range back to ~2024 works.
// Each day is one call (~2-4 min server-side); a full year is a long, resumable
// batch — re-running skips nothing but simply overwrites, so it is safe to stop
// and restart.

// Load .env.local (KEY=VALUE lines) into process.env so the secret can live
// there once instead of being retyped — and never mangled by shell quoting.
// Existing env vars win; this only fills in what is missing.
import { readFileSync } from 'node:fs';
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
  /* no .env.local — rely on real env / CLI args */
}

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);

const BASE = process.env.BASE_URL || args.base;
const SECRET = process.env.CRON_SECRET || args.secret;
if (!BASE || !SECRET) {
  console.error('Set BASE_URL and CRON_SECRET (env or --base/--secret).');
  process.exit(1);
}

function utcDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

let dates = [];
if (args.from && args.to) {
  let d = Date.parse(`${args.from}T00:00:00Z`);
  const end = Date.parse(`${args.to}T00:00:00Z`);
  while (d <= end) {
    dates.push(utcDate(d));
    d += 86400_000;
  }
} else {
  const n = Number(args.days || 30);
  // last N complete days, oldest first
  for (let i = n; i >= 1; i--) dates.push(utcDate(Date.now() - i * 86400_000));
}

console.log(`Backfilling ${dates.length} day(s): ${dates[0]} → ${dates[dates.length - 1]}`);

let okDays = 0;
let totalVol = 0;
for (const date of dates) {
  const t0 = Date.now();
  try {
    // ?wait=1 = run synchronously and return the result, so we can confirm each
    // day before moving on (sequential writes avoid clobbering the blob).
    const res = await fetch(`${BASE}/api/cron/stats?wait=1&date=${date}`, {
      headers: { authorization: `Bearer ${SECRET}` },
    });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      console.warn(`  ${date}  FAILED  ${res.status} ${JSON.stringify(j)}`);
      continue;
    }
    okDays++;
    totalVol += j.volumeUsd;
    console.log(
      `  ${date}  $${Math.round(j.volumeUsd).toLocaleString('en-US')}  ` +
        `${j.markets} mkts  ${j.trades} trades  (${((Date.now() - t0) / 1000).toFixed(0)}s)`,
    );
  } catch (e) {
    console.warn(`  ${date}  ERROR  ${e.message}`);
  }
}

console.log(
  `\nDone. ${okDays}/${dates.length} days stored. Summed volume: $${Math.round(totalVol).toLocaleString('en-US')}`,
);
