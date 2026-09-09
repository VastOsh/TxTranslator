import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { fetchChainMetrics } from '@/lib/stats/chain';

// Live Injective onchain metrics for the Volume lens (block height, tx count,
// inflation, staking APR, bonded ratio, community pool, EVM gas). Cached 60s —
// these move per block, but not so fast that a fresh read per request is worth
// the LCD load.
export const maxDuration = 15;

const getMetrics = unstable_cache(fetchChainMetrics, ['chain-metrics-v1'], { revalidate: 60 });

export async function GET() {
  try {
    return NextResponse.json(await getMetrics());
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
