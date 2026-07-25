'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { WalletFootprint as Footprint } from '@/lib/wallet/footprint';

interface Props {
  footprint: Footprint;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** "withdraw_collateral" → "Withdraw collateral" for display. */
function humanizeAction(action: string): string {
  const spaced = action.replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
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

  // Which dApp row is expanded to show its per-action breakdown, and which
  // action within it is expanded to show recent transactions (one each).
  const [openDapp, setOpenDapp] = useState<string | null>(null);
  const [openAction, setOpenAction] = useState<string | null>(null);

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
              {dappActivity.map(d => {
                const open = openDapp === d.name;
                const hasBreakdown = d.actions.length > 0;
                return (
                  <li key={d.name} className="tx-pnl-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                    <div
                      role={hasBreakdown ? 'button' : undefined}
                      tabIndex={hasBreakdown ? 0 : undefined}
                      onClick={() => hasBreakdown && setOpenDapp(open ? null : d.name)}
                      onKeyDown={e => {
                        if (hasBreakdown && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          setOpenDapp(open ? null : d.name);
                        }
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        cursor: hasBreakdown ? 'pointer' : 'default',
                      }}
                    >
                      <div className="tx-pnl-row-left">
                        <div className="tx-pnl-row-main" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span className="tx-pnl-ticker">{d.name}</span>
                          {hasBreakdown && (
                            <span
                              aria-hidden
                              style={{
                                fontSize: '0.6rem', color: 'var(--tx-text-dim)',
                                transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s',
                              }}
                            >
                              ▶
                            </span>
                          )}
                        </div>
                        {d.lastUsedAt > 0 && <span className="tx-pnl-row-meta">last used {usedAgo(d.lastUsedAt)}</span>}
                      </div>
                      <div className="tx-pnl-row-right">
                        {d.interactions.toLocaleString()}
                        <span className="tx-pnl-row-right-sub">interaction{d.interactions === 1 ? '' : 's'}</span>
                      </div>
                    </div>

                    {open && hasBreakdown && (
                      <div style={{ padding: '0.55rem 0 0.2rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                        {d.actions.map(a => {
                          const actKey = `${d.name}|${a.action}`;
                          const actOpen = openAction === actKey;
                          const hasTxs = a.recent.length > 0;
                          return (
                            <div key={a.action} style={{ display: 'flex', flexDirection: 'column' }}>
                              <div
                                role={hasTxs ? 'button' : undefined}
                                tabIndex={hasTxs ? 0 : undefined}
                                onClick={() => hasTxs && setOpenAction(actOpen ? null : actKey)}
                                onKeyDown={e => {
                                  if (hasTxs && (e.key === 'Enter' || e.key === ' ')) {
                                    e.preventDefault();
                                    setOpenAction(actOpen ? null : actKey);
                                  }
                                }}
                                style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                  fontSize: '0.72rem', color: 'var(--tx-text-muted)',
                                  padding: '0.2rem 0.2rem', cursor: hasTxs ? 'pointer' : 'default',
                                }}
                              >
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                  {humanizeAction(a.action)}
                                  {hasTxs && (
                                    <span
                                      aria-hidden
                                      style={{
                                        fontSize: '0.55rem', color: 'var(--tx-text-dim)',
                                        transform: actOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s',
                                      }}
                                    >
                                      ▶
                                    </span>
                                  )}
                                </span>
                                <span style={{ color: 'var(--tx-text-dim)', fontVariantNumeric: 'tabular-nums' }}>
                                  ×{a.count.toLocaleString()}
                                </span>
                              </div>

                              {actOpen && hasTxs && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', padding: '0.1rem 0 0.35rem 0.9rem' }}>
                                  {a.recent.map(tx => (
                                    <Link
                                      key={tx.hash}
                                      href={`/tx/${tx.hash}?wallet=${footprint.address}`}
                                      style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        fontSize: '0.68rem', color: 'var(--tx-cyan)', textDecoration: 'none',
                                        padding: '0.12rem 0',
                                      }}
                                    >
                                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{tx.hash.slice(0, 10)}…{tx.hash.slice(-4)}</span>
                                      <span style={{ color: 'var(--tx-text-dim)' }}>{shortDate(tx.at)} · decode →</span>
                                    </Link>
                                  ))}
                                  {a.count > a.recent.length && (
                                    <span style={{ fontSize: '0.64rem', color: 'var(--tx-text-dim)', paddingTop: '0.1rem' }}>
                                      Showing the {a.recent.length} most recent of {a.count.toLocaleString()}.
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <Link
                          href={`/dapps/${slugify(d.name)}`}
                          style={{ fontSize: '0.68rem', color: 'var(--tx-cyan)', textDecoration: 'none', marginTop: '0.25rem', paddingLeft: '0.2rem' }}
                        >
                          View {d.name} in the dApp directory →
                        </Link>
                      </div>
                    )}
                  </li>
                );
              })}
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
