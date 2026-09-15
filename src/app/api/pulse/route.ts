import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { buildPulse } from '@/lib/pulse/build';

// Read model for the Pulse fact sheet (/pulse). Everything is composed from
// stored aggregates and a couple of live LCD reads, so it is cheap; cached 5 min
// because the daily-aggregate figures move once a day and price/height staleness
// of a few minutes is immaterial for a reference card.
export const maxDuration = 20;

const getPulse = unstable_cache(buildPulse, ['pulse-api-v1'], { revalidate: 300 });

export async function GET() {
  try {
    return NextResponse.json(await getPulse());
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
