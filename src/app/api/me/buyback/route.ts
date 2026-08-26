import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { OWNER_COOKIE, verifyToken } from '@/lib/auth/owner';
import { buildBuybackProfile } from '@/lib/buyback/rounds';
import { fetchDepositTimes } from '@/lib/buyback/deposits';

export const runtime = 'nodejs';
// Round sweep + per-round deposit-time lookups over slow public nodes.
export const maxDuration = 60;

const ADDR_RE = /^inj1[a-z0-9]{38}$/;

export interface MyDeposit {
  roundId: number;
  startDate: number;
  endDate: number;
  depositInj: string;
  depositUsd: number | null;
  walletCapInj: string;
  hasWithdrawn: boolean;
  depositTime: number | null;      // unix seconds, null if the tx couldn't be located
  secondsAfterOpen: number | null; // how fast after the round opened
  txHash: string | null;
  basketKnownUsd: number;
  basketHasUnpriced: boolean;
}

// On-chain data is public and immutable for closed rounds; cache per address so
// repeat loads don't re-sweep. The gate below runs before this is ever reached.
const getMyBuyback = (address: string) =>
  unstable_cache(
    async () => {
      const profile = await buildBuybackProfile(address);
      const committed = profile.participations.filter((p) => p.committed);
      const times = await fetchDepositTimes(
        address,
        committed.map((p) => ({ id: p.roundId, startDate: p.startDate, endDate: p.endDate })),
      );

      const deposits: MyDeposit[] = committed
        .map((p) => {
          const t = times.get(p.roundId);
          return {
            roundId: p.roundId,
            startDate: p.startDate,
            endDate: p.endDate,
            depositInj: p.depositInj,
            depositUsd: p.depositUsd,
            walletCapInj: p.walletCapInj,
            hasWithdrawn: p.hasWithdrawn,
            depositTime: t ? t.timestamp : null,
            secondsAfterOpen: t ? Math.max(0, Math.round(t.timestamp - p.startDate)) : null,
            txHash: t ? t.txHash : null,
            basketKnownUsd: p.basketKnownUsd,
            basketHasUnpriced: p.basketHasUnpriced,
          };
        })
        .sort((a, b) => b.roundId - a.roundId);

      return {
        address,
        deposits,
        roundsCommitted: profile.roundsCommitted,
        totalDepositedInj: profile.totalDepositedInj,
        totalDepositedUsd: profile.totalDepositedUsd,
        totalRewardsKnownUsd: profile.totalRewardsKnownUsd,
        rewardsHaveUnpriced: profile.rewardsHaveUnpriced,
        unclaimedRounds: profile.unclaimedRounds,
      };
    },
    ['my-buyback-v1', address],
    { revalidate: 120 },
  )();

export async function POST(request: NextRequest) {
  const token = request.cookies.get(OWNER_COOKIE)?.value;
  if (!verifyToken(token)) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }

  let address = '';
  try {
    const body = await request.json();
    address = typeof body?.address === 'string' ? body.address.trim() : '';
  } catch {
    address = '';
  }

  if (!ADDR_RE.test(address)) {
    return NextResponse.json({ error: 'Invalid Injective address.' }, { status: 400 });
  }

  try {
    const result = await getMyBuyback(address);
    return NextResponse.json({ result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
