import { INDEXER_BASE, fetchJsonOverHttps } from '../injective';
import { CONTRACT_PROTOCOLS, MESSAGE_TYPE_PROTOCOLS } from '@/constants/contracts';
import type { ProtocolName } from '@/constants/contracts';

// ── On-chain footprint: what a wallet actually spent to use the chain ──
//
// Fees are reported in INJ, never converted to USD. Converting a window that
// spans months would need the INJ price at each transaction's block time, and
// applying today's price to old fees produces a confidently wrong number.
//
// Attribution is the whole game here. accountTxs returns every transaction the
// address APPEARS in, including ones somebody else signed and paid for — on a
// sampled wallet, 99 of 100 rows were paid by other accounts, so summing the
// gas_fee column blindly overstated its spend by ~570x. A fee counts only when
// this address is the fee payer and no one else granted it.

export interface WalletFootprint {
  address: string;
  /** All-time transactions the wallet appears in — includes ones it did not send. */
  totalTxsAllTime: number;
  /** Transactions examined in this scan. */
  scanned: number;
  /** True when the wallet has more history than the scan covered. */
  truncated: boolean;

  /** Scanned transactions this wallet paid the fee on. */
  paidTxs: number;
  feesInj: number;
  avgFeeInj: number | null;
  /** Transactions it signed but a feegrant covered — it paid nothing for these. */
  grantedTxs: number;
  /** Fees are charged on failed transactions too; worth surfacing separately. */
  failedTxs: number;
  failedFeesInj: number;

  /** dApps this wallet interacted with in the scan, most-used first. */
  dappActivity: DappUsage[];
  /** Messages calling a contract not in the registry — unlabelled dApp usage. */
  unknownContractCalls: number;

  windowFrom: number;
  windowTo: number;
}

export interface DappUsage {
  name: ProtocolName;
  /** Messages this wallet sent that hit the protocol (a tx can carry several). */
  interactions: number;
  lastUsedAt: number;
  /** What the wallet actually did — execute methods it called, most-used first. */
  actions: DappAction[];
}

export interface DappAction {
  /** The contract execute method, e.g. "withdraw_collateral", "swap_min_output". */
  action: string;
  count: number;
  /** Most-recent transactions that called this method, newest first, capped —
   *  each links to the in-app decoder for the full plain-English detail. */
  recent: DappInteraction[];
}

export interface DappInteraction {
  /** Full transaction hash (0x-prefixed). */
  hash: string;
  /** Block time in ms. */
  at: number;
}

interface IndexerMessage {
  type?: string;
  value?: {
    sender?: string;
    contract?: string;
    contract_address?: string;
    /** CosmWasm execute payload — a JSON string or object; its first key is the method. */
    msg?: unknown;
  };
}

interface IndexerAccountTx {
  hash?: string;
  code?: number;
  block_unix_timestamp?: number;
  gas_fee?: {
    amount?: Array<{ denom: string; amount: string }>;
    payer?: string;
    granter?: string;
  };
  messages?: IndexerMessage[];
}

interface ActionTally {
  count: number;
  recent: DappInteraction[];
}

interface UsageTally {
  interactions: number;
  lastUsedAt: number;
  actions: Map<string, ActionTally>;
}

// How many recent transactions to keep per action for the drill-down. The scan
// runs newest-first, so the first ones seen are the most recent; a handful is
// enough to jump into and doesn't bloat the response for a 200-call method.
const RECENT_PER_ACTION = 5;

// The execute method a message called — the first key of its CosmWasm payload
// (`{"deposit":{…}}` → "deposit"). Compat messages carry this as a JSON string.
// Anything unparseable falls back to a generic label rather than being dropped,
// so per-action counts always sum to the protocol's interaction count.
function extractAction(msg: IndexerMessage): string {
  const raw = msg.value?.msg;
  let payload: unknown = raw;
  if (typeof raw === 'string') {
    try {
      payload = JSON.parse(raw);
    } catch {
      return 'execute';
    }
  }
  if (payload && typeof payload === 'object') {
    const key = Object.keys(payload as Record<string, unknown>)[0];
    if (key) return key;
  }
  return 'execute';
}

// Protocols that have a card in the /dapps directory — i.e. those with at least
// one registered contract. dApp usage is limited to these so every row links to
// a real page; native-module activity (IBC, staking, governance) is not a dApp.
const DIRECTORY_PROTOCOLS = new Set<ProtocolName>(Object.values(CONTRACT_PROTOCOLS));

// Maps a single message the wallet sent to the dApp it used, if any. The
// contract address is the strong signal (CosmWasm dApps); the message type
// catches native exchange-module usage (Helix) that carries no contract.
function messageProtocol(msg: IndexerMessage): ProtocolName | null {
  const contract = msg.value?.contract ?? msg.value?.contract_address;
  if (contract && contract in CONTRACT_PROTOCOLS) return CONTRACT_PROTOCOLS[contract];
  const type = msg.type ?? '';
  const byType = type in MESSAGE_TYPE_PROTOCOLS ? MESSAGE_TYPE_PROTOCOLS[type] : null;
  return byType && DIRECTORY_PROTOCOLS.has(byType) ? byType : null;
}

