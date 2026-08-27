import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { buildWalletIntel } from '@/lib/wallet/intel';
import { toInj } from '@/lib/address';

// Aggregates a handful of bounded indexer + launchpad reads; give it headroom.
export const maxDuration = 30;

// A wallet's age, funder, and launch record are effectively static, so cache
// each address briefly to spare repeat lookups.
const runIntel = (inj: string) =>
  unstable_cache(() => buildWalletIntel(inj), ['wallet-intel-v1', inj], { revalidate: 300 })();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const raw = typeof body?.address === 'string' ? body.address.trim() : '';
    const inj = toInj(raw); // accepts inj1… or 0x…
    if (!inj) {
      return NextResponse.json({ error: 'Enter a valid Injective address (inj1… or 0x…).' }, { status: 400 });
    }
    const intel = await runIntel(inj);
    return NextResponse.json({ intel });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
