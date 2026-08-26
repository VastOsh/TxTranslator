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

export default function MyBuybackPage() {
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null); // null = checking

  // login state
  const [passphrase, setPassphrase] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  // tool state
  const [wallet, setWallet] = useState('');
  const [result, setResult] = useState<MyBuyback | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
