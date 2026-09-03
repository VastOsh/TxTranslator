'use client';

import { useState, useMemo, useEffect, Fragment } from 'react';
import Link from 'next/link';
import LensCrumb from '@/components/LensCrumb';
import Changelog from '@/components/Changelog';
import { CURRENT_VERSION } from '@/data/changelog';
import type { TokenCheck, Signal, SignalLevel, Verdict } from '@/lib/token/check';

const DETAIL_COLOR = 'rgba(236, 239, 245, 0.82)';

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
  unknown: { color: 'var(--tx-text-muted)', bg: 'rgba(236, 239, 245, 0.05)', label: 'Unknown' },
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

type Holders = NonNullable<TokenCheck['holders']>;

function shortHolder(a: string): string {
  return a.length > 14 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a;
}
function pctLabel(n: number): string {
  return (n >= 1 ? n.toFixed(1) : n.toFixed(2)).replace(/\.?0+$/, '') + '%';
}

interface Packed { address: string; pct: number; x: number; y: number; r: number; }

function packBubbles(items: Array<{ address: string; pct: number }>): { placed: Packed[]; vb: string } | null {
  if (!items.length) return null;
  const maxPct = items[0].pct || items.reduce((m, i) => Math.max(m, i.pct), 0) || 1;
  const MAXR = 54, MINR = 8;
  const placed: Packed[] = [];
  for (const it of items) {
    const r = Math.max(MINR, MAXR * Math.sqrt(Math.max(it.pct, 0.0001) / maxPct));
    if (!placed.length) { placed.push({ ...it, r, x: 0, y: 0 }); continue; }
    let done = false;
    for (let t = 1; t < 5000 && !done; t++) {
      const ang = t * 0.5, rad = t * 0.55;
      const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad;
      if (placed.every((p) => Math.hypot(p.x - x, p.y - y) >= p.r + r + 3)) {
        placed.push({ ...it, r, x, y }); done = true;
      }
    }
    if (!done) placed.push({ ...it, r, x: 0, y: 0 });
  }
  const pad = 6;
  const minX = Math.min(...placed.map((p) => p.x - p.r)) - pad;
  const minY = Math.min(...placed.map((p) => p.y - p.r)) - pad;
  const w = Math.max(...placed.map((p) => p.x + p.r)) + pad - minX;
  const hgt = Math.max(...placed.map((p) => p.y + p.r)) + pad - minY;
  return { placed, vb: `${minX} ${minY} ${w} ${hgt}` };
}

const LINK_COLOR = '#f0a020'; // amber — connected wallets (a signal, not a verdict)

