import type { FeedCandidate } from './watch';

// Static USD floors calibrated to INJ ≈ $4.85 (July 2026). M2 layers a
// rolling top-percentile window on top; these are the hard minimums.
const FLOOR_USD: Record<FeedCandidate['kind'], number> = {
  perp_open: 25_000,
  liquidation: 15_000,
};

const HERO_USD: Record<FeedCandidate['kind'], number> = {
  perp_open: 150_000,
  liquidation: 100_000,
};

// Tokenized stocks / FX are the exclusive content — halve the bar for them
const TRADFI_FLOOR_FACTOR = 0.5;

// FEED_TEST_MODE=1 drops the floors 100× and relaxes the hourly cap so a
// private test channel sees traffic quickly. Posts get a [TEST] prefix.
export const TEST_MODE = process.env.FEED_TEST_MODE === '1';
const TEST_FLOOR_FACTOR = TEST_MODE ? 0.01 : 1;

// Hero-tier events bypass this cap; everything else queues behind it
export const MAX_POSTS_PER_HOUR = TEST_MODE ? 20 : 3;

export type Tier = 'skip' | 'notable' | 'hero';

export interface Decision {
  tier: Tier;
  reason: string;
}

export function decide(c: FeedCandidate): Decision {
  const factor = (c.isTradFi ? TRADFI_FLOOR_FACTOR : 1) * TEST_FLOOR_FACTOR;
  const floor = FLOOR_USD[c.kind] * factor;
  const hero = HERO_USD[c.kind] * factor;

  if (c.notionalUsd < floor) {
    return { tier: 'skip', reason: `$${Math.round(c.notionalUsd).toLocaleString()} below $${floor.toLocaleString()} floor` };
  }
  if (c.notionalUsd >= hero) {
    return { tier: 'hero', reason: `$${Math.round(c.notionalUsd).toLocaleString()} ≥ hero threshold` };
  }
  return { tier: 'notable', reason: `$${Math.round(c.notionalUsd).toLocaleString()} ≥ floor` };
}
