import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { OWNER_COOKIE, verifyToken } from '@/lib/auth/owner';
import { discoverRounds } from '@/lib/buyback/rounds';
import { fetchRoundParticipants } from '@/lib/buyback/deposits';
import { formatAmount } from '@/lib/normalizer';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Time-after-open distribution — shows how hard the round was rushed.
const BUCKETS: Array<{ label: string; max: number }> = [
  { label: '0–10s', max: 10 },
  { label: '10–30s', max: 30 },
  { label: '30–60s', max: 60 },
  { label: '1–2m', max: 120 },
  { label: '2–5m', max: 300 },
  { label: '5–15m', max: 900 },
  { label: '15m+', max: Infinity },
];

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

const getLastRound = unstable_cache(
  async () => {
    const rounds = await discoverRounds();
    if (!rounds.length) return null;
    const round = rounds[rounds.length - 1];
    const parts = await fetchRoundParticipants(round.startDate, round.endDate);

    const delays = parts.map((p) => p.secondsAfterOpen);
    const buckets = BUCKETS.map((b) => ({ label: b.label, count: 0 }));
    for (const d of delays) {
      const idx = BUCKETS.findIndex((b) => d < b.max);
      buckets[idx === -1 ? buckets.length - 1 : idx].count++;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const participants = parts.map((p, i) => ({
      rank: i + 1,
      wallet: p.wallet,
      timestamp: p.timestamp,
      secondsAfterOpen: p.secondsAfterOpen,
      amountInj: formatAmount(p.amountInjRaw, 'inj'),
      txHash: p.txHash,
    }));

    return {
      round: {
        id: round.id,
        startDate: round.startDate,
        endDate: round.endDate,
        status: nowSec > round.endDate ? 'closed' : nowSec < round.startDate ? 'upcoming' : 'open',
        walletCapInj: formatAmount(round.walletCapRaw, 'inj'),
        roundCapInj: formatAmount(round.roundCapRaw, 'inj'),
        totalDepositInj: formatAmount(round.totalDepositRaw, 'inj'),
      },
      stats: {
        uniqueWallets: parts.length,
        fastestSeconds: delays.length ? Math.min(...delays) : null,
        medianSeconds: median(delays),
        fillSeconds: delays.length ? Math.max(...delays) : null, // last commit after open
      },
      buckets,
      participants,
    };
  },
  ['buyback-last-round-v1'],
  { revalidate: 60 },
);

export async function POST(request: NextRequest) {
  const token = request.cookies.get(OWNER_COOKIE)?.value;
  if (!verifyToken(token)) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }
  try {
    const result = await getLastRound();
    if (!result) {
      return NextResponse.json({ error: 'No rounds found on chain.' }, { status: 404 });
    }
    return NextResponse.json({ result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
