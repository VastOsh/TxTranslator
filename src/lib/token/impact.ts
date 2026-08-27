// ── Sell-impact / slippage on the Trippy bonding curve ──────────────────────
// A launchpad token that hasn't graduated trades against a constant-product
// (x·y=k) virtual-reserve curve. Every parameter is exposed by the launchpad,
// so slippage is exact — no orderbook, no estimate. Verified to the wei against
// real fills: gross INJ out = pairReserve − k/(tokenReserve+Δ), fee = 1% of that,
// spot price = pairReserve / tokenReserve, k = virtualPair × virtualToken.
//
// Reserves as tokens are sold OUT of the curve (users buying) rise on the quote
// side and fall on the token side:
//   tokenReserve = virtualToken − tokensSold
//   pairReserve  = virtualPair  + realPair   (= k / tokenReserve)
// A SELL returns Δ tokens to the curve: tokenReserve grows, quote is paid out.

/** Raw on-curve state, straight from the launchpad's launch record (all wei). */
export interface CurveState {
  virtualPair: string;   // Vp — virtual INJ reserve (18-dec)
  virtualToken: string;  // Vt — virtual token reserve (18-dec)
  tokensSold: string;    // net tokens bought out of the curve = circulating (18-dec)
  realPair: string;      // real INJ accumulated in the curve (18-dec)
  feeBps: number;        // trade fee in basis points (100 = 1%)
}

export interface SellImpactRow {
  label: string;
  tokens: number;          // tokens sold (human units)
  pctCirculating: number;  // share of circulating supply this size represents
  injReceived: number;     // INJ the seller nets after fee
  priceImpactPct: number;  // how far the sell pushes spot price down (%)
}

export interface SellImpact {
  spotPriceInj: number;      // current INJ per token
  circulatingTokens: number; // tokensSold in human units
  curveInjLiquidity: number; // real INJ extractable by fully unwinding (≈ realPair)
  rows: SellImpactRow[];
}

const WAD = 1e18;

/** Exact quote for selling `dTokens` (wei) back into the curve. */
export function quoteCurveSell(curve: CurveState, dTokens: bigint): {
  netInj: number;
  priceImpactPct: number;
} {
  const Vp = BigInt(curve.virtualPair);
  const Vt = BigInt(curve.virtualToken);
  const sold = BigInt(curve.tokensSold);
  const tokenReserve = Vt - sold;
  const pairReserve = Vp + BigInt(curve.realPair);
  if (tokenReserve <= BigInt(0) || dTokens <= BigInt(0)) {
    return { netInj: 0, priceImpactPct: 0 };
  }
  const k = pairReserve * tokenReserve;
  const newTokenReserve = tokenReserve + dTokens;
  const newPairReserve = k / newTokenReserve;
  const gross = pairReserve - newPairReserve;              // INJ out of the curve
  const fee = (gross * BigInt(curve.feeBps)) / BigInt(10000);
  const net = gross - fee;

  const spotBefore = Number(pairReserve) / Number(tokenReserve);
  const spotAfter = Number(newPairReserve) / Number(newTokenReserve);
  const impact = spotBefore > 0 ? (1 - spotAfter / spotBefore) * 100 : 0;

  return { netInj: Number(net) / WAD, priceImpactPct: Math.max(0, impact) };
}

/**
 * Build a small sell-impact table for the token: the largest holder unwinding
 * their bag (when known), plus fractions of the circulating supply. Circulating
 * = tokensSold (tokens users actually hold; the rest is unsold curve reserve).
 */
export function buildSellImpact(
  curve: CurveState,
  opts: { topHolderTokens?: bigint | null } = {},
): SellImpact | null {
  const Vp = BigInt(curve.virtualPair);
  const Vt = BigInt(curve.virtualToken);
  const sold = BigInt(curve.tokensSold);
  const tokenReserve = Vt - sold;
  if (tokenReserve <= BigInt(0) || sold <= BigInt(0)) return null;

  const pairReserve = Vp + BigInt(curve.realPair);
  const spotPriceInj = Number(pairReserve) / Number(tokenReserve);
  const circulating = Number(sold) / WAD;

  // Candidate sell sizes (wei), de-duplicated and kept ≤ circulating supply.
  const sizes: Array<{ label: string; raw: bigint }> = [];
  const top = opts.topHolderTokens ?? null;
  if (top && top > BigInt(0) && top <= sold) {
    sizes.push({ label: 'Largest holder’s bag', raw: top });
  }
  for (const frac of [10, 25, 50, 100]) {
    sizes.push({ label: frac === 100 ? 'All circulating' : `${frac}% of circulating`, raw: (sold * BigInt(frac)) / BigInt(100) });
  }

  const seen = new Set<string>();
  const rows: SellImpactRow[] = [];
  for (const s of sizes) {
    if (s.raw <= BigInt(0)) continue;
    const key = s.raw.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    const q = quoteCurveSell(curve, s.raw);
    rows.push({
      label: s.label,
      tokens: Number(s.raw) / WAD,
      pctCirculating: (Number(s.raw) / Number(sold)) * 100,
      injReceived: q.netInj,
      priceImpactPct: q.priceImpactPct,
    });
  }

  return {
    spotPriceInj,
    circulatingTokens: circulating,
    curveInjLiquidity: Number(BigInt(curve.realPair)) / WAD,
    rows,
  };
}
