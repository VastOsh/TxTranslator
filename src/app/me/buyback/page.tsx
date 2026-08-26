'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Changelog from '@/components/Changelog';
import { CURRENT_VERSION } from '@/data/changelog';

interface MyDeposit {
  roundId: number;
  startDate: number;
  endDate: number;
  depositInj: string;
  depositUsd: number | null;
  walletCapInj: string;
  hasWithdrawn: boolean;
  depositTime: number | null;
  secondsAfterOpen: number | null;
  txHash: string | null;
  basketKnownUsd: number;
  basketHasUnpriced: boolean;
}

interface MyBuyback {
  address: string;
  deposits: MyDeposit[];
  roundsCommitted: number;
  totalDepositedInj: string;
  totalDepositedUsd: number | null;
  totalRewardsKnownUsd: number;
  rewardsHaveUnpriced: boolean;
  unclaimedRounds: number;
}

interface Participant {
  rank: number;
  wallet: string;
  timestamp: number;
  secondsAfterOpen: number;
  amountInj: string;
  txHash: string;
  gasWanted: number;
  fleetSize: number;
  firstSeen: number | null;
  signals: string[];
  automationLikely: boolean;
}

interface LastRound {
  round: {
    id: number;
    startDate: number;
    endDate: number;
    status: 'open' | 'closed' | 'upcoming';
    walletCapInj: string;
    roundCapInj: string;
    totalDepositInj: string;
  };
  stats: {
    uniqueWallets: number;
    fastestSeconds: number | null;
    medianSeconds: number | null;
    fillSeconds: number | null;
  };
  botSummary: {
    flaggedCount: number;
    scriptedPct: number;
    agesResolved: number;
    fleets: Array<{ gas: number; count: number }>;
  };
  shutOut: {
    count: number;
    capped: boolean;
    gotIn: number;
    sample: string[];
  };
  buckets: Array<{ label: string; count: number }>;
  participants: Participant[];
}

interface WalletStatus {
  roundId: number;
  status: 'in' | 'shut_out' | 'not_whitelisted' | 'unknown';
  depositInj: string | null;
  depositTime: number | null;
  secondsAfterOpen: number | null;
}

type View = 'mine' | 'round' | 'shutout';

const SIGNAL_LABEL: Record<string, string> = {
  fast: 'fast',
  'gas-fleet': 'gas-fleet',
  burst: 'burst',
  new: 'new wallet',
};

const ADDR_RE = /^inj1[a-z0-9]{38}$/;
const WALLET_KEY = 'tx_me_wallet';

const MUTED = 'rgba(244, 241, 233, 0.6)';
const SOFT = 'rgba(244, 241, 233, 0.82)';

