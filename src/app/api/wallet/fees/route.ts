import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { buildWalletFootprint } from '@/lib/wallet/footprint';

const ADDR_RE = /^inj1[a-z0-9]{38}$/;

// Up to ten sequential indexer pages — past the default 10s budget.
export const maxDuration = 60;

// Cache each wallet's footprint briefly so a page refresh or a bot re-fetching
// the same address doesn't trigger a fresh 6-page indexer sweep every time. A
// wallet's fee history barely moves in two minutes, so this is nearly free
// freshness for a big cut in indexer load and repeat-view latency.
const getFootprint = (address: string) =>
  unstable_cache(() => buildWalletFootprint(address), ['wallet-footprint', address], {
    revalidate: 120,
  })();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const address = typeof body?.address === 'string' ? body.address.trim() : '';

    if (!ADDR_RE.test(address)) {
      return NextResponse.json({ error: 'Invalid Injective address.' }, { status: 400 });
    }

    const footprint = await getFootprint(address);
    return NextResponse.json({ footprint });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
