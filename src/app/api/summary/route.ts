import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { readStats } from '@/lib/stats/store';
import { rollup } from '@/lib/stats/rollup';
import { fetchInjSupply } from '@/lib/stats/supply';

// Lightweight read model for the Renzu hub hero. Keeps the landing page's headline
// stats (7d verified volume, live INJ supply) dynamic without shipping the full
// /api/stats payload. Cached 10 min — the numbers only move once a day / per block.
export const maxDuration = 15;

const buildSummary = unstable_cache(
  async () => {
    const [blob, supply] = await Promise.all([readStats(), fetchInjSupply()]);
    return {
      vol7d: rollup(blob, '7d').totals.volumeUsd,
      injSupply: supply.totalSupply,
      daysCounted: rollup(blob, 'all').daysCounted,
    };
  },
  ['summary-api-v1'],
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
