import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { OWNER_COOKIE, verifyToken } from '@/lib/auth/owner';
import { discoverRounds, getUnusedWhitelist } from '@/lib/buyback/rounds';
import { fetchRoundParticipants, fetchWalletInfoBatch } from '@/lib/buyback/deposits';
import { formatAmount } from '@/lib/normalizer';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Automation signals over public on-chain data — signals, never a verdict.
// Deliberately NOT based on deposit speed or gas: when a round fills in ~90s,
// everyone deposits fast, and everyone using the Hub site submits near-identical
// gas, so those flag humans too. These use wallet behaviour instead:
const HYPERACTIVE_TX = 5000;    // lifetime tx count that only automation reaches
const FARM_MIN = 2;             // >=2 entrants first-seen in the exact same block
const NEW_WALLET_DAYS = 30;     // informational only — new wallets are common
const INFO_BUDGET_MS = 30_000;  // best-effort wallet-info sweep budget

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

    // Best-effort wallet info (tx count + first-seen), immutable-ish → cached.
    const info = await fetchWalletInfoBatch(parts.map((p) => p.wallet), INFO_BUDGET_MS);

    // Farm groups: entrants whose FIRST on-chain tx shares the exact same block
    // (created/funded together in one batch). Keyed by first-seen timestamp.
    const firstSeenGroups = new Map<number, number>();
    for (const p of parts) {
      const fs = info.get(p.wallet)?.firstSeen;
      if (fs != null) firstSeenGroups.set(fs, (firstSeenGroups.get(fs) ?? 0) + 1);
    }

    const newCutoff = round.startDate - NEW_WALLET_DAYS * 86400;
    let flaggedCount = 0;
    let farmedCount = 0;
    let hyperactiveCount = 0;

    const participants = parts.map((p, i) => {
      const wi = info.get(p.wallet);
      const firstSeen = wi?.firstSeen ?? null;
      const txCount = wi?.txCount ?? null;
      const farmGroupSize = firstSeen != null ? (firstSeenGroups.get(firstSeen) ?? 1) : 1;

      const signals: string[] = [];
      const farmed = farmGroupSize >= FARM_MIN; // >=2 entrants share the exact creation block
      const hyperactive = txCount != null && txCount >= HYPERACTIVE_TX;
      const isNew = firstSeen != null && firstSeen > newCutoff;
      if (farmed) { signals.push('farmed'); farmedCount++; }
      if (hyperactive) { signals.push('hyperactive'); hyperactiveCount++; }
      if (isNew) signals.push('new');

      const automationLikely = farmed || hyperactive;
      if (automationLikely) flaggedCount++;

      return {
        rank: i + 1,
        wallet: p.wallet,
        timestamp: p.timestamp,
        secondsAfterOpen: p.secondsAfterOpen,
        amountInj: formatAmount(p.amountInjRaw, 'inj'),
        txHash: p.txHash,
        txCount,
        firstSeen,
        farmGroupSize,
        signals,
        automationLikely,
      };
    });

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
        farmedCount,
        hyperactiveCount,
        infoResolved: info.size,
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
  ['buyback-last-round-v3'],
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
