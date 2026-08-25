'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Changelog from '@/components/Changelog';
import { CURRENT_VERSION } from '@/data/changelog';
import type { TokenCheck, Signal, SignalLevel, Verdict } from '@/lib/token/check';

const DETAIL_COLOR = 'rgba(244, 241, 233, 0.82)';

const LEVEL_STYLE: Record<SignalLevel, { color: string; bg: string; icon: string }> = {
  ok: { color: 'var(--tx-green)', bg: 'rgba(14, 226, 155, 0.08)', icon: '✓' },
  danger: { color: 'var(--tx-red)', bg: 'rgba(246, 71, 114, 0.11)', icon: '!' },
  warn: { color: 'var(--tx-amber)', bg: 'rgba(243, 164, 0, 0.11)', icon: '!' },
  info: { color: 'var(--tx-purple)', bg: 'rgba(167, 139, 250, 0.06)', icon: 'i' },
};

const VERDICT_META: Record<Verdict, { color: string; bg: string; label: string }> = {
  verified: { color: 'var(--tx-green)', bg: 'rgba(14, 226, 155, 0.11)', label: 'Verified' },
  impersonation: { color: 'var(--tx-red)', bg: 'rgba(246, 71, 114, 0.13)', label: 'Impersonation risk' },
  lookalike: { color: 'var(--tx-amber)', bg: 'rgba(243, 164, 0, 0.13)', label: 'Look-alike' },
  unverified: { color: 'var(--tx-purple)', bg: 'rgba(167, 139, 250, 0.10)', label: 'Unverified' },
  unknown: { color: 'var(--tx-text-muted)', bg: 'rgba(244, 241, 233, 0.05)', label: 'Unknown' },
};

function SignalCard({ s }: { s: Signal }) {
  const st = LEVEL_STYLE[s.level];
  const titleColor = s.level === 'info' ? 'var(--tx-text)' : st.color;
  return (
    <div
      style={{
        display: 'flex',
        gap: '0.7rem',
        background: st.bg,
        border: '1px solid var(--tx-border)',
        borderLeft: `3px solid ${st.color}`,
        borderRadius: 10,
        padding: '0.85rem 1rem',
        marginBottom: '0.6rem',
      }}
    >
      <span
        aria-hidden
        style={{
          flex: '0 0 auto', width: 20, height: 20, marginTop: 1,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 999, background: st.color, color: 'var(--tx-bg)',
          fontSize: '0.72rem', fontWeight: 800, lineHeight: 1,
        }}
      >
        {st.icon}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: titleColor, marginBottom: '0.3rem' }}>
          {s.title}
        </div>
        <div style={{ fontSize: '0.82rem', color: DETAIL_COLOR, lineHeight: 1.55, wordBreak: 'break-word' }}>
          {s.detail}
        </div>
        {s.link && (
          <a
            href={s.link.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.6rem',
              fontSize: '0.76rem', fontWeight: 600, color: st.color, textDecoration: 'none',
              border: `1px solid ${st.color}`, borderRadius: 7, padding: '0.3rem 0.65rem',
            }}
          >
            {s.link.label} <span aria-hidden>↗</span>
          </a>
        )}
      </div>
    </div>
  );
}

export default function TokenPage() {
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [value, setValue] = useState('');
  const [result, setResult] = useState<TokenCheck | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function check(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q) {
      setError('Enter a token denom or symbol.');
      return;
    }
    setError(null);
    setLoading(true);
    setResult(null);

    fetch('/api/token/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q }),
    })
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) setError(data.error ?? 'Could not check this token.');
        else setResult(data.result as TokenCheck);
      })
      .catch(() => setError('Network error — check your connection and try again.'))
      .finally(() => setLoading(false));
  }

  const vm = result ? VERDICT_META[result.verdict] : null;

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

      <section className="tx-hero" style={{ marginBottom: result || loading || error ? '2rem' : '0' }}>
        {!result && !loading && (
          <>
            <h1 className="tx-headline">
              Token <span>safety</span> check
            </h1>
            <p className="tx-subline">
              Paste a token’s denom (or a symbol) — see if it’s the real one or an impostor copying a
              trusted name, checked against Injective’s verified lists and on-chain data
            </p>
          </>
        )}

        <form className="tx-search-wrap" onSubmit={check} noValidate>
          <div className="tx-search-bar">
            <input
              className="tx-input"
              type="text"
              spellCheck={false}
              autoComplete="off"
              placeholder="factory/inj1… /  peggy0x… /  or a symbol like PYTH"
              value={value}
              onChange={e => setValue(e.target.value)}
              disabled={loading}
              aria-label="Token denom or symbol"
            />
            <button type="submit" className="tx-btn" disabled={loading} aria-busy={loading}>
              {loading ? (<><div className="tx-spinner" />Checking</>) : 'Check'}
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

      {result && vm && (
        <section style={{ width: '100%', maxWidth: 680 }}>
          <div
            style={{
              border: `1px solid ${vm.color}`,
              background: vm.bg,
              borderRadius: 12,
              padding: '1rem 1.15rem',
              marginBottom: '1.1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span
                style={{
                  fontSize: '0.64rem', fontWeight: 800, letterSpacing: '0.07em',
                  textTransform: 'uppercase', color: 'var(--tx-bg)',
                  background: vm.color, borderRadius: 999, padding: '0.22rem 0.62rem',
                }}
              >
                {vm.label}
              </span>
            </div>
            <div style={{ fontSize: '0.98rem', fontWeight: 600, color: 'var(--tx-text)', lineHeight: 1.5 }}>
              {result.headline}
            </div>
          </div>

          {result.signals.map((s, i) => <SignalCard key={i} s={s} />)}
        </section>
      )}

      <footer
        style={{
          marginTop: 'auto', padding: '2rem 0.75rem 1.5rem', display: 'flex',
          alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap',
          gap: '0.55rem 1rem', textAlign: 'center',
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
