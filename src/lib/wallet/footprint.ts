import { INDEXER_BASE, fetchJsonOverHttps } from '../injective';

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

  windowFrom: number;
  windowTo: number;
}

interface IndexerAccountTx {
  code?: number;
  block_unix_timestamp?: number;
  gas_fee?: {
    amount?: Array<{ denom: string; amount: string }>;
    payer?: string;
    granter?: string;
  };
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

  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await fetchJsonOverHttps(
      `${INDEXER_BASE}/api/explorer/v1/accountTxs/${address}?limit=${TXS_PER_PAGE}&skip=${page * TXS_PER_PAGE}`,
    );
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
    windowFrom: windowFrom === Infinity ? 0 : windowFrom,
    windowTo,
  };
}
