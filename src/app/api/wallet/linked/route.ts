import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { buildLinkedWallets } from '@/lib/wallet/linked';
import { toInj } from '@/lib/address';

// A bounded but multi-hop seed-graph scan (funder up, siblings and children
// down), each candidate re-verified. Give it real headroom, and cache per
// address for a while since funding relationships are effectively immutable.
export const maxDuration = 45;

const runLinked = (inj: string) =>
  unstable_cache(() => buildLinkedWallets(inj), ['wallet-linked-v1', inj], { revalidate: 1800 })();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const raw = typeof body?.address === 'string' ? body.address.trim() : '';
    const inj = toInj(raw); // accepts inj1… or 0x…
    if (!inj) {
      return NextResponse.json({ error: 'Enter a valid Injective address (inj1… or 0x…).' }, { status: 400 });
    }
    const linked = await runLinked(inj);
    return NextResponse.json({ linked });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
