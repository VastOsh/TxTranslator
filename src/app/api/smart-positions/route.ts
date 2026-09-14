import { NextResponse } from 'next/server';
import { readSmartPositions } from '@/lib/smartmoney/positions';

// Public read model for the Smart Money Positions lens: the top traders' live
// open book, aggregated per market, from the snapshot the perp cron refreshes.
// One blob read; cached briefly at the edge.
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function GET() {
  const snap = await readSmartPositions();
  if (!snap) {
    return NextResponse.json(
      { asOf: 0, tradersScanned: 0, tradersWithPositions: 0, positionCount: 0, markets: [], positions: [], note: 'Snapshot not built yet.' },
      { headers: { 'Cache-Control': 'public, s-maxage=60' } },
    );
  }
  return NextResponse.json(snap, {
    headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' },
  });
}
