'use client';

import type { WalletFootprint as Footprint } from '@/lib/wallet/footprint';

interface Props {
  footprint: Footprint;
}

/** INJ amounts stay in INJ — see the note in lib/wallet/footprint.ts. */
function inj(n: number): string {
  if (n === 0) return '0 INJ';
  if (n >= 1) return `${n.toFixed(3)} INJ`;
  if (n >= 0.001) return `${n.toFixed(4)} INJ`;
  return `${n.toFixed(6)} INJ`;
}

function shortDate(ts: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function WalletFootprint({ footprint }: Props) {
  const {
    totalTxsAllTime, scanned, truncated, paidTxs, feesInj, avgFeeInj,
    grantedTxs, failedTxs, failedFeesInj, windowFrom, windowTo,
  } = footprint;

  if (scanned === 0) {
    return (
      <div className="tx-pnl-card" style={{ width: '100%', maxWidth: 680 }}>
        <div className="tx-pnl-empty">No transaction history found for this wallet.</div>
      </div>
    );
  }

  return (
    <div className="tx-pnl-card" style={{ width: '100%', maxWidth: 680, marginBottom: '0.85rem' }}>
      <div className="tx-pnl-head">
        <span className="tx-pnl-head-title">On-chain footprint</span>
        <span className="tx-pnl-row-meta">
          {shortDate(windowFrom)} – {shortDate(windowTo)}
        </span>
      </div>

      <div className="tx-pnl-grid">
        <div className="tx-pnl-stat">
          <span className="tx-pnl-stat-label">Gas paid</span>
          <span className="tx-pnl-stat-value tx-pnl-up">{inj(feesInj)}</span>
        </div>
        <div className="tx-pnl-stat">
          <span className="tx-pnl-stat-label">Txs paid for</span>
          <span className="tx-pnl-stat-value">{paidTxs.toLocaleString()}</span>
        </div>
        <div className="tx-pnl-stat">
          <span className="tx-pnl-stat-label">Avg per tx</span>
          <span className="tx-pnl-stat-value">{avgFeeInj === null ? '—' : inj(avgFeeInj)}</span>
        </div>
        <div className="tx-pnl-stat">
          <span className="tx-pnl-stat-label">Txs all time</span>
          <span className="tx-pnl-stat-value">{totalTxsAllTime.toLocaleString()}</span>
        </div>
        <div className="tx-pnl-stat">
          <span className="tx-pnl-stat-label">Scanned</span>
          <span className="tx-pnl-stat-value">{scanned.toLocaleString()}</span>
        </div>
        <div className="tx-pnl-stat">
          <span className="tx-pnl-stat-label">Failed txs</span>
          <span className={`tx-pnl-stat-value${failedTxs > 0 ? ' tx-pnl-down' : ''}`}>
            {failedTxs.toLocaleString()}
          </span>
        </div>
      </div>

      <div style={{ padding: '0.6rem 1.2rem', fontSize: '0.7rem', lineHeight: 1.55, color: 'var(--tx-text-muted)' }}>
        Gas is counted only on transactions this wallet paid for. &ldquo;Txs all time&rdquo; counts every
        transaction the wallet appears in, including ones other accounts signed and paid for.
        {truncated && ` Only the ${scanned.toLocaleString()} most recent were scanned, so gas covers that window rather than all time.`}
        {grantedTxs > 0 && ` ${grantedTxs.toLocaleString()} transaction${grantedTxs === 1 ? ' was' : 's were'} covered by a feegrant — someone else paid.`}
        {failedTxs > 0 && ` Failed transactions still cost gas: ${inj(failedFeesInj)} spent on them.`}
      </div>
    </div>
  );
}
