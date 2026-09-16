import { readStats } from '@/lib/stats/store';
import { computeKeyMetrics } from '@/lib/stats/keymetrics';
import { fetchInjSupply } from '@/lib/stats/supply';
import { fetchTokenPrices } from '@/lib/prices';
import { readBridged } from '@/lib/stats/bridgedStore';
import { fetchChainMetrics } from '@/lib/stats/chain';
import { fetchBurnSummary } from '@/lib/stats/burn';
import { readPerpSnapshot } from '@/lib/perps/snapshot';
import { readRollup } from '@/lib/leaderboard/store';

// ── Renzu Pulse ──────────────────────────────────────────────────────────────
// The state-of-Injective fact sheet: one read model that gathers every headline
// number an ambassador needs to quote, each read straight from the chain. It is
// pure composition of engines Renzu already runs (Volume aggregate, chain LCD
// metrics, INJ burn, bridged snapshot, perp snapshot, leaderboard rollup), so it
// adds no new indexer load and no new cron. Every group carries its own asOf so
// the UI can timestamp each fact honestly: volume is a daily aggregate, chain
// vitals are live, perps come from the markets snapshot. Fields are null when the
// underlying store has not been populated yet; the page hides those facts rather
// than guessing.

export interface Pulse {
  asOf: number; // when this response was built (ms epoch)
  volumeAsOf: number | null; // daily volume aggregate updatedAt (ms)
  perpAsOf: number | null; // perp snapshot asOf (ms)
  bridgedAsOf: string | null; // YYYY-MM-DD of the latest bridged snapshot
  daysCounted: number; // days of volume coverage behind the windows
  token: {
    injPrice: number | null;
    marketCap: number | null;
    supply: number | null; // INJ, human units (circulating approx equals total)
    inflation: number | null; // fraction
    stakingApr: number | null; // fraction
    bondedInj: number | null;
    bondedRatio: number | null; // fraction of supply staked
  };
  volume: {
    v24h: number | null;
    v7d: number | null;
    v30d: number | null;
    deriv24h: number | null;
    spot24h: number | null;
    weeklyChange: number | null; // fraction, this 7d vs the prior 7d
  };
  burn: {
    cumulativeInj: number | null; // over the rounds the summary covers
    roundsCovered: number | null;
    latestRound: number | null;
    latestInj: number | null;
    latestUsd: number | null;
  };
  capital: {
    stablecoinUsd: number | null; // $1-pegged bridged assets
    bridgedTvl: number | null; // all bridged assets at market value
    inflows24h: number | null; // day-over-day change in bridged value
  };
  chain: {
    blockHeight: number | null;
    blockTimeSec: number | null;
    totalTxs: number | null;
    communityPoolInj: number | null;
    communityPoolUsd: number | null;
  };
  perps: {
    totalOiUsd: number | null; // summed one-sided OI across active perps
    openPositions: number | null; // total open positions in the snapshot
    activeMarkets: number | null; // perps carrying an open position
    topTrader30dPnl: number | null; // best realized net PnL over 30d
    topTrader30dAddr: string | null;
    profitableTraders30d: number | null; // traders in the black over 30d
  };
}

export async function buildPulse(): Promise<Pulse> {
  const [blob, supply, prices, bridgedStore, chain, burn, perp, rollup] = await Promise.all([
    readStats(),
    fetchInjSupply(),
    fetchTokenPrices(),
    readBridged().catch(() => null),
    fetchChainMetrics().catch(() => null),
    fetchBurnSummary().catch(() => null),
    readPerpSnapshot().catch(() => null),
    readRollup().catch(() => null),
  ]);

  const km = computeKeyMetrics(blob);
  const injPrice = typeof prices.INJ === 'number' ? prices.INJ : null;
  // INJ has no locked overhang and no fixed max, so circulating approximates total
  // and price times live total supply is the honest market cap (not the stale
  // 100M many trackers still quote).
  const marketCap = injPrice != null && supply.totalSupply != null ? injPrice * supply.totalSupply : null;

  // Capital: read straight from the latest daily bridged snapshot (no live bank
  // queries). Inflows is the day-over-day delta in total bridged value, so it
  // needs at least two snapshots.
  const bDays = bridgedStore ? Object.keys(bridgedStore.snapshots).sort() : [];
  const latestSnap = bDays.length ? bridgedStore!.snapshots[bDays[bDays.length - 1]] : null;
  const inflows24h =
    bDays.length >= 2
      ? bridgedStore!.snapshots[bDays[bDays.length - 1]].totalUsd - bridgedStore!.snapshots[bDays[bDays.length - 2]].totalUsd
      : null;

  const latestUsd = burn?.latest && injPrice != null ? burn.latest.injBurned * injPrice : null;

  // Perps: fold the snapshot into three headline totals. oiUsd is one-sided
  // notional per market, so summing gives total open interest across the book.
  let totalOiUsd: number | null = null;
  let openPositions: number | null = null;
  let activeMarkets: number | null = null;
  if (perp && perp.markets.length > 0) {
    totalOiUsd = perp.markets.reduce((s, m) => s + (m.oiUsd || 0), 0);
    openPositions = perp.markets.reduce((s, m) => s + (m.positionCount || 0), 0);
    activeMarkets = perp.markets.filter((m) => m.positionCount > 0).length;
  }

  // Leaderboard: the 30d window's best realized net PnL and how many traders it
  // ranks in the black, both from the precomputed rollup.
  const r30 = rollup?.ranges?.['30d'] ?? null;
  const rows30 = r30?.rows ?? [];
  const topRow = rows30.length ? rows30[0] : null;
  const profitable30 = rows30.length ? rows30.filter((row) => row.netPnlUsd > 0).length : null;

  return {
    asOf: Date.now(),
    volumeAsOf: blob.updatedAt || null,
    perpAsOf: perp?.asOf ?? null,
    bridgedAsOf: bDays.length ? bDays[bDays.length - 1] : null,
    daysCounted: km.daysAvailable,
    token: {
      injPrice,
      marketCap,
      supply: supply.totalSupply,
      inflation: chain?.inflation ?? null,
      stakingApr: chain?.stakingApr ?? null,
      bondedInj: chain?.bondedInj ?? null,
      bondedRatio: chain?.bondedRatio ?? null,
    },
    volume: {
      v24h: km.vol24h || null,
      v7d: km.vol7d || null,
      v30d: km.vol30d || null,
      deriv24h: km.deriv24h || null,
      spot24h: km.spot24h || null,
      weeklyChange: km.weeklyChange,
    },
    burn: {
      cumulativeInj: burn?.cumulativeInj ?? null,
      roundsCovered: burn?.roundsCovered ?? null,
      latestRound: burn?.latest?.round ?? null,
      latestInj: burn?.latest?.injBurned ?? null,
      latestUsd,
    },
    capital: {
      stablecoinUsd: latestSnap?.stableUsd ?? null,
      bridgedTvl: latestSnap?.totalUsd ?? null,
      inflows24h,
    },
    chain: {
      blockHeight: chain?.blockHeight ?? null,
      blockTimeSec: chain?.blockTimeSec ?? null,
      totalTxs: chain?.totalTxs ?? null,
      communityPoolInj: chain?.communityPoolInj ?? null,
      communityPoolUsd: chain?.communityPoolUsd ?? null,
    },
    perps: {
      totalOiUsd,
      openPositions,
      activeMarkets,
      topTrader30dPnl: topRow?.netPnlUsd ?? null,
      topTrader30dAddr: topRow?.address ?? null,
      profitableTraders30d: profitable30,
    },
  };
}
