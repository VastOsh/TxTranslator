'use client';

import Link from 'next/link';
import type { WalletFootprint as Footprint } from '@/lib/wallet/footprint';

interface Props {
  footprint: Footprint;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function usedAgo(ts: number): string {
  if (!ts) return '';
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
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
    grantedTxs, failedTxs, failedFeesInj, dappActivity, unknownContractCalls,
    windowFrom, windowTo,
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

      {(dappActivity.length > 0 || unknownContractCalls > 0) && (
        <div style={{ borderTop: '1px solid var(--tx-border)' }}>
          <div className="tx-pnl-head" style={{ borderBottom: '1px solid var(--tx-border)' }}>
            <span className="tx-pnl-head-title">dApps used · in scanned window</span>
          </div>
          {dappActivity.length > 0 ? (
            <ul className="tx-pnl-list">
              {dappActivity.map(d => (
                <li key={d.name} className="tx-pnl-row">
                  <div className="tx-pnl-row-left">
                    <div className="tx-pnl-row-main">
                      <Link href={`/dapps/${slugify(d.name)}`} className="tx-pnl-ticker" style={{ color: 'var(--tx-cyan)', textDecoration: 'none' }}>
                        {d.name}
                      </Link>
                    </div>
                    {d.lastUsedAt > 0 && <span className="tx-pnl-row-meta">last used {usedAgo(d.lastUsedAt)}</span>}
                  </div>
                  <div className="tx-pnl-row-right">
                    {d.interactions.toLocaleString()}
                    <span className="tx-pnl-row-right-sub">interaction{d.interactions === 1 ? '' : 's'}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="tx-pnl-empty">No recognised dApps in the scanned window.</div>
          )}
          {unknownContractCalls > 0 && (
            <div style={{ padding: '0.5rem 1.2rem', fontSize: '0.68rem', color: 'var(--tx-text-dim)' }}>
              + {unknownContractCalls.toLocaleString()} call{unknownContractCalls === 1 ? '' : 's'} to contracts not yet in the directory.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
