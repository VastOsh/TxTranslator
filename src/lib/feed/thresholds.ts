import type { FeedCandidate } from './watch';

// Static USD floors calibrated against a 24h indexer sample (July 2026):
// distinct-whale opens ≥$25k ≈ 1-2/day once bot bursts are cooled down;
// liquidations ≥$1k were zero all day, so the liq bar sits low — rekt posts
// are rare, high-value events. M2 layers a rolling top-percentile window on
// top; these are the hard minimums.
//
// position_close gates on |realized pnl|, not notional — a $30k close for
// +$12 is noise; a $10k close for +$8k is the story. Same 24h sample had
// zero closes with |pnl| ≥ $500, so these floors are armed for volatile
// days rather than daily volume.
const FLOOR_USD: Record<FeedCandidate['kind'], number> = {
  perp_open: 25_000,
  liquidation: 5_000,
  position_close: 1_000,
};

const HERO_USD: Record<FeedCandidate['kind'], number> = {
  perp_open: 150_000,
  liquidation: 50_000,
  position_close: 10_000,
};

// Voluntarily cutting a loss is only a story when it's big — wins carry the
// feed ("someone just banked $5k"), losses need a higher bar.
const CLOSE_LOSS_FACTOR = 2.5;

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
  const isClose = c.kind === 'position_close';
  const lossFactor = isClose && (c.pnlUsd ?? 0) < 0 ? CLOSE_LOSS_FACTOR : 1;
  const factor = (c.isTradFi ? TRADFI_FLOOR_FACTOR : 1) * TEST_FLOOR_FACTOR * lossFactor;
  const floor = FLOOR_USD[c.kind] * factor;
  const hero = HERO_USD[c.kind] * factor;

  // Closes are judged on the realized result; everything else on size
  const value = isClose ? Math.abs(c.pnlUsd ?? 0) : c.notionalUsd;
  const label = isClose ? 'pnl' : '';

  if (value >= hero) {
    return { tier: 'hero', reason: `${label}$${Math.round(value).toLocaleString()} ≥ hero threshold` };
  }
  if (value < floor) {
    return { tier: 'skip', reason: `${label}$${Math.round(value).toLocaleString()} below $${floor.toLocaleString()} floor` };
  }
  // The window holds real (unscaled) open notionals, so the bar takes the
  // same TradFi/test scaling as the floors. It only ever gates opens.
  const bar = c.kind === 'perp_open' && dynamicBarUsd != null ? dynamicBarUsd * factor : null;
  if (bar != null && value < bar) {
    return { tier: 'skip', reason: `$${Math.round(value).toLocaleString()} below rolling p85 $${Math.round(bar).toLocaleString()}` };
  }
  return { tier: 'notable', reason: `${label}$${Math.round(value).toLocaleString()} ≥ floor${bar != null ? ' and rolling p85' : ''}` };
}