function BubbleMap({
  items, edges = [], connected,
}: {
  items: Array<{ address: string; pct: number }>;
  edges?: Array<{ a: string; b: string }>;
  connected?: Set<string>;
}) {
  const pack = useMemo(() => packBubbles(items), [items]);
  if (!pack) return null;
  const pos = new Map(pack.placed.map((p) => [p.address, p]));
  const scale = pack.vb.split(' ').map(Number)[2] || 100; // viewbox width, for stroke sizing
  const lineW = Math.max(0.5, scale / 240);
  return (
    <div style={{ marginBottom: '0.85rem' }}>
      <svg viewBox={pack.vb} style={{ width: '100%', height: 'auto', maxHeight: 320, display: 'block' }} role="img" aria-label="Holder distribution bubble map">
        {edges.map((e, i) => {
          const a = pos.get(e.a), b = pos.get(e.b);
          if (!a || !b) return null;
          return <line key={`e${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={LINK_COLOR} strokeOpacity={0.55} strokeWidth={lineW} />;
        })}
        {pack.placed.map((p) => {
          const hot = p.pct >= 20;
          const isLinked = connected?.has(p.address);
          const fill = hot ? 'rgba(246, 71, 114, 0.9)' : 'var(--tx-purple)';
          const op = 0.45 + Math.min(0.5, p.r / 54 * 0.5);
          const stroke = isLinked ? LINK_COLOR : hot ? 'var(--tx-red)' : 'var(--tx-purple)';
          return (
            <g key={p.address}>
              <circle cx={p.x} cy={p.y} r={p.r} fill={fill} fillOpacity={op} stroke={stroke} strokeOpacity={isLinked ? 0.95 : 0.5} strokeWidth={isLinked ? lineW * 1.6 : 0.7}>
                <title>{`${p.address}\n${(p.pct >= 1 ? p.pct.toFixed(1) : p.pct.toFixed(2)).replace(/\.?0+$/, '')}% of supply${isLinked ? '\n⚠ shares a funding wallet with other holders' : ''}`}</title>
              </circle>
              {p.r >= 17 && (
                <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" fontSize={Math.min(p.r * 0.5, 13)} fill="var(--tx-bg)" fontWeight={700} style={{ pointerEvents: 'none' }}>
                  {(p.pct >= 1 ? p.pct.toFixed(0) : p.pct.toFixed(1)).replace(/\.?0+$/, '')}%
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function HoldersCard({ h }: { h: Holders }) {
  const max = Math.max(...h.rows.map(r => r.pct), 0.0001);
  const muted = 'rgba(236, 239, 245, 0.55)';
  const connectedSet = useMemo(() => {
    const s = new Set<string>();
    for (const e of h.edges) { s.add(e.a); s.add(e.b); }
    return s;
  }, [h.edges]);
  return (
    <div
      style={{
        background: 'rgba(236, 239, 245, 0.03)', border: '1px solid var(--tx-border)',
        borderRadius: 10, padding: '0.9rem 1rem', marginBottom: '0.6rem',
      }}
    >
      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--tx-text)', marginBottom: '0.2rem' }}>
        Holders
      </div>
      <div style={{ fontSize: '0.78rem', color: DETAIL_COLOR, marginBottom: '0.75rem', lineHeight: 1.5 }}>
        {h.totalHolders.toLocaleString()} addresses · {h.userHolders.toLocaleString()} real wallets ·
        top real holder {pctLabel(h.topRealPct)}, top 10 {pctLabel(h.top10RealPct)} (escrow &amp; pools excluded)
      </div>
      {h.bubble.length >= 2 && (
        <>
          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: muted, marginBottom: '0.5rem' }}>
            Real-holder map · {h.bubble.length} wallet{h.bubble.length === 1 ? '' : 's'} (escrow &amp; pools excluded)
          </div>
          <BubbleMap items={h.bubble} edges={h.edges} connected={connectedSet} />
          {connectedSet.size > 0 && (
            <div style={{ fontSize: '0.68rem', color: muted, marginTop: '-0.4rem', marginBottom: '0.7rem', lineHeight: 1.5 }}>
              <span style={{ color: LINK_COLOR, fontWeight: 700 }}>Amber</span> links wallets first funded by the same source —
              possibly one entity across several addresses, possibly a shared exchange. A signal, not proof.
            </div>
          )}
        </>
      )}
      {h.rows.map((r) => (
        <div key={r.address} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
          <span
            style={{
              flex: '0 0 auto', width: 118, fontFamily: 'var(--font-mono, monospace)', fontSize: '0.72rem',
              color: r.isProtocol ? muted : 'var(--tx-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {shortHolder(r.address)}
          </span>
          <div style={{ flex: 1, background: 'rgba(236, 239, 245, 0.05)', borderRadius: 4, height: 14, overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.max(2, (r.pct / max) * 100)}%`, height: '100%', borderRadius: 4,
                background: r.isProtocol ? 'rgba(167, 139, 250, 0.35)' : 'var(--tx-purple)',
              }}
            />
          </div>
          {r.isProtocol && r.label && (
            <span style={{ flex: '0 0 auto', fontSize: '0.62rem', color: muted, fontWeight: 600 }}>{r.label}</span>
          )}
          <span style={{ flex: '0 0 auto', width: 52, textAlign: 'right', fontSize: '0.72rem', color: DETAIL_COLOR, fontVariantNumeric: 'tabular-nums' }}>
            {pctLabel(r.pct)}
          </span>
        </div>
      ))}
      <div style={{ fontSize: '0.68rem', color: muted, marginTop: '0.6rem', lineHeight: 1.5 }}>
        Holder data from the launchpad. Escrow and pool addresses are labeled and left out of the concentration figures above.
      </div>
    </div>
  );
}

