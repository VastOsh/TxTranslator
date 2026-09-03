'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import LensCrumb from '@/components/LensCrumb';
import PortfolioView from '@/components/PortfolioView';
import InjChart from '@/components/InjChart';
import Changelog from '@/components/Changelog';
import { CURRENT_VERSION } from '@/data/changelog';
import type { Portfolio } from '@/lib/portfolio/nft';
import type { WalletIntel, WalletFlag } from '@/lib/wallet/intel';

const ADDR_RE = /^inj1[a-z0-9]{38}$/;
const EXPLORER = 'https://explorer.injective.network/account';

function shortAddr(a: string): string {
  return a.length > 20 ? `${a.slice(0, 10)}…${a.slice(-6)}` : a;
}
function fmtAge(days: number | null): string {
  if (days == null) return 'unknown';
  if (days < 1) return 'today';
  if (days < 30) return `${days} day${days === 1 ? '' : 's'}`;
  if (days < 365) return `${Math.round(days / 30)} month${Math.round(days / 30) === 1 ? '' : 's'}`;
  const y = (days / 365).toFixed(1).replace(/\.0$/, '');
  return `${y} year${y === '1' ? '' : 's'}`;
}
const FLAG_STYLE: Record<WalletFlag['level'], { bg: string; color: string }> = {
  danger: { bg: 'rgba(246, 71, 114, 0.14)', color: 'var(--tx-red)' },
  warn: { bg: 'rgba(240, 160, 32, 0.14)', color: '#f0a020' },
  info: { bg: 'rgba(167, 139, 250, 0.14)', color: 'var(--tx-purple)' },
};

function IntelCard({ intel }: { intel: WalletIntel }) {
  const muted = 'rgba(244, 241, 233, 0.55)';
  const label = { fontSize: '0.66rem', textTransform: 'uppercase' as const, letterSpacing: '0.04em', color: muted, marginBottom: '0.15rem' };
  const val = { fontSize: '0.86rem', color: 'var(--tx-text)', fontWeight: 600 };
  return (
    <div className="tx-pnl-card" style={{ width: '100%', maxWidth: 680, marginBottom: '1rem' }}>
      <div className="tx-pnl-head">
        <span className="tx-pnl-head-title">Wallet intelligence</span>
        {intel.hex && (
          <a href={`${EXPLORER}/${intel.inj}`} target="_blank" rel="noopener noreferrer" className="tx-pnl-row-meta" style={{ textDecoration: 'none' }}>
            explorer ↗
          </a>
        )}
      </div>
      <div style={{ padding: '0.9rem 1.2rem' }}>
        {intel.flags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.9rem' }}>
            {intel.flags.map((f, i) => (
              <span key={i} style={{ ...FLAG_STYLE[f.level], fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: 6 }}>
                {f.label}
              </span>
            ))}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.85rem 1rem' }}>
          <div>
            <div style={label}>Account age</div>
            <div style={val}>{fmtAge(intel.ageDays)}</div>
          </div>
          <div>
            <div style={label}>Lifetime txs</div>
            <div style={val}>{intel.txCount.toLocaleString('en-US')}</div>
          </div>
          <div>
            <div style={label}>First funded by</div>
            <div style={val}>
              {intel.firstFunder ? (
                <a href={`${EXPLORER}/${intel.firstFunder}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--tx-purple)', textDecoration: 'none', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.78rem' }}>
                  {shortAddr(intel.firstFunder)} ↗
                </a>
              ) : <span style={{ color: muted }}>—</span>}
            </div>
          </div>
          <div>
            <div style={label}>Launchpad launches</div>
            <div style={val}>
              {intel.launched > 0 ? `${intel.launched} · ${intel.graduated} graduated` : <span style={{ color: muted }}>None</span>}
            </div>
          </div>
        </div>
        <div style={{ fontSize: '0.68rem', color: muted, marginTop: '0.9rem', lineHeight: 1.5 }}>
          On-chain history and launchpad activity — what this wallet has done, not who it is. First funder is the wallet
          behind its earliest transfer (Cosmos or EVM); shared funders can indicate linked wallets or a common exchange.
        </div>
      </div>
    </div>
  );
}

export default function WalletPage() {
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [value, setValue] = useState('');
  const [address, setAddress] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [intel, setIntel] = useState<WalletIntel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function runScan(addr: string) {
    if (!ADDR_RE.test(addr)) {
      setError('Enter a valid inj1… wallet address.');
      return;
    }
    setError(null);
    setLoading(true);
    setPortfolio(null);
    setIntel(null);
    setAddress(addr);

    // Wallet intelligence loads independently of (and usually faster than) the
    // NFT/portfolio scan — render it as soon as it lands.
    fetch('/api/wallet/intel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: addr }),
    })
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => { if (ok) setIntel(data.intel as WalletIntel); })
      .catch(() => { /* intel is best-effort; the portfolio is the primary view */ });

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

  function scan(e: React.FormEvent) {
    e.preventDefault();
    runScan(value.trim());
  }

  // Deep-link support: /wallet?address=inj1… (e.g. from the insiders page) —
  // prefill the input and scan on load. Read from the URL directly to avoid the
  // useSearchParams Suspense requirement; defer the state updates out of the
  // effect body so they don't cascade synchronously.
  useEffect(() => {
    const addr = new URLSearchParams(window.location.search).get('address')?.trim();
    if (!addr || !ADDR_RE.test(addr)) return;
    const t = setTimeout(() => { setValue(addr); runScan(addr); }, 0);
    return () => clearTimeout(t);
  }, []);

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
        <LensCrumb name="Wallet Intelligence" accent="#9B8CFF" />
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

      {/* ── Intro + address input ── */}
      <section className="tx-hero" style={{ marginBottom: portfolio || loading || error ? '2rem' : '0' }}>
        {!portfolio && !loading && (
          <>
            <h1 className="tx-headline">
              Wallet <span>intelligence</span>
            </h1>
            <p className="tx-subline">
              Enter a wallet — see its age, first funder, launchpad track record and risk flags, plus every Talis NFT it holds
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

      {intel && <IntelCard intel={intel} />}

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
