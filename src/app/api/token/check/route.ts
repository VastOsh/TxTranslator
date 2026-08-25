import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { checkToken } from '@/lib/token/check';

// A denom check reads on-chain bank metadata across a few LCD nodes plus the
// verified-token registry; bounded, but give it headroom over the default.
export const maxDuration = 30;

const MAX_QUERY_LEN = 200;

// The verified registry refreshes every ~30 min and a denom's identity is
// effectively static, so cache each query briefly to spare repeat lookups.
const runCheck = (query: string) =>
  unstable_cache(() => checkToken(query), ['token-check-v1', query], { revalidate: 300 })();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const query = typeof body?.query === 'string' ? body.query.trim() : '';

    if (!query) {
      return NextResponse.json({ error: 'Enter a token denom or symbol.' }, { status: 400 });
    }
    if (query.length > MAX_QUERY_LEN) {
      return NextResponse.json({ error: 'Query too long.' }, { status: 400 });
    }

    const result = await runCheck(query);
    return NextResponse.json({ result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
