import { INDEXER_BASE, fetchJsonOverHttps } from '../injective';
import { isTradFiMarket } from '../feed/watch';

// ── Live perp market metadata + funding ──────────────────────────────────────
// One read of the active-derivatives endpoint gives everything the Perp Markets
// lens shows live: the last realized hourly funding rate, its cap, the next
// funding time, max leverage (from the initial margin ratio), and the on-chain
// fee rates. Open interest and long/short skew are heavier (they need a
// position scan) and come from a cron-cached snapshot instead; see snapshot.ts.

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface PerpFunding {
  marketId: string;
  ticker: string;
  baseSymbol: string;
  quoteSymbol: string;
  quoteDecimals: number;
  isTradFi: boolean;
  /** Last realized hourly funding rate, as a fraction (e.g. 0.0000568). */
  lastHourlyRate: number | null;
  /** Hourly funding cap, as a fraction. */
  fundingCap: number | null;
  /** Next funding application, unix seconds. */
  nextFundingTs: number | null;
  maxLeverage: number | null;
  takerFeeRate: number | null;
  makerFeeRate: number | null;
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function fetchPerpFunding(): Promise<PerpFunding[]> {
  const res = await fetchJsonOverHttps(
    `${INDEXER_BASE}/api/exchange/derivative/v1/markets?market_status=active`,
  );
  const markets: any[] = res?.body?.markets ?? [];
  const out: PerpFunding[] = [];

  for (const entry of markets) {
    const m = entry.market ?? entry;
    if (!m.isPerpetual) continue;
    const marketId: string = (m.marketId ?? '').toLowerCase();
    const ticker: string = m.ticker ?? '';
    if (!marketId || !ticker) continue;

    const info = m.perpetualMarketInfo ?? {};
    const funding = m.perpetualMarketFunding ?? {};
    const baseSymbol = ticker.split('/')[0] ?? ticker;
    const imr = num(m.initialMarginRatio);

    out.push({
      marketId,
      ticker,
      baseSymbol,
      quoteSymbol: m.quoteTokenMeta?.symbol ?? 'USD',
      quoteDecimals: Number(m.quoteTokenMeta?.decimals ?? 6),
      isTradFi: isTradFiMarket(m.oracleType ?? '', baseSymbol),
      lastHourlyRate: num(funding.lastFundingRate),
      fundingCap: num(info.hourlyFundingRateCap),
      nextFundingTs: num(info.nextFundingTimestamp),
      maxLeverage: imr && imr > 0 ? 1 / imr : null,
      takerFeeRate: num(m.takerFeeRate),
      makerFeeRate: num(m.makerFeeRate),
    });
  }
  return out;
}

/* eslint-enable @typescript-eslint/no-explicit-any */
