import { LCD_ENDPOINTS, fetchJsonOverHttps } from '../injective';

// ── Stablecoin market cap ────────────────────────────────────────────────────
// Every stablecoin on Injective is a bank denom with a public total supply, so
// the on-chain stablecoin market cap is just (supply x $1) summed over the set,
// no adapter or aggregator needed. This is the curated set of the significant
// $1-pegged stablecoins; sum verified against DeFiLlama (~$12.9M, USDC ~65%).
// Keep it current as new stablecoins gain traction on-chain.

interface StableDef {
  symbol: string;
  denom: string;
  decimals: number;
}

const STABLES: StableDef[] = [
  { symbol: 'USDT', denom: 'peggy0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },       // Ethereum-bridged USDT
  { symbol: 'USDC', denom: 'erc20:0xa00C59fF5a080D2b954d0c75e46E22a0c371235a', decimals: 6 },       // native-EVM USDC (the majority)
  { symbol: 'USDC', denom: 'ibc/2CBC2EA121AE42563B08028466F37B600F2D7D4282342DE938283CC3FB2BC00E', decimals: 6 }, // Noble USDC
  { symbol: 'USDe', denom: 'peggy0x4c9EDD5852cd905f086C759E8383e09bff1E68B3', decimals: 18 },       // Ethena USDe
];

export interface StablecoinStats {
  totalUsd: number;
  usdcDominance: number | null; // fraction of totalUsd held in USDC
  bySymbol: Array<{ symbol: string; usd: number }>;
}

async function supplyOf(denom: string): Promise<number | null> {
  const enc = encodeURIComponent(denom); // erc20:/ibc denoms contain ':' and '/'
  for (const base of LCD_ENDPOINTS) {
    if (!base) continue;
    const r = await fetchJsonOverHttps(`${base}/cosmos/bank/v1beta1/supply/by_denom?denom=${enc}`);
    if (r && r.status === 200) {
      const amt = r.body?.amount?.amount;
      const n = amt != null ? Number(amt) : NaN;
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

export async function fetchStablecoinStats(): Promise<StablecoinStats | null> {
  const usds = await Promise.all(
    STABLES.map(async (s) => {
      const raw = await supplyOf(s.denom);
      return raw == null ? 0 : raw / 10 ** s.decimals; // price pegged to $1
    }),
  );

  let total = 0;
  const bySym = new Map<string, number>();
  STABLES.forEach((s, i) => {
    total += usds[i];
    bySym.set(s.symbol, (bySym.get(s.symbol) ?? 0) + usds[i]);
  });

  if (!(total > 0)) return null;

  const usdc = bySym.get('USDC') ?? 0;
  return {
    totalUsd: total,
    usdcDominance: usdc / total,
    bySymbol: [...bySym.entries()].map(([symbol, usd]) => ({ symbol, usd })).sort((a, b) => b.usd - a.usd),
  };
}
