import { unstable_cache } from 'next/cache';

// When a launchpad token "bonds" (completes its curve), it graduates to a real
// spot market on Injective's exchange module — the shared on-chain order book
// that Choice, Helix and other frontends all trade against. So a token's market
// is both a legitimacy signal (it actually graduated and has real liquidity) and
// the canonical place to trade the *real* one. Impostors usually have no market.

export interface SpotMarket {
  ticker: string;
  marketId: string;
  baseDenom: string;
  quoteDenom: string;
  status: string;
}

const HOSTS = [
  'https://sentry.exchange.grpc-web.injective.network',
  'https://k8s.mainnet.exchange.grpc-web.injective.network',
];

/* eslint-disable @typescript-eslint/no-explicit-any */
async function fetchSpotMarkets(): Promise<SpotMarket[]> {
  for (const host of HOSTS) {
    try {
      const res = await fetch(`${host}/api/exchange/spot/v1/markets`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) continue;
      const j = await res.json();
      const ms: any[] = Array.isArray(j?.markets) ? j.markets : [];
      if (!ms.length) continue;
      return ms.map((m) => ({
        ticker: m.ticker ?? '',
        marketId: m.marketId ?? m.market_id ?? '',
        baseDenom: m.baseDenom ?? m.base_denom ?? '',
        quoteDenom: m.quoteDenom ?? m.quote_denom ?? '',
        status: m.marketStatus ?? m.market_status ?? '',
      }));
    } catch {
      continue;
    }
  }
  return [];
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Cached list of all spot markets (empty if the indexer is unreachable). */
export const getSpotMarkets = unstable_cache(fetchSpotMarkets, ['spot-markets-v1'], {
  revalidate: 300,
});

/** The spot market whose base asset is `denom` (prefer an active one), or null. */
export async function findSpotMarketByBase(denom: string): Promise<SpotMarket | null> {
  const markets = await getSpotMarkets();
  const matches = markets.filter((m) => m.baseDenom === denom);
  if (!matches.length) return null;
  return matches.find((m) => m.status === 'active') ?? matches[0];
}

/** Helix trade URL for a market ticker ("XIII/INJ" → helixapp.com/spot/xiii-inj). */
export function helixSpotUrl(ticker: string): string | null {
  const slug = ticker.trim().toLowerCase().replace(/\s+/g, '').replace('/', '-');
  return slug ? `https://helixapp.com/spot/${slug}` : null;
}
