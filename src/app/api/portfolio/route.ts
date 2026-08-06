import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { buildPortfolio } from '@/lib/portfolio/nft';

const ADDR_RE = /^inj1[a-z0-9]{38}$/;

// A wallet's holdings are scanned across the full Talis CW721 collection set,
// then per-token metadata is resolved over IPFS — the slow leg. Give it headroom
// beyond the default so a cold cache on a busy wallet doesn't get cut off.
export const maxDuration = 120;

// Ownership changes only when the wallet trades an NFT, so a short per-address
// cache spares repeat full-registry sweeps without going stale for long.
const getPortfolio = (address: string) =>
  unstable_cache(() => buildPortfolio(address), ['nft-portfolio-v1', address], {
    revalidate: 300,
  })();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const address = typeof body?.address === 'string' ? body.address.trim() : '';

    if (!ADDR_RE.test(address)) {
      return NextResponse.json({ error: 'Invalid Injective address.' }, { status: 400 });
    }

    const portfolio = await getPortfolio(address);
    return NextResponse.json({ portfolio });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
