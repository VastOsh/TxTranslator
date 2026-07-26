import { Buffer } from 'node:buffer';
import { LCD_ENDPOINTS, fetchJsonOverHttps } from '../injective';
import { formatAmount, getDisplayDenom } from '../normalizer';
import { fetchTokenPrices, usdValue } from '../prices';

// ── Injective Community BuyBack: per-wallet profile from on-chain state ──
//
// The buyback pool contract exposes exactly what a wallet checker needs, so this
// invents nothing:
//   • get_round_info(round_id)              → a round's window, caps and deposit total
//   • get_user_round_info(user_addr,round)  → a wallet's status in a round
//
// get_user_round_info is the whole game: a wallet that is "found" was whitelisted
// for that round (even at deposit 0 — whitelisted but never committed); "not
// found" means it was never whitelisted. So one query per round answers both
// "is this wallet whitelisted?" and "how much did it commit?" — no need to pull
// the (potentially huge) full whitelist. Rewards land as an earn_basket of
// ecosystem tokens; we value the ones with a known price and disclose the rest
// rather than headlining a number that silently omits illiquid memecoins.

const BUYBACK_CONTRACT = 'inj10n78w79xhxmytnuhjcck633nj4e7hrqaglgnfz';

// Rounds run ~monthly since Oct 2025, so this probe ceiling holds for years.
// Discovery stops at the first gap anyway; this only bounds the initial fan-out.
const MAX_ROUND_PROBE = 36;
const CONCURRENCY = 8;

type SmartResult =
  | { ok: true; data: any }
  | { ok: false; message: string }   // contract rejected the query (e.g. "not found")
  | null;                            // never reached a node — unknown, not negative

