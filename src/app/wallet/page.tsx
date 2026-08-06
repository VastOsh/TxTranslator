'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import PortfolioView from '@/components/PortfolioView';
import InjChart from '@/components/InjChart';
import Changelog from '@/components/Changelog';
import { CURRENT_VERSION } from '@/data/changelog';
import type { Portfolio } from '@/lib/portfolio/nft';

const ADDR_RE = /^inj1[a-z0-9]{38}$/;

export default function WalletPage() {
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [value, setValue] = useState('');
  const [address, setAddress] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function scan(e: React.FormEvent) {
    e.preventDefault();
    const addr = value.trim();
    if (!ADDR_RE.test(addr)) {
      setError('Enter a valid inj1… wallet address.');
      return;
    }
    setError(null);
    setLoading(true);
    setPortfolio(null);
    setAddress(addr);

    fetch('/api/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: addr }),
    })
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) setError(data.error ?? 'Could not read the wallet portfolio.');
        else setPortfolio(data.portfolio as Portfolio);
      })
      .catch(() => setError('Network error — check your connection and try again.'))
      .finally(() => setLoading(false));
  }

  const short = address ? `${address.slice(0, 12)}…${address.slice(-8)}` : null;

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
        <Link href="/" className="tx-back-link">← Back to decoder</Link>
      </div>

      {/* ── Intro + address input ── */}
      <section className="tx-hero" style={{ marginBottom: portfolio || loading || error ? '2rem' : '0' }}>
        {!portfolio && !loading && (
          <>
            <h1 className="tx-headline">
              Wallet <span>NFT</span> portfolio
            </h1>
            <p className="tx-subline">
              Enter a wallet — see every Talis NFT it holds, read live from each collection on-chain
            </p>
          </>
        )}

        <form className="tx-search-wrap" onSubmit={scan} noValidate>
          <div className="tx-search-bar">
            <input
              className="tx-input"
              type="text"
              spellCheck={false}
              autoComplete="off"
              placeholder="inj1… wallet address"
              value={value}
              onChange={e => setValue(e.target.value)}
              disabled={loading}
              aria-label="Wallet address"
            />
            <button type="submit" className="tx-btn" disabled={loading} aria-busy={loading}>
              {loading ? (<><div className="tx-spinner" />Scanning</>) : 'Scan'}
            </button>
          </div>
        </form>

        {error && (
          <div className="tx-error-msg" style={{ marginTop: '0.75rem' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </div>
        )}
      </section>

      {short && (portfolio || loading) && (
        <div
          style={{
            width: '100%', maxWidth: 680, marginBottom: '1rem',
            display: 'flex', justifyContent: 'flex-end',
          }}
        >
          <span className="tx-wallet-addr">{short}</span>
        </div>
      )}

      {loading && (
        <div className="tx-pnl-card" style={{ width: '100%', maxWidth: 680 }}>
          <div className="tx-pnl-head">
            <span className="tx-pnl-head-title">NFT portfolio</span>
            <span className="tx-pnl-row-meta">
              <span className="tx-spinner" style={{ display: 'inline-block', verticalAlign: 'middle' }} /> scanning collections…
            </span>
          </div>
          <div style={{ padding: '0.9rem 1.2rem', fontSize: '0.72rem', color: 'var(--tx-text-muted)' }}>
            Asking every Talis collection whether this wallet holds a token, then resolving
            metadata — usually under ten seconds.
          </div>
        </div>
      )}

      {portfolio && !loading && <PortfolioView portfolio={portfolio} />}

      <InjChart />

      <footer
        style={{
          marginTop: 'auto',
          padding: '2rem 0.75rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: '0.55rem 1rem',
          textAlign: 'center',
        }}
      >
        <span className="tx-footer">Made by S!G</span>
        <span className="tx-footer" style={{ opacity: 0.4 }}>·</span>
        <a
          href="https://x.com/TxTranslator"
          target="_blank"
          rel="noopener noreferrer"
          className="tx-footer"
          style={{ textDecoration: 'none', opacity: 0.7 }}
        >
          Whale feed @TxTranslator ↗
        </a>
      </footer>
    </main>
  );
}
