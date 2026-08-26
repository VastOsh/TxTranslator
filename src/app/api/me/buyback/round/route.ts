import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { OWNER_COOKIE, verifyToken } from '@/lib/auth/owner';
import { discoverRounds, getUnusedWhitelist } from '@/lib/buyback/rounds';
import { fetchRoundParticipants, fetchFirstSeenBatch } from '@/lib/buyback/deposits';
import { formatAmount } from '@/lib/normalizer';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Signal thresholds. These are heuristics over public on-chain data, surfaced as
// signals — never a verdict. A shared gas value can also mean a shared frontend.
const FAST_SECONDS = 30;        // committed within 30s of open
const GAS_BIN = 5000;           // group near-identical gas into fleets
const FLEET_MIN = 5;            // a fleet = >=5 wallets sharing a gas bin
const BURST_MIN = 3;            // >=3 deposits in one block = a scripted burst
const NEW_WALLET_DAYS = 30;     // first seen < 30d before the round opened
const AGE_BUDGET_MS = 25_000;   // best-effort wallet-age sweep budget

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

    // Fleet map: how many wallets share each gas bin, and each block's deposit count.
    const fleetCount = new Map<number, number>();
    const blockCount = new Map<number, number>();
    for (const p of parts) {
      const bin = Math.round(p.gasWanted / GAS_BIN) * GAS_BIN;
      fleetCount.set(bin, (fleetCount.get(bin) ?? 0) + 1);
      blockCount.set(p.block, (blockCount.get(p.block) ?? 0) + 1);
    }

    // Best-effort wallet ages (immutable → cached with the rest).
    const ages = await fetchFirstSeenBatch(parts.map((p) => p.wallet), AGE_BUDGET_MS);
    const newCutoff = round.startDate - NEW_WALLET_DAYS * 86400;

    let flaggedCount = 0;
    let scriptedCount = 0;
    const participants = parts.map((p, i) => {
      const bin = Math.round(p.gasWanted / GAS_BIN) * GAS_BIN;
      const fleetSize = fleetCount.get(bin) ?? 1;
      const inBurst = (blockCount.get(p.block) ?? 0) >= BURST_MIN;
      const firstSeen = ages.get(p.wallet);
      const isNew = firstSeen !== undefined && firstSeen > newCutoff;

      const signals: string[] = [];
      if (p.secondsAfterOpen <= FAST_SECONDS) signals.push('fast');
      if (fleetSize >= FLEET_MIN) { signals.push('gas-fleet'); scriptedCount++; }
      if (inBurst) signals.push('burst');
      if (isNew) signals.push('new');
      const automationLikely = signals.length >= 2;
      if (automationLikely) flaggedCount++;

      return {
        rank: i + 1,
        wallet: p.wallet,
        timestamp: p.timestamp,
        secondsAfterOpen: p.secondsAfterOpen,
        amountInj: formatAmount(p.amountInjRaw, 'inj'),
        txHash: p.txHash,
        gasWanted: p.gasWanted,
        fleetSize,
        firstSeen: firstSeen ?? null,
        signals,
        automationLikely,
      };
    });

    const fleets = Array.from(fleetCount.entries())
      .filter(([, c]) => c >= FLEET_MIN)
      .map(([gas, count]) => ({ gas, count }))
      .sort((a, b) => b.count - a.count);

    const delays = parts.map((p) => p.secondsAfterOpen);
    const buckets = BUCKETS.map((b) => ({ label: b.label, count: 0 }));
    for (const d of delays) {
      const idx = BUCKETS.findIndex((b) => d < b.max);
      buckets[idx === -1 ? buckets.length - 1 : idx].count++;
    }

    // Whitelisted-but-shut-out population.
    const unused = await getUnusedWhitelist(round.id);

    const nowSec = Math.floor(Date.now() / 1000);
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
        fillSeconds: delays.length ? Math.max(...delays) : null,
      },
      botSummary: {
        flaggedCount,
        scriptedPct: parts.length ? Math.round((scriptedCount / parts.length) * 100) : 0,
        agesResolved: ages.size,
        fleets: fleets.slice(0, 6),
      },
      shutOut: {
        count: unused.count,
        capped: unused.capped,
        gotIn: parts.length,
        sample: unused.sample,
      },
      buckets,
      participants,
    };
  },
  ['buyback-last-round-v2'],
  { revalidate: 300 },
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