async function smartQuery(query: Record<string, unknown>): Promise<SmartResult> {
  const b64 = Buffer.from(JSON.stringify(query)).toString('base64');
  for (const base of LCD_ENDPOINTS) {
    const res = await fetchJsonOverHttps(
      `${base}/cosmwasm/wasm/v1/contract/${BUYBACK_CONTRACT}/smart/${b64}`,
    );
    if (!res) continue; // network/timeout — try the next endpoint
    if (res.status === 200 && res.body?.data !== undefined) return { ok: true, data: res.body.data };
    // A definitive contract error (round/user not found) is authoritative — these
    // queries are deterministic across nodes, so don't waste round-trips retrying.
    if (typeof res.body?.message === 'string') return { ok: false, message: res.body.message };
  }
  return null;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

interface RoundInfo {
  id: number;
  slots: number;
  usedSlots: number;
  walletCapRaw: string;
  roundCapRaw: string;
  totalDepositRaw: string;
  startDate: number; // unix seconds
  endDate: number;   // unix seconds
}

async function fetchRoundInfo(id: number): Promise<RoundInfo | null> {
  const r = await smartQuery({ get_round_info: { round_id: id } });
  if (!r || !r.ok) return null; // "Round N not found" or unreachable
  const d = r.data;
  return {
    id,
    slots: Number(d.slots) || 0,
    usedSlots: Number(d.used_slots) || 0,
    walletCapRaw: String(d.wallet_cap ?? '0'),
    roundCapRaw: String(d.round_cap ?? '0'),
    totalDepositRaw: String(d.total_deposit ?? '0'),
    startDate: Number(d.start_date) || 0,
    endDate: Number(d.end_date) || 0,
  };
}

interface UserRound {
  roundId: number;
  registered: boolean; // found in the round = whitelisted
  depositRaw: string;
  hasWithdrawn: boolean;
  basket: Array<{ denom: string; amount: string }>;
  unknown: boolean; // query never resolved — status genuinely unknown, not "not whitelisted"
}

async function fetchUserRound(id: number, addr: string): Promise<UserRound> {
  const r = await smartQuery({ get_user_round_info: { user_addr: addr, round_id: id } });
  const empty = { roundId: id, depositRaw: '0', hasWithdrawn: false, basket: [] as Array<{ denom: string; amount: string }> };
  if (!r) return { ...empty, registered: false, unknown: true };
  if (!r.ok) {
    // "User ... not found in round N" is the whitelist miss — a real negative.
    if (/not found|not in round/i.test(r.message)) return { ...empty, registered: false, unknown: false };
    return { ...empty, registered: false, unknown: true };
  }
  const d = r.data;
  return {
    roundId: id,
    registered: true,
    depositRaw: String(d.deposit ?? '0'),
    hasWithdrawn: Boolean(d.has_withdrawn),
    basket: Array.isArray(d.earn_basket)
      ? d.earn_basket.map((b: any) => ({ denom: String(b.denom), amount: String(b.amount) }))
      : [],
    unknown: false,
  };
}

export interface BasketToken {
  symbol: string;
  amount: string;      // human-readable
  usd: number | null;  // null when the token has no known price
}

export interface RoundParticipation {
  roundId: number;
  startDate: number;
  endDate: number;
  depositInj: string;       // human-readable INJ
  depositUsd: number | null;
  committed: boolean;       // deposit > 0 (vs whitelisted-but-skipped)
  hasWithdrawn: boolean;
  walletCapInj: string;     // human-readable INJ
  basket: BasketToken[];
  basketKnownUsd: number;   // sum of priced basket tokens
  basketHasUnpriced: boolean;
}

export type CurrentStatus =
  | 'no_open_round'
  | 'not_whitelisted'
  | 'whitelisted_can_deposit'
  | 'deposited'
  | 'not_whitelisted_upcoming'  // round created on chain but not yet started
  | 'whitelisted_upcoming'      // on the whitelist for a round that hasn't opened
  | 'unknown';

export interface BuybackProfile {
  address: string;
  totalRounds: number;              // rounds that exist on chain
  roundsWhitelisted: number;        // rounds this wallet was whitelisted for
  roundsCommitted: number;          // rounds it actually deposited into
  totalDepositedInj: string;        // human-readable INJ
  totalDepositedUsd: number | null;
  totalRewardsKnownUsd: number;     // priced portion of all baskets
  rewardsHaveUnpriced: boolean;     // some basket tokens had no price
  unclaimedRounds: number;          // committed rounds not yet withdrawn
  participations: RoundParticipation[]; // whitelisted rounds, most recent first

  currentRoundId: number | null;
  currentRoundOpen: boolean;
  currentRoundStartDate: number | null;
  currentRoundEndDate: number | null;
  currentRoundWalletCapInj: string | null;
  currentRoundFull: boolean;        // round cap already reached
  currentStatus: CurrentStatus;

  partial: boolean;                 // at least one round query never resolved
}

export async function buildBuybackProfile(address: string): Promise<BuybackProfile> {
  const prices = await fetchTokenPrices();

  // Discover existing rounds (probe concurrently, keep the contiguous run from 1).
  const ids = Array.from({ length: MAX_ROUND_PROBE }, (_, i) => i + 1);
  const infos = await mapWithConcurrency(ids, CONCURRENCY, fetchRoundInfo);
  const rounds: RoundInfo[] = [];
  for (const info of infos) {
    if (!info) break; // first gap = no more rounds
    rounds.push(info);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const currentRound = rounds.length ? rounds[rounds.length - 1] : null;
  // The latest round is checkable until it ends. Distinguish "upcoming" (created
  // on chain but not yet started — the whitelist is already queryable ~a day
  // before open) from "open" (deposits live).
  const roundEnded = !!currentRound && nowSec > currentRound.endDate;
  const roundNotStarted = !!currentRound && nowSec < currentRound.startDate;
  const currentRoundOpen = !!currentRound && !roundEnded && !roundNotStarted;

  // Per-round wallet status.
  const userRounds = await mapWithConcurrency(rounds, CONCURRENCY, r => fetchUserRound(r.id, address));
  const infoById = new Map(rounds.map(r => [r.id, r]));

  const participations: RoundParticipation[] = [];
  let totalDepositRaw = BigInt(0);
  let totalRewardsKnownUsd = 0;
  let rewardsHaveUnpriced = false;
  let unclaimedRounds = 0;
  let partial = false;

  for (const ur of userRounds) {
    if (ur.unknown) partial = true;
    if (!ur.registered) continue;
    const info = infoById.get(ur.roundId)!;

    const depositInj = formatAmount(ur.depositRaw, 'inj');
    const committed = (() => { try { return BigInt(ur.depositRaw) > BigInt(0); } catch { return false; } })();
    if (committed) { try { totalDepositRaw += BigInt(ur.depositRaw); } catch { /* ignore */ } }
    if (committed && !ur.hasWithdrawn) unclaimedRounds++;

    let basketKnownUsd = 0;
    let basketHasUnpriced = false;
    const basket: BasketToken[] = ur.basket.map(b => {
      const symbol = getDisplayDenom(b.denom);
      const amount = formatAmount(b.amount, b.denom);
      const usd = usdValue(amount, symbol, prices);
      if (usd === null) basketHasUnpriced = true;
      else basketKnownUsd += usd;
      return { symbol, amount, usd };
    });
    totalRewardsKnownUsd += basketKnownUsd;
    if (basketHasUnpriced) rewardsHaveUnpriced = true;

    participations.push({
      roundId: ur.roundId,
      startDate: info.startDate,
      endDate: info.endDate,
      depositInj,
      depositUsd: usdValue(depositInj, 'INJ', prices),
      committed,
      hasWithdrawn: ur.hasWithdrawn,
      walletCapInj: formatAmount(info.walletCapRaw, 'inj'),
      basket,
      basketKnownUsd,
      basketHasUnpriced,
    });
  }

  participations.sort((a, b) => b.roundId - a.roundId);

  const roundsCommitted = participations.filter(p => p.committed).length;
  const totalDepositedInj = formatAmount(totalDepositRaw.toString(), 'inj');

  // Current-round status for this wallet.
  const currentUser = currentRound ? userRounds.find(u => u.roundId === currentRound.id) : undefined;
  let currentStatus: CurrentStatus;
  if (!currentRound || roundEnded) {
    // No round exists, or the latest one has already closed.
    currentStatus = 'no_open_round';
  } else if (!currentUser || currentUser.unknown) {
    currentStatus = 'unknown';
  } else if (!currentUser.registered) {
    // Round is upcoming or open; the whitelist is queryable either way.
    currentStatus = roundNotStarted ? 'not_whitelisted_upcoming' : 'not_whitelisted';
  } else {
    let deposited = false;
    try { deposited = BigInt(currentUser.depositRaw) > BigInt(0); } catch { /* ignore */ }
    if (deposited) currentStatus = 'deposited';
    else currentStatus = roundNotStarted ? 'whitelisted_upcoming' : 'whitelisted_can_deposit';
  }

  const currentRoundFull = (() => {
    if (!currentRound) return false;
    try { return BigInt(currentRound.totalDepositRaw) >= BigInt(currentRound.roundCapRaw) && BigInt(currentRound.roundCapRaw) > BigInt(0); }
    catch { return false; }
  })();

  return {
    address,
    totalRounds: rounds.length,
    roundsWhitelisted: participations.length,
    roundsCommitted,
    totalDepositedInj,
    totalDepositedUsd: usdValue(totalDepositedInj, 'INJ', prices),
    totalRewardsKnownUsd,
    rewardsHaveUnpriced,
    unclaimedRounds,
    participations,
    currentRoundId: currentRound?.id ?? null,
    currentRoundOpen,
    currentRoundStartDate: currentRound?.startDate ?? null,
    currentRoundEndDate: currentRound?.endDate ?? null,
    currentRoundWalletCapInj: currentRound ? formatAmount(currentRound.walletCapRaw, 'inj') : null,
    currentRoundFull,
    currentStatus,
    partial,
  };
}