function fmtInj(v: string | number): string {
  const n = typeof v === 'string' ? Number(v) : v;
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function fmtUsd(v: number | null): string | null {
  if (v === null || !Number.isFinite(v)) return null;
  return `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function fmtUtc(sec: number): string {
  const d = new Date(sec * 1000);
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: 'UTC',
  }) + ' UTC';
}

function fmtDelay(s: number | null): string | null {
  if (s === null) return null;
  if (s < 60) return `${s}s after open`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s after open`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m after open`;
}

function explorerTx(hash: string): string {
  return `https://explorer.injective.network/transaction/${hash.replace(/^0x/i, '')}`;
}

function shortAddr(a: string): string {
  return a.length > 16 ? `${a.slice(0, 10)}…${a.slice(-5)}` : a;
}

// Compact "20s" / "3m 20s" / "1h 5m" form for tables and stat tiles.
function fmtDelayShort(s: number | null): string {
  if (s === null) return '—';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

export default function MyBuybackPage() {
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null); // null = checking

  // login state
  const [passphrase, setPassphrase] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  // view
  const [view, setView] = useState<View>('mine');

  // "my deposits" tool state
  const [wallet, setWallet] = useState('');
  const [result, setResult] = useState<MyBuyback | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "last round" global state (shared by the Last round + Shut out tabs)
  const [round, setRound] = useState<LastRound | null>(null);
  const [roundLoading, setRoundLoading] = useState(false);
  const [roundError, setRoundError] = useState<string | null>(null);

  // "shut out" check-a-wallet state
  const [checkAddr, setCheckAddr] = useState('');
  const [checkResult, setCheckResult] = useState<WalletStatus | null>(null);
  const [checkLoading, setCheckLoading] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  useEffect(() => {
    let saved = '';
    try { saved = localStorage.getItem(WALLET_KEY) ?? ''; } catch { /* storage blocked */ }
    fetch('/api/me/session')
      .then(r => r.json())
      .then(d => {
        setAuthed(Boolean(d?.authed));
        if (saved) setWallet(saved);
      })
      .catch(() => setAuthed(false));
  }, []);

  function login(e: React.FormEvent) {
    e.preventDefault();
    if (!passphrase) { setLoginError('Enter your passphrase.'); return; }
    setLoginError(null);
    setLoggingIn(true);
    fetch('/api/me/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passphrase }),
    })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) { setLoginError(d?.error ?? 'Login failed.'); return; }
        setPassphrase('');
        setAuthed(true);
      })
      .catch(() => setLoginError('Network error — try again.'))
      .finally(() => setLoggingIn(false));
  }

  function logout() {
    fetch('/api/me/logout', { method: 'POST' })
      .catch(() => {})
      .finally(() => { setAuthed(false); setResult(null); });
  }

  function lookup(e: React.FormEvent) {
    e.preventDefault();
    const addr = wallet.trim();
    if (!ADDR_RE.test(addr)) { setError('Enter a valid inj1… address.'); return; }
    setError(null);
    setLoading(true);
    setResult(null);
    try { localStorage.setItem(WALLET_KEY, addr); } catch { /* ignore */ }

    fetch('/api/me/buyback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: addr }),
    })
      .then(r => r.json().then(d => ({ ok: r.ok, status: r.status, d })))
      .then(({ ok, status, d }) => {
        if (status === 401) { setAuthed(false); return; }
        if (!ok) { setError(d?.error ?? 'Could not load your buyback data.'); return; }
        setResult(d.result as MyBuyback);
      })
      .catch(() => setError('Network error — check your connection and try again.'))
      .finally(() => setLoading(false));
  }

  function loadRound() {
    setRoundError(null);
    setRoundLoading(true);
    fetch('/api/me/buyback/round', { method: 'POST' })
      .then(r => r.json().then(d => ({ ok: r.ok, status: r.status, d })))
      .then(({ ok, status, d }) => {
        if (status === 401) { setAuthed(false); return; }
        if (!ok) { setRoundError(d?.error ?? 'Could not load the last round.'); return; }
        setRound(d.result as LastRound);
      })
      .catch(() => setRoundError('Network error — try again.'))
      .finally(() => setRoundLoading(false));
  }

  // Switch tabs; lazily load the shared round data the first time it's needed.
  function selectView(v: View) {
    setView(v);
    if ((v === 'round' || v === 'shutout') && !round && !roundLoading && !roundError) loadRound();
  }

  function checkWallet(e: React.FormEvent) {
    e.preventDefault();
    const addr = checkAddr.trim();
    if (!ADDR_RE.test(addr)) { setCheckError('Enter a valid inj1… address.'); return; }
    setCheckError(null);
    setCheckLoading(true);
    setCheckResult(null);
    fetch('/api/me/buyback/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: addr }),
    })
      .then(r => r.json().then(d => ({ ok: r.ok, status: r.status, d })))
      .then(({ ok, status, d }) => {
        if (status === 401) { setAuthed(false); return; }
        if (!ok) { setCheckError(d?.error ?? 'Could not check this wallet.'); return; }
        setCheckResult(d.result as WalletStatus);
      })
      .catch(() => setCheckError('Network error — try again.'))
      .finally(() => setCheckLoading(false));
  }

  // Jump to "my deposits" for a specific wallet (from the leaderboard).
  function inspectWallet(addr: string) {
    setWallet(addr);
    setView('mine');
    setError(null);
    setLoading(true);
    setResult(null);
    try { localStorage.setItem(WALLET_KEY, addr); } catch { /* ignore */ }
    fetch('/api/me/buyback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: addr }),
    })
      .then(r => r.json().then(d => ({ ok: r.ok, status: r.status, d })))
      .then(({ ok, status, d }) => {
        if (status === 401) { setAuthed(false); return; }
        if (!ok) { setError(d?.error ?? 'Could not load this wallet.'); return; }
        setResult(d.result as MyBuyback);
      })
      .catch(() => setError('Network error — try again.'))
      .finally(() => setLoading(false));
  }

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
        <Link href="/" style={{ textDecoration: 'none' }}>
          <div className="tx-logo">
            <Image src="/logo.svg" alt="Tx·Translator logo" width={28} height={28} priority />
            TX · TRANSLATOR
          </div>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          {authed && (
            <button
              onClick={logout}
              className="tx-footer"
              style={{ background: 'none', border: '1px solid var(--tx-border)', borderRadius: 7, padding: '0.28rem 0.6rem', cursor: 'pointer', color: MUTED }}
            >
              Sign out
            </button>
          )}
          <span className="tx-footer">Private</span>
          <button className="tx-version-btn" onClick={() => setChangelogOpen(true)}>
            {CURRENT_VERSION}
          </button>
        </div>
      </header>

      {changelogOpen && <Changelog onClose={() => setChangelogOpen(false)} />}

      <div style={{ width: '100%', maxWidth: 680, marginBottom: '1.25rem' }}>
        <Link href="/" className="tx-back-link">← Back to decoder</Link>
      </div>

      {/* Checking session */}
      {authed === null && (
        <section className="tx-hero">
          <div className="tx-spinner" style={{ margin: '2rem auto' }} />
        </section>
      )}

      {/* Locked — passphrase gate */}
      {authed === false && (
        <section className="tx-hero">
          <h1 className="tx-headline">
            Private <span>area</span>
          </h1>
          <p className="tx-subline">
            This page is for the owner only. Enter your passphrase to continue.
          </p>
          <form className="tx-search-wrap" onSubmit={login} noValidate>
            <div className="tx-search-bar">
              <input
                className="tx-input"
                type="password"
                autoComplete="current-password"
                placeholder="Passphrase"
                value={passphrase}
                onChange={e => setPassphrase(e.target.value)}
                disabled={loggingIn}
                aria-label="Owner passphrase"
              />
              <button type="submit" className="tx-btn" disabled={loggingIn} aria-busy={loggingIn}>
                {loggingIn ? (<><div className="tx-spinner" />Unlocking</>) : 'Unlock'}
              </button>
            </div>
          </form>
          {loginError && (
            <div className="tx-error-msg" style={{ marginTop: '0.75rem' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {loginError}
            </div>
          )}
        </section>
      )}

      {/* Unlocked — the tool */}
      {authed === true && (
        <>
          <div
            style={{
              width: '100%', maxWidth: 680, display: 'flex', gap: '0.4rem',
              marginBottom: '1.5rem', borderBottom: '1px solid var(--tx-border)',
            }}
          >
            {([['mine', 'My deposits'], ['round', 'Last round'], ['shutout', 'Shut out']] as Array<[View, string]>).map(([v, label]) => (
              <button
                key={v}
                onClick={() => selectView(v)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '0.55rem 0.4rem', marginBottom: -1,
                  fontSize: '0.82rem', fontWeight: 600,
                  color: view === v ? 'var(--tx-text)' : MUTED,
                  borderBottom: `2px solid ${view === v ? 'var(--tx-purple)' : 'transparent'}`,
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {view === 'mine' && (
          <>
          <section className="tx-hero" style={{ marginBottom: result || loading || error ? '2rem' : '0' }}>
            {!result && !loading && (
              <>
                <h1 className="tx-headline">
                  My <span>buyback</span> deposits
                </h1>
                <p className="tx-subline">
                  Every Community BuyBack round this wallet joined — the exact time each deposit
                  landed, how much, and whether rewards were claimed. On-chain, private to you.
                </p>
              </>
            )}
            <form className="tx-search-wrap" onSubmit={lookup} noValidate>
              <div className="tx-search-bar">
                <input
                  className="tx-input"
                  type="text"
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="inj1… your wallet"
                  value={wallet}
                  onChange={e => setWallet(e.target.value)}
                  disabled={loading}
                  aria-label="Wallet address"
                />
                <button type="submit" className="tx-btn" disabled={loading} aria-busy={loading}>
                  {loading ? (<><div className="tx-spinner" />Loading</>) : 'Load'}
                </button>
              </div>
            </form>
            {error && (
              <div className="tx-error-msg" style={{ marginTop: '0.75rem' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </div>
            )}
          </section>

          {result && (
            <section style={{ width: '100%', maxWidth: 680 }}>
              {/* Summary */}
              <div
                style={{
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: '0.6rem', marginBottom: '1.25rem',
                }}
              >
                <Stat label="Rounds joined" value={String(result.roundsCommitted)} />
                <Stat
                  label="Total committed"
                  value={`${fmtInj(result.totalDepositedInj)} INJ`}
                  sub={fmtUsd(result.totalDepositedUsd)}
                />
                <Stat
                  label="Rewards (priced)"
                  value={fmtUsd(result.totalRewardsKnownUsd) ?? '—'}
                  sub={result.rewardsHaveUnpriced ? '+ unpriced tokens' : undefined}
                />
                <Stat label="Unclaimed rounds" value={String(result.unclaimedRounds)} />
              </div>

              {result.deposits.length === 0 && (
                <div style={{ color: SOFT, fontSize: '0.88rem', padding: '1rem 0' }}>
                  This wallet was whitelisted but has no committed deposits on record.
                </div>
              )}

              {result.deposits.map((d) => {
                const usd = fmtUsd(d.depositUsd);
                const delay = fmtDelay(d.secondsAfterOpen);
                return (
                  <div
                    key={d.roundId}
                    style={{
                      background: 'rgba(167, 139, 250, 0.05)',
                      border: '1px solid var(--tx-border)',
                      borderLeft: '3px solid var(--tx-purple)',
                      borderRadius: 10, padding: '0.9rem 1.05rem', marginBottom: '0.7rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', marginBottom: '0.55rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--tx-text)' }}>
                        Round {d.roundId}
                      </span>
                      <span
                        style={{
                          fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.03em',
                          padding: '0.2rem 0.55rem', borderRadius: 999,
                          color: d.hasWithdrawn ? 'var(--tx-green)' : 'var(--tx-amber)',
                          background: d.hasWithdrawn ? 'rgba(14, 226, 155, 0.1)' : 'rgba(243, 164, 0, 0.1)',
                        }}
                      >
                        {d.hasWithdrawn ? 'Claimed' : 'Unclaimed'}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.86rem', color: 'var(--tx-text)', marginBottom: '0.3rem' }}>
                      {d.depositTime ? fmtUtc(d.depositTime) : <span style={{ color: MUTED }}>deposit time unavailable</span>}
                    </div>

                    {delay && (
                      <div style={{ marginBottom: '0.5rem' }}>
                        <span
                          style={{
                            fontSize: '0.72rem', fontWeight: 700, color: 'var(--tx-purple)',
                            background: 'rgba(167, 139, 250, 0.12)', borderRadius: 999, padding: '0.18rem 0.55rem',
                          }}
                        >
                          ⚡ {delay}
                        </span>
                      </div>
                    )}

                    <div style={{ fontSize: '0.82rem', color: SOFT }}>
                      Committed <strong style={{ color: 'var(--tx-text)' }}>{fmtInj(d.depositInj)} INJ</strong>
                      {usd && <span style={{ color: MUTED }}> · {usd}</span>}
                      <span style={{ color: MUTED }}> · cap {fmtInj(d.walletCapInj)} INJ</span>
                    </div>

                    {d.txHash && (
                      <a
                        href={explorerTx(d.txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.6rem',
                          fontSize: '0.74rem', fontWeight: 600, color: 'var(--tx-purple)', textDecoration: 'none',
                          border: '1px solid var(--tx-purple)', borderRadius: 7, padding: '0.28rem 0.6rem',
                        }}
                      >
                        Deposit tx <span aria-hidden>↗</span>
                      </a>
                    )}
                  </div>
                );
              })}
            </section>
          )}
          </>
          )}

          {view === 'round' && (
            <RoundView
              data={round}
              loading={roundLoading}
              error={roundError}
              onInspect={inspectWallet}
              onReload={loadRound}
            />
          )}

          {view === 'shutout' && (
            <ShutOutView
              data={round}
              loading={roundLoading}
              error={roundError}
              onReload={loadRound}
              checkAddr={checkAddr}
              setCheckAddr={setCheckAddr}
              onCheck={checkWallet}
              checkResult={checkResult}
              checkLoading={checkLoading}
              checkError={checkError}
            />
          )}
        </>
      )}

      <footer
        style={{
          marginTop: 'auto', padding: '2rem 0.75rem 1.5rem', display: 'flex',
          alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap',
          gap: '0.55rem 1rem', textAlign: 'center',
        }}
      >
        <span className="tx-footer">Made by S!G</span>
      </footer>
    </main>
  );
}

function RoundView({
  data, loading, error, onInspect, onReload,
}: {
  data: LastRound | null;
  loading: boolean;
  error: string | null;
  onInspect: (addr: string) => void;
  onReload: () => void;
}) {
  if (loading && !data) {
    return (
      <section className="tx-hero">
        <div className="tx-spinner" style={{ margin: '2rem auto' }} />
        <p className="tx-subline" style={{ textAlign: 'center' }}>
          Reading every deposit in the last round…
        </p>
      </section>
    );
  }
  if (error && !data) {
    return (
      <section style={{ width: '100%', maxWidth: 680 }}>
        <div className="tx-error-msg">{error}</div>
        <button className="tx-btn" style={{ marginTop: '1rem' }} onClick={onReload}>Retry</button>
      </section>
    );
  }
  if (!data) return null;

  const { round, stats, buckets, participants } = data;
  const statusColor =
    round.status === 'open' ? 'var(--tx-green)' : round.status === 'upcoming' ? 'var(--tx-amber)' : MUTED;
  const maxBucket = Math.max(1, ...buckets.map(b => b.count));

  return (
    <section style={{ width: '100%', maxWidth: 680 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.6rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <h1 className="tx-headline" style={{ fontSize: '1.6rem', margin: 0 }}>
          Round <span>{round.id}</span>
        </h1>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: statusColor }}>
          ● {round.status}
        </span>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.6rem', marginBottom: '1.25rem' }}>
        <Stat label="Wallets in" value={String(stats.uniqueWallets)} />
        <Stat label="Total committed" value={`${fmtInj(round.totalDepositInj)} INJ`} sub={`cap ${fmtInj(round.roundCapInj)}`} />
        <Stat label="Fastest" value={fmtDelayShort(stats.fastestSeconds)} sub="after open" />
        <Stat label="Median" value={fmtDelayShort(stats.medianSeconds)} sub="after open" />
        <Stat label="Last commit" value={fmtDelayShort(stats.fillSeconds)} sub="after open" />
        <Stat label="Wallet cap" value={`${fmtInj(round.walletCapInj)} INJ`} />
      </div>

      {/* Automation summary */}
      <div
        style={{
          background: 'rgba(246, 71, 114, 0.06)', border: '1px solid var(--tx-border)',
          borderLeft: '3px solid var(--tx-red)', borderRadius: 10,
          padding: '0.85rem 1rem', marginBottom: '1.25rem',
        }}
      >
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--tx-text)', marginBottom: '0.35rem' }}>
          🤖 {data.botSummary.flaggedCount} of {stats.uniqueWallets} deposits show automation signals
        </div>
        <div style={{ fontSize: '0.8rem', color: SOFT, lineHeight: 1.55 }}>
          {data.botSummary.scriptedPct}% landed in a shared gas-fleet (many wallets submitting with the
          exact same gas — a scripted tx-builder fingerprint).
          {data.botSummary.fleets.length > 0 && (
            <> Largest fleets:{' '}
              {data.botSummary.fleets.slice(0, 4).map((f, i) => (
                <span key={f.gas}>
                  {i > 0 ? ', ' : ''}<strong style={{ color: 'var(--tx-text)' }}>{f.count}</strong>@{Math.round(f.gas / 1000)}k
                </span>
              ))}.
            </>
          )}
        </div>
        <div style={{ fontSize: '0.72rem', color: MUTED, marginTop: '0.45rem', lineHeight: 1.5 }}>
          Signals from public on-chain data, not proof — a shared gas value can also mean a shared frontend.
          {data.botSummary.agesResolved < stats.uniqueWallets &&
            ` Wallet age resolved for ${data.botSummary.agesResolved}/${stats.uniqueWallets}.`}
        </div>
      </div>

      {/* Time-after-open histogram */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: MUTED, marginBottom: '0.6rem' }}>
          When they committed (time after open)
        </div>
        {buckets.map((b) => (
          <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
            <span style={{ width: 48, flex: '0 0 auto', fontSize: '0.74rem', color: SOFT, textAlign: 'right' }}>{b.label}</span>
            <div style={{ flex: 1, background: 'rgba(244, 241, 233, 0.05)', borderRadius: 5, height: 18, overflow: 'hidden' }}>
              <div style={{ width: `${(b.count / maxBucket) * 100}%`, height: '100%', background: 'var(--tx-purple)', borderRadius: 5, minWidth: b.count ? 2 : 0 }} />
            </div>
            <span style={{ width: 34, flex: '0 0 auto', fontSize: '0.74rem', color: MUTED, textAlign: 'left' }}>{b.count}</span>
          </div>
        ))}
      </div>

      {/* Leaderboard — fastest first */}
      <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: MUTED, marginBottom: '0.6rem' }}>
        All {participants.length} wallets · fastest first
      </div>
      <div style={{ maxHeight: 500, overflowY: 'auto', border: '1px solid var(--tx-border)', borderRadius: 10 }}>
        {participants.map((p) => (
          <div
            key={p.wallet}
            style={{
              padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--tx-border)',
              background: p.automationLikely ? 'rgba(246, 71, 114, 0.05)' : 'transparent',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', fontSize: '0.8rem' }}>
              <span style={{ width: 30, flex: '0 0 auto', color: MUTED, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {p.rank}
              </span>
              <button
                onClick={() => onInspect(p.wallet)}
                title="Inspect this wallet"
                style={{
                  flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--tx-text)', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.76rem',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {shortAddr(p.wallet)}
              </button>
              <span
                style={{
                  flex: '0 0 auto', fontSize: '0.72rem', fontWeight: 700, color: 'var(--tx-purple)',
                  background: 'rgba(167, 139, 250, 0.12)', borderRadius: 999, padding: '0.15rem 0.5rem',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                ⚡ {fmtDelayShort(p.secondsAfterOpen)}
              </span>
              <span style={{ flex: '0 0 auto', width: 70, textAlign: 'right', color: SOFT, fontVariantNumeric: 'tabular-nums' }}>
                {fmtInj(p.amountInj)}
              </span>
            </div>
            {p.signals.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.35rem', marginLeft: 'calc(30px + 0.55rem)' }}>
                {p.signals.map((s) => (
                  <span
                    key={s}
                    style={{
                      fontSize: '0.64rem', fontWeight: 600, color: p.automationLikely ? 'var(--tx-red)' : MUTED,
                      background: p.automationLikely ? 'rgba(246, 71, 114, 0.1)' : 'rgba(244, 241, 233, 0.05)',
                      borderRadius: 5, padding: '0.1rem 0.4rem',
                    }}
                  >
                    {s === 'gas-fleet' ? `gas-fleet ×${p.fleetSize}` : SIGNAL_LABEL[s] ?? s}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ marginTop: '0.75rem', fontSize: '0.72rem', color: MUTED, lineHeight: 1.5 }}>
        Tap a wallet to see its full deposit history. Times are each deposit&apos;s on-chain block
        timestamp. This lists every wallet with a direct join deposit — a few deposits routed through
        other contracts may not resolve to a single wallet, so the count can trail the round&apos;s total
        (shown above) slightly.
      </div>
    </section>
  );
}

function ShutOutView({
  data, loading, error, onReload,
  checkAddr, setCheckAddr, onCheck, checkResult, checkLoading, checkError,
}: {
  data: LastRound | null;
  loading: boolean;
  error: string | null;
  onReload: () => void;
  checkAddr: string;
  setCheckAddr: (v: string) => void;
  onCheck: (e: React.FormEvent) => void;
  checkResult: WalletStatus | null;
  checkLoading: boolean;
  checkError: string | null;
}) {
  if (loading && !data) {
    return (
      <section className="tx-hero">
        <div className="tx-spinner" style={{ margin: '2rem auto' }} />
        <p className="tx-subline" style={{ textAlign: 'center' }}>Counting whitelisted wallets that didn&apos;t get in…</p>
      </section>
    );
  }
  if (error && !data) {
    return (
      <section style={{ width: '100%', maxWidth: 680 }}>
        <div className="tx-error-msg">{error}</div>
        <button className="tx-btn" style={{ marginTop: '1rem' }} onClick={onReload}>Retry</button>
      </section>
    );
  }
  if (!data) return null;

  const { round, stats, shutOut } = data;
  const ratio = shutOut.gotIn > 0 ? (shutOut.count / shutOut.gotIn) : 0;
  const ratioLabel = ratio >= 1 ? `${ratio.toFixed(0)}×${shutOut.capped ? '+' : ''}` : '—';
  const countLabel = `${shutOut.count.toLocaleString('en-US')}${shutOut.capped ? '+' : ''}`;

  const CR = checkResult;
  const crMeta = CR && ({
    in: { color: 'var(--tx-green)', bg: 'rgba(14, 226, 155, 0.1)', label: 'Got in' },
    shut_out: { color: 'var(--tx-red)', bg: 'rgba(246, 71, 114, 0.1)', label: 'Shut out' },
    not_whitelisted: { color: MUTED, bg: 'rgba(244, 241, 233, 0.05)', label: 'Not whitelisted' },
    unknown: { color: MUTED, bg: 'rgba(244, 241, 233, 0.05)', label: 'Unknown' },
  } as const)[CR.status];

  return (
    <section style={{ width: '100%', maxWidth: 680 }}>
      <h1 className="tx-headline" style={{ fontSize: '1.6rem', marginTop: 0, marginBottom: '0.5rem' }}>
        Shut <span>out</span> · round {round.id}
      </h1>
      <p className="tx-subline" style={{ marginBottom: '1.25rem' }}>
        Whitelisted wallets that didn&apos;t secure a spot — the round filled in {fmtDelayShort(stats.fillSeconds)}.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.6rem', marginBottom: '1.25rem' }}>
        <Stat label="Shut out" value={countLabel} sub="whitelisted, no spot" />
        <Stat label="Got in" value={shutOut.gotIn.toLocaleString('en-US')} sub={`in ${fmtDelayShort(stats.fillSeconds)}`} />
        <Stat label="Oversubscribed" value={ratioLabel} sub="shut out : in" />
      </div>

      {/* Check a wallet */}
      <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: MUTED, marginBottom: '0.55rem' }}>
        Check a wallet in round {round.id}
      </div>
      <form className="tx-search-wrap" onSubmit={onCheck} noValidate style={{ marginBottom: '0.75rem' }}>
        <div className="tx-search-bar">
          <input
            className="tx-input"
            type="text"
            spellCheck={false}
            autoComplete="off"
            placeholder="inj1… any wallet"
            value={checkAddr}
            onChange={e => setCheckAddr(e.target.value)}
            disabled={checkLoading}
            aria-label="Wallet to check"
          />
          <button type="submit" className="tx-btn" disabled={checkLoading} aria-busy={checkLoading}>
            {checkLoading ? (<><div className="tx-spinner" />Checking</>) : 'Check'}
          </button>
        </div>
      </form>
      {checkError && <div className="tx-error-msg" style={{ marginBottom: '0.75rem' }}>{checkError}</div>}
      {CR && crMeta && (
        <div style={{ background: crMeta.bg, border: `1px solid ${crMeta.color}`, borderRadius: 10, padding: '0.85rem 1rem', marginBottom: '1.5rem' }}>
          <span style={{ fontSize: '0.66rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--tx-bg)', background: crMeta.color, borderRadius: 999, padding: '0.2rem 0.55rem' }}>
            {crMeta.label}
          </span>
          <div style={{ fontSize: '0.85rem', color: 'var(--tx-text)', marginTop: '0.5rem', lineHeight: 1.5 }}>
            {CR.status === 'in' && `Deposited ${CR.depositInj ?? '?'} INJ${CR.secondsAfterOpen !== null ? ` at +${fmtDelayShort(CR.secondsAfterOpen)} after open` : ''}.`}
            {CR.status === 'shut_out' && `Whitelisted for round ${CR.roundId} but no deposit landed — shut out.`}
            {CR.status === 'not_whitelisted' && `Not on the whitelist for round ${CR.roundId}.`}
            {CR.status === 'unknown' && `Couldn't determine this wallet's status this time.`}
          </div>
        </div>
      )}

      {/* Sample of shut-out addresses */}
      <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: MUTED, marginBottom: '0.55rem' }}>
        Sample · showing {shutOut.sample.length} of {countLabel}
      </div>
      <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid var(--tx-border)', borderRadius: 10 }}>
        {shutOut.sample.map((a) => (
          <div key={a} style={{ padding: '0.4rem 0.75rem', borderBottom: '1px solid var(--tx-border)', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.74rem', color: SOFT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {a}
          </div>
        ))}
      </div>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div
      style={{
        background: 'rgba(244, 241, 233, 0.03)', border: '1px solid var(--tx-border)',
        borderRadius: 10, padding: '0.75rem 0.85rem',
      }}
    >
      <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: MUTED, marginBottom: '0.3rem' }}>
        {label}
      </div>
      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--tx-text)' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: MUTED, marginTop: '0.15rem' }}>{sub}</div>}
    </div>
  );
}
