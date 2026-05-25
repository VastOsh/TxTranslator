'use client';

import { useState } from 'react';
import SearchForm from '@/components/SearchForm';
import TranslationResult from '@/components/TranslationResult';
import WalletTxList from '@/components/WalletTxList';
import InjChart from '@/components/InjChart';
import type { TranslationResponse } from '@/types';
import type { WalletTx } from '@/components/WalletTxList';

const HASH_RE = /^(0x)?[0-9a-fA-F]{64}$/;
const ADDR_RE = /^inj1[a-z0-9]{38}$/;

function LoadingSkeleton() {
  return (
    <div className="tx-skel-wrap">
      <div className="tx-skel-card">
        <div className="tx-skel" style={{ height: 10, width: '40%' }} />
        <div className="tx-skel" style={{ height: 22, width: '85%' }} />
        <div className="tx-skel" style={{ height: 18, width: '60%' }} />
      </div>
      <div className="tx-skel-card">
        <div className="tx-skel" style={{ height: 10, width: '30%' }} />
        <div className="tx-skel" style={{ height: 18, width: '50%' }} />
      </div>
      <div className="tx-skel-card">
        <div className="tx-skel" style={{ height: 10, width: '35%' }} />
        <div className="tx-skel" style={{ height: 14, width: '95%' }} />
        <div className="tx-skel" style={{ height: 14, width: '70%' }} />
      </div>
    </div>
  );
}

function WalletSkeleton() {
  return (
    <div className="tx-skel-wrap">
      {[85, 70, 90, 65, 80].map((w, i) => (
        <div key={i} className="tx-skel-card" style={{ padding: '0.75rem 1.2rem', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flex: 1 }}>
            <div className="tx-skel" style={{ height: 8, width: 8, borderRadius: '50%', flexShrink: 0 }} />
            <div className="tx-skel" style={{ height: 14, width: `${w}%` }} />
          </div>
          <div className="tx-skel" style={{ height: 26, width: 72, flexShrink: 0, borderRadius: 3 }} />
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const [result, setResult] = useState<TranslationResponse | null>(null);
  const [walletTxs, setWalletTxs] = useState<WalletTx[] | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMode, setLoadingMode] = useState<'hash' | 'wallet' | null>(null);
  const [error, setError] = useState<string | null>(null);

  function resetState() {
    setResult(null);
    setWalletTxs(null);
    setWalletAddress(null);
    setError(null);
    window.history.replaceState(null, '', '/');
  }

  async function handleSearch(input: string) {
    const trimmed = input.trim();
    setLoading(true);
    resetState();

    if (ADDR_RE.test(trimmed)) {
      setLoadingMode('wallet');
      await handleWalletScan(trimmed);
    } else if (HASH_RE.test(trimmed)) {
      setLoadingMode('hash');
      await handleHashDecode(trimmed);
    } else {
      setError('Enter a valid tx hash or inj1… wallet address.');
      setLoading(false);
    }
  }

  async function handleHashDecode(hash: string) {
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.');
        return;
      }
      setResult(data as TranslationResponse);
      window.history.pushState(null, '', `/tx/${(data as TranslationResponse).hash}`);
    } catch {
      setError('Network error — check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleWalletScan(address: string) {
    try {
      const res = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not fetch wallet history.');
        return;
      }
      setWalletTxs(data.txs as WalletTx[]);
      setWalletAddress(address);
    } catch {
      setError('Network error — check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  const hasOutput = result || walletTxs !== null;

  return (
    <main className="tx-main">
      {/* ── Header ── */}
      <header
        className="tx-page-header"
        style={{
          width: '100%',
          maxWidth: 680,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1.25rem 0',
          borderBottom: '1px solid rgba(0,212,255,0.08)',
          marginBottom: '4rem',
        }}
      >
        <div className="tx-logo">
          <div className="tx-logo-dot" />
          TX · TRANSLATOR
        </div>
        <span className="tx-footer">Injective Mainnet</span>
      </header>

      {/* ── Hero ── */}
      <section
        className="tx-hero"
        style={{ marginBottom: hasOutput || loading || error ? '2.5rem' : '0' }}
      >
        {!hasOutput && !loading && (
          <>
            <h1 className="tx-headline">
              Decode any<br /><span>Injective</span> transaction
            </h1>
            <p className="tx-subline">
              Paste a tx hash or a wallet address — get a plain-English breakdown in seconds
            </p>
          </>
        )}

        <SearchForm onSearch={handleSearch} loading={loading} />

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

      {/* ── Output ── */}
      {loading && loadingMode === 'wallet' && <WalletSkeleton />}
      {loading && loadingMode === 'hash' && <LoadingSkeleton />}

      {result && (
        <>
          <TranslationResult data={result} />
          <div style={{
            marginTop: '0.75rem',
            padding: '0.55rem 0.85rem',
            borderRadius: '6px',
            background: 'rgba(251, 146, 60, 0.08)',
            border: '1px solid rgba(251, 146, 60, 0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            fontSize: '0.7rem',
            color: 'rgba(251, 146, 60, 0.85)',
            letterSpacing: '0.02em',
          }}>
            <span style={{ fontSize: '0.75rem' }}>⚠</span>
            AI-generated insights may contain inaccuracies — this tool is in active development.
          </div>
        </>
      )}

      {walletTxs !== null && walletAddress && (
        <WalletTxList address={walletAddress} txs={walletTxs} />
      )}

      {/* ── INJ Price Chart ── */}
      <InjChart />

      {/* ── Footer ── */}
      <footer
        style={{
          marginTop: 'auto',
          padding: '2rem 0 1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
        }}
      >
        <span className="tx-footer">Made by S!G</span>
        <span className="tx-footer" style={{ opacity: 0.4 }}>·</span>
        <a
          href="https://x.com/SiGPRMR"
          target="_blank"
          rel="noopener noreferrer"
          className="tx-footer"
          style={{ textDecoration: 'none', opacity: 0.7 }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '0.7')}
        >
          Contact me ↗
        </a>
        <span className="tx-footer" style={{ opacity: 0.4 }}>·</span>
        <span className="tx-footer">Injective</span>
      </footer>
    </main>
  );
}
