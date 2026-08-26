import { fetchJsonOverHttps, INDEXER_BASE } from '../injective';

// ── Exact deposit timestamps for a wallet's buyback rounds ──────────────
// The pool contract records *how much* a wallet committed (get_user_round_info)
// but not *when* — that only lives in the deposit transaction itself. Each
// commit is one `join_pool` execute against the pool contract, carrying the
// sender, the INJ `funds`, and a block timestamp. Deposits always land in the
// first moments a round opens (rounds historically fill within seconds), so we
// find them with a tight time-windowed indexer query per round rather than
// paging the wallet's whole history.

const BUYBACK_CONTRACT = 'inj10n78w79xhxmytnuhjcck633nj4e7hrqaglgnfz';

export interface DepositEvent {
  roundId: number;
  timestamp: number;    // unix seconds — when the deposit tx was included
  amountInjRaw: string; // raw INJ (18-dec) sent as funds
  txHash: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// Scan the wallet's txs inside [startMs, endMs] for its join_pool deposit,
// returning the earliest match. Pages newest-first; stops at a short page.
async function scanWindow(
  addr: string,
  startMs: number,
  endMs: number,
  maxPages: number,
): Promise<{ ts: number; amountRaw: string; hash: string } | null> {
  let best: { ts: number; amountRaw: string; hash: string } | null = null;
  for (let page = 0; page < maxPages; page++) {
    const url =
      `${INDEXER_BASE}/api/explorer/v1/accountTxs/${addr}` +
      `?limit=100&skip=${page * 100}&start_time=${startMs}&end_time=${endMs}`;
    const res = await fetchJsonOverHttps(url);
    const rows: any[] = res?.body?.data ?? [];
    if (!rows.length) break;
    for (const t of rows) {
      if (t.code !== 0) continue; // failed tx — not a real deposit
      for (const m of t.messages ?? []) {
        if (!String(m.type).includes('MsgExecuteContract')) continue;
        const v = m.value ?? {};
        if (v.contract !== BUYBACK_CONTRACT || v.sender !== addr) continue;
        let action: string | null = null;
        try { action = Object.keys(JSON.parse(v.msg))[0]; } catch { /* not JSON */ }
        if (action !== 'join_pool') continue;
        const funds = String(v.funds ?? '');
        const injMatch = funds.match(/^(\d+)inj$/);
        const ts = Number(t.block_unix_timestamp) / 1000; // ms → s
        if (!best || ts < best.ts) {
          best = { ts, amountRaw: injMatch ? injMatch[1] : '0', hash: String(t.hash) };
        }
      }
    }
    if (rows.length < 100) break; // no more txs in this window
  }
  return best;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function fetchDepositInWindow(
  addr: string,
  startSec: number,
  endSec: number,
): Promise<{ ts: number; amountRaw: string; hash: string } | null> {
  const startMs = startSec * 1000;
  // Pass 1: tight window (deposits land at round open) — one call, few txs.
  const tightEndMs = Math.min(endSec, startSec + 12 * 3600) * 1000;
  const quick = await scanWindow(addr, startMs, tightEndMs, 1);
  if (quick) return quick;
  // Pass 2: whole round window, paged — rare (busy wallet or a slow-fill round).
  return scanWindow(addr, startMs, endSec * 1000, 6);
}

export interface RoundParticipant {
  wallet: string;
  timestamp: number;        // unix seconds of (first) deposit
  secondsAfterOpen: number; // timestamp - round start
  amountInjRaw: string;     // total INJ committed (summed if multiple deposits)
  txHash: string;           // first deposit tx
}

/**
 * Every wallet that committed to a round, with the exact time it deposited.
 * Pages the contract's own tx stream (newest-first) back to the round's open,
 * keeping each `join_pool` deposit. For the latest round these deposits are the
 * most recent contract activity, so this is a handful of pages. One entry per
 * wallet: earliest deposit time, amounts summed across any repeat deposits.
 */
export async function fetchRoundParticipants(
  startSec: number,
  endSec: number,
): Promise<RoundParticipant[]> {
  const startMs = startSec * 1000;
  const endMs = endSec * 1000;
  const byWallet = new Map<string, { ts: number; amount: bigint; hash: string }>();
  const MAX_PAGES = 20; // round cap / wallet cap bounds this to a few hundred txs

  /* eslint-disable @typescript-eslint/no-explicit-any */
  for (let page = 0; page < MAX_PAGES; page++) {
    const url =
      `${INDEXER_BASE}/api/explorer/v1/accountTxs/${BUYBACK_CONTRACT}` +
      `?limit=100&skip=${page * 100}&start_time=${startMs}&end_time=${endMs}`;
    const res = await fetchJsonOverHttps(url);
    const rows: any[] = res?.body?.data ?? [];
    if (!rows.length) break;
    for (const t of rows) {
      if (t.code !== 0) continue;
      const ts = Number(t.block_unix_timestamp) / 1000;
      for (const m of t.messages ?? []) {
        if (!String(m.type).includes('MsgExecuteContract')) continue;
        const v = m.value ?? {};
        if (v.contract !== BUYBACK_CONTRACT) continue;
        let action: string | null = null;
        try { action = Object.keys(JSON.parse(v.msg))[0]; } catch { /* not JSON */ }
        if (action !== 'join_pool') continue;
        const sender = String(v.sender ?? '');
        if (!sender) continue;
        const injMatch = String(v.funds ?? '').match(/^(\d+)inj$/);
        const amt = injMatch ? BigInt(injMatch[1]) : BigInt(0);
        const prev = byWallet.get(sender);
        if (!prev) {
          byWallet.set(sender, { ts, amount: amt, hash: String(t.hash) });
        } else {
          prev.amount += amt;
          if (ts < prev.ts) { prev.ts = ts; prev.hash = String(t.hash); }
        }
      }
    }
    if (rows.length < 100) break;
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return Array.from(byWallet.entries())
    .map(([wallet, d]) => ({
      wallet,
      timestamp: d.ts,
      secondsAfterOpen: Math.max(0, Math.round(d.ts - startSec)),
      amountInjRaw: d.amount.toString(),
      txHash: d.hash,
    }))
    .sort((a, b) => a.timestamp - b.timestamp); // fastest first
}

/**
 * For each supplied round window, resolve the wallet's deposit time (and tx).
 * Rounds with no resolvable deposit are simply absent from the map.
 */
export async function fetchDepositTimes(
  addr: string,
  rounds: Array<{ id: number; startDate: number; endDate: number }>,
): Promise<Map<number, DepositEvent>> {
  const out = new Map<number, DepositEvent>();
  const CONCURRENCY = 4;
  let next = 0;
  async function worker() {
    while (next < rounds.length) {
      const r = rounds[next++];
      if (!r.startDate || !r.endDate) continue;
      const d = await fetchDepositInWindow(addr, r.startDate, r.endDate);
      if (d) out.set(r.id, { roundId: r.id, timestamp: d.ts, amountInjRaw: d.amountRaw, txHash: d.hash });
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rounds.length) }, worker));
  return out;
}
