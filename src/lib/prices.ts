// Symbol → CoinGecko ID
const COINGECKO_IDS: Record<string, string> = {
  INJ:   'injective-protocol',
  ATOM:  'cosmos',
  SOL:   'solana',
  TIA:   'celestia',
  WETH:  'weth',
  LINK:  'chainlink',
  ARB:   'arbitrum',
  AAVE:  'aave',
  TON:   'the-open-network',
  MATIC: 'matic-network',
  GRT:   'the-graph',
  SUSHI: 'sushi',
  USDe:  'ethena-usde',
  USDT:  'tether',
  USDC:  'usd-coin',
  BTC:   'bitcoin',
};

// Hardcoded $1 stablecoins (skip the CoinGecko round-trip for these)
const STABLE_USD: Record<string, number> = { USDT: 1, USDC: 1, USDe: 1 };

interface PriceCache {
  prices: Record<string, number>;
  expiresAt: number;
}

let cache: PriceCache | null = null;
const CACHE_TTL_MS = 60_000;

export async function fetchTokenPrices(): Promise<Record<string, number>> {
  if (cache && Date.now() < cache.expiresAt) return cache.prices;

  const ids = Object.values(COINGECKO_IDS).join(',');
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5_000),
    });
    const data: Record<string, { usd?: number }> = await res.json();

    const prices: Record<string, number> = { ...STABLE_USD };
    for (const [symbol, id] of Object.entries(COINGECKO_IDS)) {
      const p = data[id]?.usd;
      if (typeof p === 'number') prices[symbol] = p;
    }

    // Liquid staking / vault LP approximations
    if (prices.INJ) {
      prices.stINJ    = prices.stINJ    ?? prices.INJ;
      prices.hINJ     = prices.hINJ     ?? prices.INJ;
      prices['HPNJ']  = prices['HPNJ']  ?? prices.INJ;
    }

    cache = { prices, expiresAt: Date.now() + CACHE_TTL_MS };
    return prices;
  } catch {
    if (cache) return cache.prices;
    return { ...STABLE_USD };
  }
}

export function usdValue(amount: string, symbol: string, prices: Record<string, number>): number | null {
  const price = prices[symbol];
  if (!price) return null;
  const n = parseFloat(amount);
  if (!isFinite(n) || n <= 0) return null;
  return n * price;
}

export function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000)     return `$${(value / 1_000).toFixed(2)}K`;
  if (value >= 0.01)      return `$${value.toFixed(2)}`;
  return `<$0.01`;
}
