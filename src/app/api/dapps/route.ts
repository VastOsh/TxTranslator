import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { buildDappDirectory, buildDappDetail } from '@/lib/dapps/registry';

// ~36 wasm lookups in parallel ≈ 9s cold; cached so most hits are instant.
export const maxDuration = 60;

const getDirectory = unstable_cache(buildDappDirectory, ['dapp-directory'], { revalidate: 600 });
const getDetail = (slug: string) =>
  unstable_cache(() => buildDappDetail(slug), ['dapp-detail', slug], { revalidate: 600 })();

export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get('slug');
    if (slug) {
      const detail = await getDetail(slug);
      if (!detail) {
        return NextResponse.json({ error: 'Unknown dApp.' }, { status: 404 });
      }
      return NextResponse.json({ detail });
    }
    const dapps = await getDirectory();
    return NextResponse.json({ dapps });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