// accountTxs caps at 100 rows per call — larger limits return an empty page.
const TXS_PER_PAGE = 100;
// Six pages ≈ 8-12s against the indexer. The card loads asynchronously so this
// never blocks the tx list, but a bigger sample is not worth a longer wait —
// 600 transactions already characterises a wallet's fee spend.
const MAX_PAGES = 6;
const INJ_DECIMALS = 1e18;

export async function buildWalletFootprint(address: string): Promise<WalletFootprint> {
  let totalTxsAllTime = 0;
  let scanned = 0;
  let paidTxs = 0;
  let grantedTxs = 0;
  let feesInj = 0;
  let failedTxs = 0;
  let failedFeesInj = 0;
  let windowFrom = Infinity;
  let windowTo = 0;
  let pagesUsed = 0;
  let unknownContractCalls = 0;
  const usage = new Map<ProtocolName, UsageTally>();

  for (let page = 0; page < MAX_PAGES; page++) {
    // A transient timeout returns null; retry so one flaky page doesn't abort
    // the whole scan (on page 0 that would wrongly look like an empty wallet).
    let result = null;
    for (let attempt = 0; attempt < 3 && !result; attempt++) {
      result = await fetchJsonOverHttps(
        `${INDEXER_BASE}/api/explorer/v1/accountTxs/${address}?limit=${TXS_PER_PAGE}&skip=${page * TXS_PER_PAGE}`,
      );
    }
    if (page === 0) totalTxsAllTime = result?.body?.paging?.total ?? 0;

    const rows: IndexerAccountTx[] = result?.body?.data ?? [];
    if (rows.length === 0) break;
    pagesUsed = page + 1;

    for (const tx of rows) {
      scanned++;
      const ts = tx.block_unix_timestamp ?? 0;
      if (ts) {
        if (ts < windowFrom) windowFrom = ts;
        if (ts > windowTo) windowTo = ts;
      }

      // dApp usage is tallied from messages this wallet sent, independent of who
      // paid the fee — a feegranted contract call is still the wallet's activity.
      for (const msg of tx.messages ?? []) {
        if (msg.value?.sender !== address) continue;
        const protocol = messageProtocol(msg);
        if (protocol) {
          const tally = usage.get(protocol) ?? { interactions: 0, lastUsedAt: 0, actions: new Map<string, ActionTally>() };
          tally.interactions++;
          if (ts > tally.lastUsedAt) tally.lastUsedAt = ts;
          const action = extractAction(msg);
          const at = tally.actions.get(action) ?? { count: 0, recent: [] };
          at.count++;
          // Keep the newest few hashes; skip a duplicate when one tx carries
          // several messages of the same method (a batch).
          if (at.recent.length < RECENT_PER_ACTION && tx.hash && at.recent[at.recent.length - 1]?.hash !== tx.hash) {
            at.recent.push({ hash: tx.hash, at: ts });
          }
          tally.actions.set(action, at);
          usage.set(protocol, tally);
        } else if (msg.value?.contract || msg.value?.contract_address) {
          // Hit a contract we don't have in the registry — unlabelled dApp.
          unknownContractCalls++;
        }
      }

      const fee = tx.gas_fee ?? {};
      if (fee.payer !== address) continue;

      // A feegrant means the granter footed the bill, not this wallet.
      if (fee.granter && fee.granter !== address) {
        grantedTxs++;
        continue;
      }

      const entry = fee.amount?.[0];
      // Fees are paid in INJ; anything else is not this wallet's gas spend.
      if (!entry || entry.denom !== 'inj') continue;
      const amount = Number(entry.amount) / INJ_DECIMALS;
      if (!isFinite(amount) || amount <= 0) continue;

      paidTxs++;
      feesInj += amount;
      if ((tx.code ?? 0) !== 0) {
        failedTxs++;
        failedFeesInj += amount;
      }
    }
  }

  return {
    address,
    totalTxsAllTime,
    scanned,
    truncated: totalTxsAllTime > scanned && pagesUsed >= MAX_PAGES,
    paidTxs,
    feesInj,
    avgFeeInj: paidTxs > 0 ? feesInj / paidTxs : null,
    grantedTxs,
    failedTxs,
    failedFeesInj,
    dappActivity: [...usage.entries()]
      .map(([name, t]) => ({
        name,
        interactions: t.interactions,
        lastUsedAt: t.lastUsedAt,
        actions: [...t.actions.entries()]
          .map(([action, a]) => ({ action, count: a.count, recent: a.recent }))
          .sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.interactions - a.interactions),
    unknownContractCalls,
    windowFrom: windowFrom === Infinity ? 0 : windowFrom,
    windowTo,
  };
}
