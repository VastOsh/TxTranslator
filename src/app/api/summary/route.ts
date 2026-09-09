import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { readStats } from '@/lib/stats/store';
import { computeKeyMetrics } from '@/lib/stats/keymetrics';
import type { StablecoinStats } from '@/lib/stats/stablecoins';
import type { BridgedSnapshot } from '@/lib/stats/bridged';
import { readBridged } from '@/lib/stats/bridgedStore';
import { fetchInjSupply } from '@/lib/stats/supply';
import { fetchTokenPrices } from '@/lib/prices';

// Derive the stablecoin mcap + USDC dominance from a stored bridged snapshot,
// so /api/summary needs no live on-chain bank queries (the daily cron already
// paid for them). Stablecoins are the $1-pegged subset of the bridged set.
function stablecoinsFromSnapshot(snap: BridgedSnapshot): StablecoinStats | null {
  const stable = snap.assets.filter((a) => a.stable);
  const totalUsd = stable.reduce((s, a) => s + a.usd, 0);
  if (!(totalUsd > 0)) return null;
  const bySym = new Map<string, number>();
  for (const a of stable) bySym.set(a.symbol, (bySym.get(a.symbol) ?? 0) + a.usd);
  const usdc = bySym.get('USDC') ?? 0;
  return {
    totalUsd,
    usdcDominance: usdc / totalUsd,
    bySymbol: [...bySym.entries()].map(([symbol, usd]) => ({ symbol, usd })).sort((a, b) => b.usd - a.usd),
  };
}

// Lightweight, window-independent read model. Feeds the Renzu hub hero (7d volume,
// live INJ supply) and the Volume lens's Key Metrics panel (INJ price / market cap
// with the corrected supply, and 24h / 7d / 30d volume + week-over-week change).
// Cached 10 min — the daily aggregate moves once a day and price staleness of a
// few minutes is immaterial for a market-cap tile.
export const maxDuration = 15;

const buildSummary = unstable_cache(
  async () => {
    const [blob, supply, prices, bridgedStore] = await Promise.all([
      readStats(),
      fetchInjSupply(),
      fetchTokenPrices(),
      readBridged().catch(() => null),
    ]);
    const km = computeKeyMetrics(blob);
    const injPrice = typeof prices.INJ === 'number' ? prices.INJ : null;
    // INJ has no locked/unvested overhang and no fixed max, so circulating ≈ total
    // and FDV ≈ market cap. price × live total supply (not the stale 100M many
    // trackers still use) is the honest market cap.
    const marketCap = injPrice != null && supply.totalSupply != null ? injPrice * supply.totalSupply : null;

    // Stablecoins + bridged read straight from the daily bridged snapshot (no live
    // bank queries here). bridgedTvl is the latest snapshot's total; inflows is the
    // day-over-day delta (needs ≥2 snapshots, else null). Up to 24h stale, which is
    // immaterial for supply-based figures and keeps this endpoint fast.
    const days = bridgedStore ? Object.keys(bridgedStore.snapshots).sort() : [];
    const latestSnap = days.length ? bridgedStore!.snapshots[days[days.length - 1]] : null;
    const stablecoins = latestSnap ? stablecoinsFromSnapshot(latestSnap) : null;
    const bridgedTvl = latestSnap?.totalUsd ?? null;
    const inflows24h =
      days.length >= 2
        ? bridgedStore!.snapshots[days[days.length - 1]].totalUsd - bridgedStore!.snapshots[days[days.length - 2]].totalUsd
        : null;

    return {
      vol7d: km.vol7d,
      injSupply: supply.totalSupply,
      daysCounted: km.daysAvailable,
      injPrice,
      marketCap,
      keyMetrics: km,
      stablecoins,
      bridgedTvl,
      inflows24h,
    };
  },
  ['summary-api-v5'],
  { revalidate: 600 },
);

export async function GET() {
  try {
    return NextResponse.json(await buildSummary());
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
