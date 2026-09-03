'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import LensCrumb from '@/components/LensCrumb';
import Changelog from '@/components/Changelog';
import { CURRENT_VERSION } from '@/data/changelog';
import type { SerialFunder } from '@/lib/token/insiders';

const EXPLORER = 'https://explorer.injective.network/account';

function shortAddr(a: string): string {
  return a.length > 20 ? `${a.slice(0, 10)}…${a.slice(-6)}` : a;
}

export default function InsidersPage() {
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [funders, setFunders] = useState<SerialFunder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/insiders')
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!live) return;
        if (!ok) setError(data.error ?? 'Could not build the insider index.');
        else setFunders(data.funders as SerialFunder[]);
      })
      .catch(() => { if (live) setError('Network error — try again.'); });
    return () => { live = false; };
  }, []);

  return (
    <main className="tx-main">
      <header
        className="tx-page-header"
        style={{
          width: '100%', maxWidth: 680, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', padding: '1.25rem 0',
          borderBottom: '1px solid var(--tx-border)', marginBottom: '2rem',
        }}
      >
        <LensCrumb name="Insiders" accent="#9B8CFF" />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <span className="tx-footer">Injective Mainnet</span>
          <button className="tx-version-btn" onClick={() => setChangelogOpen(true)}>
            {CURRENT_VERSION}
          </button>
        </div>
      </header>

      {changelogOpen && <Changelog onClose={() => setChangelogOpen(false)} />}

      <div style={{ width: '100%', maxWidth: 680, marginBottom: '1.25rem' }}>
        <Link href="/" className="tx-back-link">← All lenses</Link>
      </div>

      <section className="tx-hero" style={{ marginBottom: '1.75rem' }}>
        <h1 className="tx-headline">
          Launchpad <span>insiders</span>
        </h1>
        <p className="tx-subline">
          Wallets that funded the top holders of many different Trippy-launchpad tokens — a cross-token
          view of coordinated activity no explorer surfaces
        </p>
      </section>

      {error && (
        <div className="tx-error-msg" style={{ width: '100%', maxWidth: 680, marginBottom: '1rem' }}>{error}</div>
      )}

      {!funders && !error && (
        <div className="tx-pnl-card" style={{ width: '100%', maxWidth: 680 }}>
          <div className="tx-pnl-head">
            <span className="tx-pnl-head-title">Insider index</span>
            <span className="tx-pnl-row-meta">
              <span className="tx-spinner" style={{ display: 'inline-block', verticalAlign: 'middle' }} /> tracing funding across recent launches…
            </span>
          </div>
          <div style={{ padding: '0.9rem 1.2rem', fontSize: '0.72rem', color: 'var(--tx-text-muted)' }}>
            Following each recent token’s top holders back to the wallet that first funded them, then
            grouping funders seen across multiple tokens. Built hourly — first load can take a few seconds.
          </div>
        </div>
      )}

      {funders && (
        <div style={{ width: '100%', maxWidth: 680 }}>
          {funders.length === 0 ? (
            <div className="tx-pnl-card">
              <div style={{ padding: '1rem 1.2rem', fontSize: '0.8rem', color: 'var(--tx-text)' }}>
                No serial funders found across the recent launches — top holders were funded independently.
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: '0.72rem', color: 'rgba(236, 239, 245, 0.55)', marginBottom: '0.75rem' }}>
                {funders.length} wallet{funders.length === 1 ? '' : 's'} funded the top holders of 2+ tokens · most-connected first
              </div>
              {funders.map((f) => (
                <div
                  key={f.funder}
                  className="tx-pnl-card"
                  style={{ marginBottom: '0.6rem', padding: '0.85rem 1rem' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.55rem' }}>
                    <Link
                      href={`/wallet?address=${f.funder}`}
                      style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.82rem', color: 'var(--tx-purple)', textDecoration: 'none', fontWeight: 600 }}
                    >
                      {shortAddr(f.funder)}
                    </Link>
                    <span
                      style={{
                        flex: '0 0 auto', fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.5rem',
                        borderRadius: 6, background: 'rgba(240, 160, 32, 0.14)', color: '#f0a020',
                      }}
                    >
                      {f.launchCount} tokens
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {f.tokens.map((t) => (
                      <Link
                        key={t.id}
                        href={`/wallet?address=${f.funder}`}
                        title={`onchain #${t.onchainId}`}
                        style={{
                          fontSize: '0.68rem', fontWeight: 600, padding: '0.15rem 0.45rem', borderRadius: 5,
                          background: 'rgba(236, 239, 245, 0.05)', color: 'var(--tx-text)', textDecoration: 'none',
                        }}
                      >
                        {t.symbol || `#${t.onchainId}`}
                      </Link>
                    ))}
                    <a
                      href={`${EXPLORER}/${f.funder}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: '0.68rem', color: 'rgba(236, 239, 245, 0.5)', textDecoration: 'none', alignSelf: 'center' }}
                    >
                      explorer ↗
                    </a>
                  </div>
                </div>
              ))}
              <div style={{ fontSize: '0.68rem', color: 'rgba(236, 239, 245, 0.5)', marginTop: '0.8rem', lineHeight: 1.5 }}>
                A funder shared by the top holders of several tokens points to coordinated activity — one operator across
                many wallets, or a market-maker fleet — but it can also be a common exchange withdrawal address. Shown as a
                signal, not a verdict; open a funder’s wallet profile or the explorer to judge. Covers recent launches only.
              </div>
            </>
          )}
        </div>
      )}

      <footer
        style={{
          marginTop: 'auto', padding: '2rem 0.75rem 1.5rem', display: 'flex', alignItems: 'center',
          justifyContent: 'center', flexWrap: 'wrap', gap: '0.55rem 1rem', textAlign: 'center',
        }}
      >
        <span className="tx-footer">Made by S!G</span>
        <span className="tx-footer" style={{ opacity: 0.4 }}>·</span>
        <a href="https://x.com/TxTranslator" target="_blank" rel="noopener noreferrer" className="tx-footer" style={{ textDecoration: 'none', opacity: 0.7 }}>
          Whale feed @TxTranslator ↗
        </a>
      </footer>
    </main>
  );
}
