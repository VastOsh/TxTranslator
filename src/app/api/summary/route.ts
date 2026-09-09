import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { readStats } from '@/lib/stats/store';
import { computeKeyMetrics } from '@/lib/stats/keymetrics';
import { fetchInjSupply } from '@/lib/stats/supply';
import { fetchTokenPrices } from '@/lib/prices';

// Lightweight, window-independent read model. Feeds the Renzu hub hero (7d volume,
// live INJ supply) and the Volume lens's Key Metrics panel (INJ price / market cap
// with the corrected supply, and 24h / 7d / 30d volume + week-over-week change).
// Cached 10 min — the daily aggregate moves once a day and price staleness of a
// few minutes is immaterial for a market-cap tile.
export const maxDuration = 15;

const buildSummary = unstable_cache(
  async () => {
    const [blob, supply, prices] = await Promise.all([readStats(), fetchInjSupply(), fetchTokenPrices()]);
    const km = computeKeyMetrics(blob);
    const injPrice = typeof prices.INJ === 'number' ? prices.INJ : null;
    // INJ has no locked/unvested overhang and no fixed max, so circulating ≈ total
    // and FDV ≈ market cap. price × live total supply (not the stale 100M many
    // trackers still use) is the honest market cap.
    const marketCap = injPrice != null && supply.totalSupply != null ? injPrice * supply.totalSupply : null;
    return {
      vol7d: km.vol7d,
      injSupply: supply.totalSupply,
      daysCounted: km.daysAvailable,
      injPrice,
      marketCap,
      keyMetrics: km,
    };
  },
  ['summary-api-v2'],
  { revalidate: 600 },
);

export async function GET() {
  try {
    return NextResponse.json(await buildSummary());
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
