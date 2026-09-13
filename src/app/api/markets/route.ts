import { NextResponse } from 'next/server';
import { fetchPerpFunding } from '@/lib/perps/markets';
import { readPerpSnapshot, type PerpSnapRow } from '@/lib/perps/snapshot';

// Public read model for the Perp Markets lens. Funding + market metadata are
// read live (cheap, one indexer call); open interest and skew are merged in
// from the cron-cached snapshot, carrying its own `asOf` so the page can show
// how fresh they are. Cached 60s at the edge since funding moves hourly.
export const dynamic = 'force-dynamic';
export const maxDuration = 25;

export async function GET() {
  try {
    const [funding, snap] = await Promise.all([fetchPerpFunding(), readPerpSnapshot()]);
    const oi = new Map<string, PerpSnapRow>();
    for (const r of snap?.markets ?? []) oi.set(r.marketId, r);

    const markets = funding.map((f) => {
      const s = oi.get(f.marketId);
      const aprPct = f.lastHourlyRate != null ? f.lastHourlyRate * 24 * 365 * 100 : null;
      return {
        marketId: f.marketId,
        ticker: f.ticker,
        baseSymbol: f.baseSymbol,
        quoteSymbol: f.quoteSymbol,
        isTradFi: f.isTradFi,
        hourlyRatePct: f.lastHourlyRate != null ? f.lastHourlyRate * 100 : null,
        fundingAprPct: aprPct,
        nextFundingTs: f.nextFundingTs,
        maxLeverage: f.maxLeverage,
        takerFeeRate: f.takerFeeRate,
        makerFeeRate: f.makerFeeRate,
        markPrice: s?.markPrice ?? null,
        oiUsd: s?.oiUsd ?? null,
        skewLongPct: s?.skewLongPct ?? null,
        positionCount: s?.positionCount ?? null,
        oiTruncated: s?.truncated ?? false,
      };
    });

    return NextResponse.json(
      { asOf: snap?.asOf ?? 0, count: markets.length, markets },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error.';
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
