'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import SearchForm from '@/components/SearchForm';
import TranslationResult from '@/components/TranslationResult';
import WalletTxList from '@/components/WalletTxList';
import PnlDashboard, { type PnlRangeKey } from '@/components/PnlDashboard';
import WalletFootprint from '@/components/WalletFootprint';
import InjChart from '@/components/InjChart';
import RecentHistory from '@/components/RecentHistory';
import Changelog from '@/components/Changelog';
import NewsTicker from '@/components/NewsTicker';
import { useRecentTxs } from '@/hooks/useRecentTxs';
import { CURRENT_VERSION } from '@/data/changelog';
import type { TranslationResponse } from '@/types';
import type { WalletTx } from '@/components/WalletTxList';
import type { PnlReport } from '@/lib/pnl/aggregate';
import type { WalletFootprint as Footprint } from '@/lib/wallet/footprint';

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

const CHANGELOG_READ_KEY = 'tx-changelog-read';

export default function Home() {
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    setHasUnread(localStorage.getItem(CHANGELOG_READ_KEY) !== CURRENT_VERSION);
  }, []);
  const [result, setResult] = useState<TranslationResponse | null>(null);
  const [walletTxs, setWalletTxs] = useState<WalletTx[] | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMode, setLoadingMode] = useState<'hash' | 'wallet' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [walletTab, setWalletTab] = useState<'activity' | 'pnl'>('activity');
  const [pnlReport, setPnlReport] = useState<PnlReport | null>(null);
  const [pnlRange, setPnlRange] = useState<PnlRangeKey>('7d');
  const [pnlLoading, setPnlLoading] = useState(false);
  const [footprint, setFootprint] = useState<Footprint | null>(null);
  const [footprintLoading, setFootprintLoading] = useState(false);
  const [footprintError, setFootprintError] = useState(false);
  // Tracks the wallet of the most recent scan so a slow in-flight footprint
  // response for an earlier wallet can be discarded.
  const walletAddressRef = useRef<string | null>(null);
  const { recent, addRecent, clearRecent } = useRecentTxs();

  function resetState(clearWallet = true) {
    setResult(null);
    setWalletTxs(null);
    if (clearWallet) setWalletAddress(null);
    setError(null);
    setWalletTab('activity');
    setPnlReport(null);
    setPnlRange('7d');
    setFootprint(null);
    setFootprintLoading(false);
    setFootprintError(false);
    walletAddressRef.current = null;
    window.history.replaceState(null, '', '/');
  }

  // Runs alongside the wallet scan rather than inside it — the tx list should
  // render immediately instead of waiting on the multi-page fee scan. The
  // address is captured so a slow response for a previous wallet cannot land on
  // the current one.
  async function loadFootprint(address: string) {
    walletAddressRef.current = address;
    setFootprint(null);
    setFootprintError(false);
    setFootprintLoading(true);
    try {
      const res = await fetch('/api/wallet/fees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      if (walletAddressRef.current !== address) return; // a newer scan started
      if (!res.ok) {
        setFootprintError(true);
        return;
      }
      const data = await res.json();
      setFootprint(data.footprint as Footprint);
    } catch {
      if (walletAddressRef.current === address) setFootprintError(true);
    } finally {
      if (walletAddressRef.current === address) setFootprintLoading(false);
    }
  }

  async function loadPnl(address: string, range: PnlRangeKey) {
    setPnlRange(range);
    setPnlLoading(true);
    try {
      const res = await fetch('/api/pnl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, range }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not build the PnL report.');
        return;
      }
      setPnlReport(data.report as PnlReport);
    } catch {
      setError('Network error — check your connection and try again.');
    } finally {
      setPnlLoading(false);
    }
  }

  async function handleSearch(input: string) {
    const trimmed = input.trim();
    setLoading(true);

    if (ADDR_RE.test(trimmed)) {
      resetState();
      setLoadingMode('wallet');
      await handleWalletScan(trimmed);
    } else if (HASH_RE.test(trimmed)) {
      resetState(false); // preserve walletAddress as viewer context
      setLoadingMode('hash');
      await handleHashDecode(trimmed, walletAddress ?? undefined);
    } else {
      setError('Enter a valid tx hash or inj1… wallet address.');
      setLoading(false);
    }
  }

  async function handleHashDecode(hash: string, viewerAddress?: string) {
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash, ...(viewerAddress ? { viewerAddress } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.');
        return;
      }
      const tx = data as TranslationResponse;
      setResult(tx);
      addRecent({
        hash: tx.hash,
        action: tx.action,
        txCategory: tx.txCategory,
        protocol: tx.protocol,
        status: tx.status,
      });
      window.history.pushState(null, '', `/tx/${tx.hash}`);
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
      loadFootprint(address);
    } catch {
      setError('Network error — check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  const hasOutput = result || walletTxs !== null;

  return (
    <main className="tx-main">
      {/* ── News Ticker ── */}
      <NewsTicker />

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
          borderBottom: '1px solid var(--tx-border)',
          marginBottom: '4rem',
        }}
      >
        <div
          className="tx-logo"
          onClick={() => resetState(true)}
          style={{ cursor: hasOutput ? 'pointer' : 'default' }}
        >
          <Image src="/logo.svg" alt="Tx·Translator logo" width={28} height={28} priority />
          TX · TRANSLATOR
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <span className="tx-footer">Injective Mainnet</span>
          <button
            className={`tx-version-btn${hasUnread ? ' tx-version-btn--unread' : ''}`}
            onClick={() => {
              setChangelogOpen(true);
              setHasUnread(false);
              localStorage.setItem(CHANGELOG_READ_KEY, CURRENT_VERSION);
            }}
          >
            {CURRENT_VERSION}
          </button>
        </div>
      </header>

      {changelogOpen && <Changelog onClose={() => setChangelogOpen(false)} />}

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

        {!hasOutput && !loading && (
          <div className="tx-cta-row">
            <Link href="/dapps" className="tx-dapp-cta">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
              </svg>
              dApp directory
              <span aria-hidden style={{ opacity: 0.7 }}>→</span>
            </Link>
            <Link href="/buyback" className="tx-dapp-cta">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
                <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
              </svg>
              BuyBack checker
              <span aria-hidden style={{ opacity: 0.7 }}>→</span>
            </Link>
            <Link href="/wallet" className="tx-dapp-cta">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M3 10h18" />
                <circle cx="8" cy="14.5" r="1.5" />
              </svg>
              NFT portfolio
              <span aria-hidden style={{ opacity: 0.7 }}>→</span>
            </Link>
            <Link href="/token" className="tx-dapp-cta">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
                <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
                <path d="M9.5 12l2 2 3.5-4" />
              </svg>
              Token safety
              <span aria-hidden style={{ opacity: 0.7 }}>→</span>
            </Link>
          </div>
        )}
      </section>

      {/* ── Recent history — idle state only ── */}
      {!hasOutput && !loading && recent.length > 0 && (
        <div style={{ width: '100%', maxWidth: 680, marginTop: '2rem', marginBottom: '1rem' }}>
          <RecentHistory recent={recent} onSelect={handleSearch} onClear={clearRecent} />
        </div>
      )}

      {/* ── Output ── */}
      {loading && loadingMode === 'wallet' && <WalletSkeleton />}
      {loading && loadingMode === 'hash' && <LoadingSkeleton />}

      {result && (
        <>
          <div style={{ width: '100%', maxWidth: 680, marginBottom: '1.25rem' }}>
            <button
              className="tx-back-link"
              onClick={() => { resetState(true); window.history.replaceState(null, '', '/'); }}
            >
              ← Decode another transaction
            </button>
          </div>
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
        <>
          <div className="tx-pnl-tabs">
            <button
              className={`tx-pnl-tab${walletTab === 'activity' ? ' tx-pnl-tab--on' : ''}`}
              onClick={() => setWalletTab('activity')}
            >
              Activity
            </button>
            <button
              className={`tx-pnl-tab${walletTab === 'pnl' ? ' tx-pnl-tab--on' : ''}`}
              onClick={() => {
                setWalletTab('pnl');
                if (!pnlReport && !pnlLoading) loadPnl(walletAddress, pnlRange);
              }}
            >
              Perp PnL
            </button>
          </div>

          {walletTab === 'activity' && (
            <>
              {footprintLoading && (
                <div className="tx-pnl-card" style={{ width: '100%', maxWidth: 680, marginBottom: '0.85rem' }}>
                  <div className="tx-pnl-head">
                    <span className="tx-pnl-head-title">On-chain footprint</span>
                    <span className="tx-pnl-row-meta">
                      <span className="tx-spinner" style={{ display: 'inline-block', verticalAlign: 'middle' }} /> scanning…
                    </span>
                  </div>
                  <div style={{ padding: '0.9rem 1.2rem', fontSize: '0.72rem', color: 'var(--tx-text-muted)' }}>
                    Reading recent transactions to compute gas paid and dApps used — a few seconds.
                  </div>
                </div>
              )}
              {footprintError && !footprintLoading && (
                <div className="tx-pnl-card" style={{ width: '100%', maxWidth: 680, marginBottom: '0.85rem' }}>
                  <div className="tx-pnl-head">
                    <span className="tx-pnl-head-title">On-chain footprint</span>
                    <button
                      className="tx-pnl-range"
                      onClick={() => walletAddress && loadFootprint(walletAddress)}
                    >
                      Retry
                    </button>
                  </div>
                  <div style={{ padding: '0.9rem 1.2rem', fontSize: '0.72rem', color: 'var(--tx-text-muted)' }}>
                    Couldn&rsquo;t load the footprint — the indexer may be busy. Retry above.
                  </div>
                </div>
              )}
              {footprint && <WalletFootprint footprint={footprint} />}
              <WalletTxList address={walletAddress} txs={walletTxs} />
            </>
          )}

          {walletTab === 'pnl' && (
            pnlReport ? (
              <PnlDashboard
                report={pnlReport}
                range={pnlRange}
                loading={pnlLoading}
                onRangeChange={r => loadPnl(walletAddress, r)}
              />
            ) : (
              <WalletSkeleton />
            )
          )}
        </>
      )}

      {/* ── INJ Price Chart ── */}
      <InjChart />

      {/* ── Footer ── */}
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
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '0.7')}
        >
          Whale feed @TxTranslator ↗
        </a>
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
      </footer>
    </main>
  );
}
