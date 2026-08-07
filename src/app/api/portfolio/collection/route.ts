import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { fetchCollectionItems } from '@/lib/portfolio/nft';

const ADDR_RE = /^inj1[a-z0-9]{38}$/;

// The "show all" expander for one collection: page the wallet's full owned set
// in that contract and resolve an image for each. IPFS is the slow leg, so give
// it the same headroom as the main portfolio scan.
export const maxDuration = 120;

// Keyed on wallet + collection; ownership only changes on a trade, so a short
// cache spares repeat metadata sweeps when a user collapses and re-expands.
const getItems = (owner: string, collection: string) =>
  unstable_cache(
    () => fetchCollectionItems(owner, collection),
    ['nft-collection-items-v1', owner, collection],
    { revalidate: 300 },
  )();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const address = typeof body?.address === 'string' ? body.address.trim() : '';
    const collection = typeof body?.collection === 'string' ? body.collection.trim() : '';

    if (!ADDR_RE.test(address) || !ADDR_RE.test(collection)) {
      return NextResponse.json({ error: 'Invalid Injective address.' }, { status: 400 });
    }

    const result = await getItems(address, collection);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
