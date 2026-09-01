import { INDEXER_BASE, fetchJsonOverHttps } from '../injective';

// ── INJ burn auction ────────────────────────────────────────────────────────
// Injective's signature flywheel: trading fees accumulate into a basket that is
// auctioned every period; the winning bid is paid in INJ and BURNED. Protocol
// trading fees themselves are ~zero on-chain right now (taker rate 1e-6), so the
// burn auction — not a fee sum — is the honest "revenue → deflation" metric.
//
// /api/exchange/auction/v1/auctions returns the most recent ~200 completed
// rounds. `winningBidAmount` is the INJ burned that round (1e18 base units).

const INJ_WAD = 1e18;

export interface BurnRound {
  round: number;
  endTimestamp: number;
  injBurned: number;
  basketDenoms: number; // how many token types were in the auctioned basket
}

export interface BurnSummary {
  rounds: BurnRound[];        // newest first
  latest: BurnRound | null;
  cumulativeInj: number;      // summed over the returned rounds
  roundsCovered: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function fetchBurnSummary(): Promise<BurnSummary> {
  const r = await fetchJsonOverHttps(`${INDEXER_BASE}/api/exchange/auction/v1/auctions`);
  const raw: any[] = (r && r.status === 200 && r.body?.auctions) || [];
  const rounds: BurnRound[] = raw
    .map((a) => ({
      round: Number(a.round),
      endTimestamp: Number(a.endTimestamp),
      injBurned: Number(a.winningBidAmount ?? 0) / INJ_WAD,
      basketDenoms: Array.isArray(a.basket) ? a.basket.length : 0,
    }))
    .filter((x) => Number.isFinite(x.round))
    .sort((a, b) => b.round - a.round);

  const cumulativeInj = rounds.reduce((s, x) => s + x.injBurned, 0);
  return {
    rounds,
    latest: rounds[0] ?? null,
    cumulativeInj,
    roundsCovered: rounds.length,
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */
