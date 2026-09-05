import { LCD_ENDPOINTS, fetchJsonOverHttps } from '../injective';

// ── INJ supply ───────────────────────────────────────────────────────────────
// A persistent misconception (repeated even by ambassadors) is that INJ has a
// fixed 100M "max supply". It does not. Genesis was 100M, but the supply is
// DYNAMIC: staking inflation mints INJ, the weekly burn auction destroys it, and
// the net has been deflationary. There is no hard cap. We show the LIVE total
// supply straight from the chain so the number is never a stale myth.
//
// /cosmos/bank/v1beta1/supply/by_denom?denom=inj → { amount: { amount: "<1e18>" } }

const INJ_WAD = 1e18;

export interface InjSupply {
  totalSupply: number | null; // INJ, human units
  source: string | null;
}

export async function fetchInjSupply(): Promise<InjSupply> {
  for (const base of LCD_ENDPOINTS) {
    if (!base) continue;
    const r = await fetchJsonOverHttps(`${base}/cosmos/bank/v1beta1/supply/by_denom?denom=inj`);
    const amt = r && r.status === 200 ? r.body?.amount?.amount : null;
    if (amt != null) {
      const n = Number(amt) / INJ_WAD;
      if (Number.isFinite(n) && n > 0) return { totalSupply: n, source: base };
    }
  }
  return { totalSupply: null, source: null };
}
