'use client';

import { use, useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Changelog from '@/components/Changelog';
import { CURRENT_VERSION } from '@/data/changelog';
import type { DappDetail } from '@/lib/dapps/registry';

function compactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

function fullDate(ts: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function shortAddr(a: string): string {
  return `${a.slice(0, 12)}…${a.slice(-6)}`;
}

export default function DappDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);

  const [changelogOpen, setChangelogOpen] = useState(false);
  const [detail, setDetail] = useState<DappDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/dapps?slug=${encodeURIComponent(slug)}`)
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) setError(data.error ?? 'Could not load this dApp.');
        else setDetail(data.detail as DappDetail);
      })
      .catch(() => { if (!cancelled) setError('Network error — check your connection and try again.'); });
    return () => { cancelled = true; };
  }, [slug]);

  return (
    <main className="tx-main">
      <header
        className="tx-page-header"
        style={{
          width: '100%',
          maxWidth: 680,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1.25rem 0',
          borderBottom: '1px solid var(--tx-border)',
          marginBottom: '2rem',
        }}
      >
        <Link href="/" style={{ textDecoration: 'none' }}>
          <div className="tx-logo">
            <Image src="/logo.svg" alt="Tx·Translator logo" width={28} height={28} priority />
            TX · TRANSLATOR
          </div>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <span className="tx-footer">Injective Mainnet</span>
          <button className="tx-version-btn" onClick={() => setChangelogOpen(true)}>
            {CURRENT_VERSION}
          </button>
        </div>
      </header>

      {changelogOpen && <Changelog onClose={() => setChangelogOpen(false)} />}

      <div style={{ width: '100%', maxWidth: 680, marginBottom: '1.25rem' }}>
        <Link href="/dapps" className="tx-back-link">← All dApps</Link>
      </div>

      {error && (
        <div style={{ width: '100%', maxWidth: 680 }}>
          <div className="tx-error-msg">{error}</div>
          <div style={{ marginTop: '1rem' }}>
            <Link href="/dapps" className="tx-back-link">← Back to directory</Link>
          </div>
        </div>
      )}

      {!detail && !error && (
        <div className="tx-skel-wrap">
          <div className="tx-skel-card">
            <div className="tx-skel" style={{ height: 24, width: '45%' }} />
            <div className="tx-skel" style={{ height: 12, width: '85%' }} />
            <div className="tx-skel" style={{ height: 60, width: '100%' }} />
          </div>
        </div>
      )}

      {detail && (
        <div className="tx-dapp-wrap">
          <div className="tx-pnl-card">
            <div className="tx-pnl-hero">
              <span className="tx-pnl-hero-label">{detail.description}</span>
              <span className="tx-pnl-hero-value" style={{ fontSize: '1.7rem' }}>{detail.name}</span>
            </div>

            <div className="tx-pnl-grid">
              <div className="tx-pnl-stat">
                <span className="tx-pnl-stat-label">Executions</span>
                <span className="tx-pnl-stat-value">{compactCount(detail.totalExecutions)}</span>
              </div>
              <div className="tx-pnl-stat">
                <span className="tx-pnl-stat-label">Contracts</span>
                <span className="tx-pnl-stat-value">
                  {detail.resolvedContracts}
                  {detail.resolvedContracts !== detail.contractCount && ` / ${detail.contractCount}`}
                </span>
              </div>
              <div className="tx-pnl-stat">
                <span className="tx-pnl-stat-label">First seen</span>
                <span className="tx-pnl-stat-value" style={{ fontSize: '0.78rem' }}>{fullDate(detail.firstSeenAt)}</span>
              </div>
              <div className="tx-pnl-stat">
                <span className="tx-pnl-stat-label">Last active</span>
                <span className="tx-pnl-stat-value" style={{ fontSize: '0.78rem' }}>{fullDate(detail.lastActiveAt)}</span>
              </div>
            </div>

            {detail.context && <p className="tx-dapp-detail-context">{detail.context}</p>}
          </div>

          <div className="tx-pnl-card">
            <div className="tx-pnl-head">
              <span className="tx-pnl-head-title">Contracts · {detail.contracts.length}</span>
            </div>
            <ul className="tx-pnl-list">
              {detail.contracts.map(c => (
                <li key={c.address} className="tx-pnl-row">
                  <div className="tx-pnl-row-left">
                    <div className="tx-pnl-row-main">
                      <span className="tx-pnl-ticker">{c.label ?? 'Account / token denom'}</span>
                      {!c.isContract && <span className="tx-pnl-row-meta">not a wasm contract</span>}
                    </div>
                    <a
                      className="tx-dapp-contract-addr"
                      href={`https://explorer.injective.network/account/${c.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {shortAddr(c.address)}
                    </a>
                  </div>
                  <div className="tx-pnl-row-right">
                    {c.isContract ? compactCount(c.executions) : '—'}
                    <span className="tx-pnl-row-right-sub">
                      {c.lastActiveAt ? fullDate(c.lastActiveAt) : 'never'}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <p className="tx-dapp-intro">
            Executions are lifetime contract calls from the chain&rsquo;s wasm registry. This is not TVL
            or trading volume — those aren&rsquo;t available as a lookup and would need per-protocol state
            queries plus historical pricing to compute honestly.
          </p>
        </div>
      )}

      <footer
        style={{
          marginTop: 'auto',
          padding: '2.5rem 0 1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
        }}
      >
        <span className="tx-footer">Made by S!G</span>
        <span className="tx-footer" style={{ opacity: 0.4 }}>·</span>
        <span className="tx-footer">Injective</span>
      </footer>
    </main>
  );
}
