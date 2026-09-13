'use client';

import { useEffect, useMemo, useState } from 'react';
import LensCrumb from '@/components/LensCrumb';
import LensCursor from '@/components/LensCursor';
import LensAurora from '@/components/LensAurora';
import BackToRenzu from '@/components/BackToRenzu';
import Changelog from '@/components/Changelog';
import { CURRENT_VERSION } from '@/data/changelog';

const ACCENT = '#F0B24A'; // Markets lens colour

type Sort = 'oi' | 'funding' | 'skew';

interface MarketRow {
  marketId: string;
  ticker: string;
  isTradFi: boolean;
  hourlyRatePct: number | null;
  fundingAprPct: number | null;
  nextFundingTs: number | null;
  maxLeverage: number | null;
  markPrice: number | null;
  oiUsd: number | null;
  skewLongPct: number | null;
  positionCount: number | null;
  oiTruncated: boolean;
}
interface MarketsResp { asOf: number; count: number; markets: MarketRow[] }

const SORTS: Array<{ id: Sort; label: string }> = [
  { id: 'oi', label: 'Open interest' },
  { id: 'funding', label: 'Funding' },
  { id: 'skew', label: 'Skew' },
];

function fmtUsd(n: number | null): string {
  if (n == null) return '·';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
function fmtPrice(n: number | null): string {
  if (n == null) return '·';
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 1) return n.toFixed(2);
  return n.toPrecision(4);
}
function fmtPct(n: number | null, digits = 4): string {
  if (n == null) return '·';
  const s = n > 0 ? '+' : '';
  return `${s}${n.toFixed(digits)}%`;
}
function agoLabel(ms: number): string {
  if (!ms) return 'no snapshot yet';
  const h = Math.round((Date.now() - ms) / 3_600_000);
  if (h < 1) return 'as of just now';
  if (h < 24) return `as of ${h}h ago`;
  return `as of ${Math.round(h / 24)}d ago`;
}

