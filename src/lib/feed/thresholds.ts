import type { FeedCandidate } from './watch';

// Static USD floors calibrated against a 24h indexer sample (July 2026):
// distinct-whale opens ≥$25k ≈ 1-2/day once bot bursts are cooled down;
// liquidations ≥$1k were zero all day, so the liq bar sits low — rekt posts
// are rare, high-value events. M2 layers a rolling top-percentile window on
// top; these are the hard minimums.
const FLOOR_USD: Record<FeedCandidate['kind'], number> = {
  perp_open: 25_000,
  liquidation: 5_000,
};

const HERO_USD: Record<FeedCandidate['kind'], number> = {
  perp_open: 150_000,
  liquidation: 50_000,
};

// Tokenized stocks / FX are the exclusive content — halve the bar for them
const TRADFI_FLOOR_FACTOR = 0.5;

// FEED_TEST_MODE=1 drops the floors 500× ($50 perp open / $30 liquidation)
// and relaxes the hourly cap so a private test channel sees traffic quickly.
// On-chain perp flow is mostly $1-100 MM trades, so even this catches only
// the larger organic ones. Posts get a [TEST] prefix.
export const TEST_MODE = process.env.FEED_TEST_MODE === '1';
const TEST_FLOOR_FACTOR = TEST_MODE ? 0.002 : 1;

// Hero-tier events bypass this cap; everything else queues behind it
export const MAX_POSTS_PER_HOUR = TEST_MODE ? 20 : 3;

// One post per subaccount per window, heroes included. Calibration (July
// 2026) found a single account behind 67 of 68 opens ≥$25k in a 24h sample —
// without this, one bot burst monopolizes the feed.
export const SUBACCOUNT_COOLDOWN_S = TEST_MODE ? 15 * 60 : 6 * 3600;

// X is pay-per-use since Feb 2026 ($0.015/post, $0.20 with a link) — this
// daily cap bounds spend regardless of what the hourly cap lets through.
// Heroes do NOT bypass it. Discord is unaffected.
export const X_MAX_POSTS_PER_DAY = (() => {
  const v = parseInt(process.env.X_MAX_POSTS_PER_DAY ?? '', 10);
  return Number.isFinite(v) && v > 0 ? v : 10;
})();

// ── Rolling dynamic bar ──
// Every non-dust candidate notional enters a 24h window; notable-tier posts
// must also clear its p85, so a busy day raises the bar and a quiet day
// lowers it. Heroes bypass the bar (a $150k open posts regardless).

// 99% of raw flow is $1-3 dust that would drag the percentile to $2 —
// only orders at least this large enter the window.
export const DYNAMIC_MIN_NOTIONAL_USD = 1_000;
// Below this many samples the percentile is noise; floors alone apply.
export const DYNAMIC_MIN_SAMPLES = 20;
export const NOTIONALS_WINDOW_MS = 24 * 3600 * 1000;
export const DYNAMIC_PERCENTILE = 0.85;

/** Nearest-rank percentile of an ascending-sorted array. */
export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.floor(sortedAsc.length * p));
  return sortedAsc[idx];
}

export type Tier = 'skip' | 'notable' | 'hero';

export interface Decision {
  tier: Tier;
  reason: string;
}

export function decide(c: FeedCandidate, dynamicBarUsd?: number | null): Decision {
  const factor = (c.isTradFi ? TRADFI_FLOOR_FACTOR : 1) * TEST_FLOOR_FACTOR;
  const floor = FLOOR_USD[c.kind] * factor;
  const hero = HERO_USD[c.kind] * factor;

  if (c.notionalUsd >= hero) {
    return { tier: 'hero', reason: `$${Math.round(c.notionalUsd).toLocaleString()} ≥ hero threshold` };
  }
  if (c.notionalUsd < floor) {
    return { tier: 'skip', reason: `$${Math.round(c.notionalUsd).toLocaleString()} below $${floor.toLocaleString()} floor` };
  }
  // The window holds real (unscaled) notionals, so the bar takes the same
  // TradFi/test scaling as the floors.
  const bar = dynamicBarUsd != null ? dynamicBarUsd * factor : null;
  if (bar != null && c.notionalUsd < bar) {
    return { tier: 'skip', reason: `$${Math.round(c.notionalUsd).toLocaleString()} below rolling p85 $${Math.round(bar).toLocaleString()}` };
  }
  return { tier: 'notable', reason: `$${Math.round(c.notionalUsd).toLocaleString()} ≥ floor${bar != null ? ' and rolling p85' : ''}` };
}
