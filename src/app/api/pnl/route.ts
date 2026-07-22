import { NextRequest, NextResponse } from 'next/server';
import { buildPnlReport, PNL_RANGES } from '@/lib/pnl/aggregate';

const ADDR_RE = /^inj1[a-z0-9]{38}$/;

// Six sequential indexer pages, so budget well past the default 10s.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const address = typeof body?.address === 'string' ? body.address.trim() : '';
    const range = typeof body?.range === 'string' && body.range in PNL_RANGES ? body.range : '7d';

    if (!ADDR_RE.test(address)) {
      return NextResponse.json({ error: 'Invalid Injective address.' }, { status: 400 });
    }

    const report = await buildPnlReport(address, range);
    return NextResponse.json({ report, range });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