export default function PerpsPage() {
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [sort, setSort] = useState<Sort>('oi');
  const [data, setData] = useState<MarketsResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/markets')
      .then((res) => res.json().then((d) => ({ ok: res.ok, d })))
      .then(({ ok, d }) => {
        if (cancelled) return;
        if (!ok) setError(d.error ?? 'Could not load markets.');
        else { setData(d as MarketsResp); setError(null); }
      })
      .catch(() => { if (!cancelled) setError('Network error, check your connection and try again.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(() => {
    const m = data?.markets ?? [];
    const s = [...m];
    if (sort === 'oi') s.sort((a, b) => (b.oiUsd ?? -1) - (a.oiUsd ?? -1));
    else if (sort === 'funding') s.sort((a, b) => Math.abs(b.hourlyRatePct ?? 0) - Math.abs(a.hourlyRatePct ?? 0));
    else s.sort((a, b) => Math.abs((b.skewLongPct ?? 50) - 50) - Math.abs((a.skewLongPct ?? 50) - 50));
    return s;
  }, [data, sort]);

  return (
    <main className="tx-main">
      <LensCursor />
      <LensAurora />

      <header className="tx-page-header" style={{ width: '100%', maxWidth: 920, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 0', borderBottom: '1px solid var(--tx-border)', marginBottom: '2rem' }}>
        <LensCrumb name="Perp Markets" accent={ACCENT} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <span className="tx-footer">Injective Mainnet</span>
          <button className="tx-version-btn" onClick={() => setChangelogOpen(true)}>{CURRENT_VERSION}</button>
        </div>
      </header>

      {changelogOpen && <Changelog onClose={() => setChangelogOpen(false)} />}

      <div style={{ width: '100%', maxWidth: 920, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <BackToRenzu />
        <span className="tx-footer" style={{ opacity: 0.7 }}>
          {data ? `${data.count} perps · OI ${agoLabel(data.asOf)}` : ''}
        </span>
      </div>

      <div style={{ width: '100%', maxWidth: 920, marginBottom: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.55rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--tx-text)' }}>
          Perp market intelligence
        </h1>
        <p style={{ margin: '0.5rem 0 0', color: 'var(--tx-text-muted)', fontSize: '0.9rem', maxWidth: '64ch', lineHeight: 1.55 }}>
          Every active perpetual on Injective: the last realized hourly funding rate and its annualized
          pace, open interest and long/short skew, plus max leverage. Funding reads live from the chain,
          open interest from a recent position snapshot.
        </p>
      </div>

      <div style={{ width: '100%', maxWidth: 920, display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <span className="tx-footer" style={{ fontSize: '0.72rem', opacity: 0.7 }}>Sort</span>
        <div style={{ display: 'inline-flex', border: '1px solid var(--tx-border)', borderRadius: 8, overflow: 'hidden' }}>
          {SORTS.map((o) => (
            <button key={o.id} onClick={() => setSort(o.id)} style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', border: 'none', background: sort === o.id ? 'rgba(240,178,74,0.16)' : 'transparent', color: sort === o.id ? ACCENT : 'var(--tx-text-muted)' }}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: 920 }}>
        {error && (
          <div className="tx-error-msg">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </div>
        )}

        {!error && (
          <div style={{ overflowX: 'auto', border: '1px solid var(--tx-border)', borderRadius: 12, background: 'rgba(20,22,29,0.5)' }}>
            <div style={{ minWidth: 720 }}>
              <div style={{ ...rowGrid, padding: '0.7rem 1rem', borderBottom: '1px solid var(--tx-border)', color: 'var(--tx-text-muted)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-mono)' }}>
                <span>Market</span>
                <span style={{ textAlign: 'right' }}>Mark</span>
                <span style={{ textAlign: 'right' }}>Funding /h</span>
                <span style={{ textAlign: 'right' }}>APR</span>
                <span style={{ textAlign: 'right' }}>OI</span>
                <span>Long / short</span>
                <span style={{ textAlign: 'right' }}>Max lev</span>
              </div>

              {loading && rows.length === 0 && (
                <div style={{ padding: '2rem 1rem' }}>
                  {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="tx-skel" style={{ height: 18, width: '100%', marginBottom: 12, opacity: 1 - i * 0.1 }} />
                  ))}
                </div>
              )}

              {!loading && rows.length === 0 && (
                <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--tx-text-muted)', fontSize: '0.9rem' }}>
                  No market data available right now.
                </div>
              )}

              {rows.map((r, i) => (
                <div key={r.marketId} style={{ ...rowGrid, padding: '0.65rem 1rem', borderBottom: i === rows.length - 1 ? 'none' : '1px solid rgba(53,201,190,0.07)', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--tx-text)' }}>
                    {r.ticker.replace(' PERP', '')}
                    {r.isTradFi && <span style={{ fontSize: '0.6rem', color: ACCENT, border: `1px solid ${ACCENT}55`, borderRadius: 4, padding: '1px 5px' }}>RWA</span>}
                  </span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--tx-text-muted)' }}>{fmtPrice(r.markPrice)}</span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: (r.hourlyRatePct ?? 0) >= 0 ? 'var(--tx-cyan)' : '#E77BA6' }}>{fmtPct(r.hourlyRatePct)}</span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--tx-text-muted)' }}>{fmtPct(r.fundingAprPct, 1)}</span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--tx-text-muted)' }}>
                    {fmtUsd(r.oiUsd)}{r.oiTruncated && <span title="position scan truncated" style={{ color: ACCENT }}>*</span>}
                  </span>
                  <SkewBar pct={r.skewLongPct} />
                  <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--tx-text-dim)' }}>{r.maxLeverage ? `${Math.round(r.maxLeverage)}x` : '·'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p style={{ margin: '1rem 0 0', color: 'var(--tx-text-dim)', fontSize: '0.75rem', lineHeight: 1.55 }}>
          Positive funding means longs pay shorts. Open interest and skew are the one-sided notional of every
          open position at the current mark, read from the latest snapshot. A * marks a market whose position
          scan was capped.
        </p>
      </div>

      <footer style={{ marginTop: 'auto', padding: '2rem 0 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <span className="tx-footer">Made by S!G</span>
        <span className="tx-footer" style={{ opacity: 0.4 }}>·</span>
        <a href="https://x.com/TxTranslator" target="_blank" rel="noopener noreferrer" className="tx-footer" style={{ textDecoration: 'none', opacity: 0.7 }}>
          Whale feed @TxTranslator ↗
        </a>
        <span className="tx-footer" style={{ opacity: 0.4 }}>·</span>
        <span className="tx-footer">Injective</span>
      </footer>
    </main>
  );
}

const rowGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0,1.3fr) 5rem 5rem 4.5rem 5rem minmax(90px,1.1fr) 3.5rem',
  gap: '0.75rem',
};

function SkewBar({ pct }: { pct: number | null }) {
  if (pct == null) return <span style={{ color: 'var(--tx-text-dim)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>·</span>;
  const long = Math.max(0, Math.min(100, pct));
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ flex: 1, height: 6, borderRadius: 3, overflow: 'hidden', display: 'flex', background: '#E77BA6' }}>
        <span style={{ width: `${long}%`, background: 'var(--tx-cyan)' }} />
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--tx-text-muted)', minWidth: 32, textAlign: 'right' }}>{long.toFixed(0)}%</span>
    </span>
  );
}
