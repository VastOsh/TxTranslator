import { bankSupplyRaw } from './supply';

// ── Bridged assets ───────────────────────────────────────────────────────────
// The significant non-native (bridged / cross-chain) assets on Injective, by
// bank denom. Value = supply x price, so summing them gives the tracked bridged
// value on-chain. Not exhaustive — the priceable majors (stablecoins dominate,
// then WETH / WBTC / ATOM). A daily snapshot of this is stored (bridgedStore) so
// the day-over-day delta yields net inflows, which a single reading can't give.
// Keep the list current as new bridged assets gain real supply.

export interface BridgedAsset {
  symbol: string;
  denom: string;
  decimals: number;
  priceSymbol: string; // key into fetchTokenPrices()
  stable?: boolean;    // priced at $1, skip the price lookup
}

export const BRIDGED_ASSETS: BridgedAsset[] = [
  { symbol: 'USDT', denom: 'peggy0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, priceSymbol: 'USDT', stable: true },
  { symbol: 'USDC', denom: 'erc20:0xa00C59fF5a080D2b954d0c75e46E22a0c371235a', decimals: 6, priceSymbol: 'USDC', stable: true },
  { symbol: 'USDC', denom: 'ibc/2CBC2EA121AE42563B08028466F37B600F2D7D4282342DE938283CC3FB2BC00E', decimals: 6, priceSymbol: 'USDC', stable: true },
  { symbol: 'USDe', denom: 'peggy0x4c9EDD5852cd905f086C759E8383e09bff1E68B3', decimals: 18, priceSymbol: 'USDe', stable: true },
  { symbol: 'WETH', denom: 'peggy0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18, priceSymbol: 'WETH' },
  { symbol: 'WBTC', denom: 'peggy0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8, priceSymbol: 'BTC' },
  { symbol: 'ATOM', denom: 'ibc/C4CFF46FD6DE35CA4CF4CE031E643C8FDC9BA4B99AE598E9B0ED98FE3A2319F9', decimals: 6, priceSymbol: 'ATOM' },
];

export interface BridgedAssetValue {
  symbol: string;
  denom: string;
  supply: number; // human units
  usd: number;
}

export interface BridgedSnapshot {
  totalUsd: number;
  stableUsd: number;
  assets: BridgedAssetValue[];
}

export async function fetchBridgedSnapshot(prices: Record<string, number>): Promise<BridgedSnapshot | null> {
  const values = await Promise.all(
    BRIDGED_ASSETS.map(async (a) => {
      const raw = await bankSupplyRaw(a.denom);
      const supply = raw == null ? 0 : raw / 10 ** a.decimals;
      const price = a.stable ? 1 : prices[a.priceSymbol] ?? 0;
      return { symbol: a.symbol, denom: a.denom, supply, usd: supply * price, stable: !!a.stable };
    }),
  );

  let totalUsd = 0;
  let stableUsd = 0;
  for (const v of values) {
    totalUsd += v.usd;
    if (v.stable) stableUsd += v.usd;
  }
  if (!(totalUsd > 0)) return null;

  return {
    totalUsd,
    stableUsd,
    assets: values.map(({ symbol, denom, supply, usd }) => ({ symbol, denom, supply, usd })),
  };
}
