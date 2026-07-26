import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { buildBuybackProfile } from '@/lib/buyback/rounds';

const ADDR_RE = /^inj1[a-z0-9]{38}$/;

// Round discovery + per-round wallet lookups run at bounded concurrency, but a
// wallet with many rounds and slow LCD nodes can still exceed the default 10s.
export const maxDuration = 60;

// A wallet's past-round buyback record is immutable, and the open round barely
// moves minute to minute, so cache per address to spare repeat contract sweeps.
const getProfile = (address: string) =>
  unstable_cache(() => buildBuybackProfile(address), ['buyback-profile', address], {
    revalidate: 120,
  })();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const address = typeof body?.address === 'string' ? body.address.trim() : '';

    if (!ADDR_RE.test(address)) {
      return NextResponse.json({ error: 'Invalid Injective address.' }, { status: 400 });
    }

    const profile = await getProfile(address);
    return NextResponse.json({ profile });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