type SellImpact = NonNullable<Holders['sellImpact']>;

function fmtInjNum(n: number): string {
  if (n >= 1000) return Math.round(n).toLocaleString('en-US');
  if (n >= 1) return n.toFixed(2).replace(/\.?0+$/, '');
  if (n >= 0.0001) return n.toFixed(4).replace(/\.?0+$/, '');
  return n > 0 ? n.toExponential(1) : '0';
}
function fmtTok(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(/\.?0+$/, '')}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.?0+$/, '')}K`;
  return Math.round(n).toLocaleString('en-US');
}
function impactColor(pct: number): string {
  return pct >= 50 ? 'var(--tx-red)' : pct >= 20 ? '#f0a020' : 'var(--tx-text)';
}

function ImpactCard({ si }: { si: SellImpact }) {
  const muted = 'rgba(236, 239, 245, 0.55)';
  return (
    <div
      style={{
        background: 'rgba(236, 239, 245, 0.03)', border: '1px solid var(--tx-border)',
        borderRadius: 10, padding: '0.9rem 1rem', marginBottom: '0.6rem',
      }}
    >
      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--tx-text)', marginBottom: '0.2rem' }}>
        Sell impact
      </div>
      <div style={{ fontSize: '0.78rem', color: DETAIL_COLOR, marginBottom: '0.75rem', lineHeight: 1.5 }}>
        Spot {fmtInjNum(si.spotPriceInj)} INJ/token · {fmtTok(si.circulatingTokens)} circulating ·
        ~{fmtInjNum(si.curveInjLiquidity)} INJ of real liquidity in the curve
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0.35rem 0.9rem', alignItems: 'center' }}>
        <span style={{ fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: muted }}>If they sell</span>
        <span style={{ fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: muted, textAlign: 'right' }}>Price impact</span>
        <span style={{ fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: muted, textAlign: 'right' }}>Receives</span>
        {si.rows.map((r) => (
          <Fragment key={r.label}>
            <span style={{ fontSize: '0.74rem', color: 'var(--tx-text)' }}>
              {r.label}
              <span style={{ color: muted }}> · {fmtTok(r.tokens)} ({pctLabel(r.pctCirculating)})</span>
            </span>
            <span style={{ fontSize: '0.76rem', fontWeight: 700, textAlign: 'right', color: impactColor(r.priceImpactPct), fontVariantNumeric: 'tabular-nums' }}>
              −{pctLabel(r.priceImpactPct)}
            </span>
            <span style={{ fontSize: '0.74rem', textAlign: 'right', color: DETAIL_COLOR, fontVariantNumeric: 'tabular-nums' }}>
              {fmtInjNum(r.injReceived)} INJ
            </span>
          </Fragment>
        ))}
      </div>
      <div style={{ fontSize: '0.68rem', color: muted, marginTop: '0.7rem', lineHeight: 1.5 }}>
        Exact figures from the bonding-curve reserves (constant-product, 1% fee). “Circulating” is the supply already
        sold out of the curve; the rest is unsold reserve. Once the token graduates to a live market this no longer applies.
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

  function runCheck(q: string) {
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

  function check(e: React.FormEvent) {
    e.preventDefault();
    runCheck(value.trim());
  }

  // Deep-link support: /token?q=<denom|symbol> (e.g. from the Renzu hub) —
  // prefill the input and check on load. Read the URL directly to avoid the
  // useSearchParams Suspense requirement; defer the state updates out of the
  // effect body so they don't cascade synchronously.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q')?.trim();
    if (!q) return;
    const t = setTimeout(() => { setValue(q); runCheck(q); }, 0);
    return () => clearTimeout(t);
  }, []);

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
        <LensCrumb name="Token Safety" accent="#F0B24A" />
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
          {result.holders && <HoldersCard h={result.holders} />}
          {result.holders?.sellImpact && <ImpactCard si={result.holders.sellImpact} />}
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
