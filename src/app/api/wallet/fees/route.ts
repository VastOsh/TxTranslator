import { NextRequest, NextResponse } from 'next/server';
import { buildWalletFootprint } from '@/lib/wallet/footprint';

const ADDR_RE = /^inj1[a-z0-9]{38}$/;

// Up to ten sequential indexer pages — past the default 10s budget.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const address = typeof body?.address === 'string' ? body.address.trim() : '';

    if (!ADDR_RE.test(address)) {
      return NextResponse.json({ error: 'Invalid Injective address.' }, { status: 400 });
    }

    const footprint = await buildWalletFootprint(address);
    return NextResponse.json({ footprint });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
