'use client';

import { useEffect, useMemo, useState } from 'react';
import LensCrumb from '@/components/LensCrumb';
import LensCursor from '@/components/LensCursor';
import LensAurora from '@/components/LensAurora';
import BackToRenzu from '@/components/BackToRenzu';
import Changelog from '@/components/Changelog';
import { CURRENT_VERSION } from '@/data/changelog';

const ACCENT = '#F0B24A'; // Markets lens colour
const LONG = 'var(--tx-cyan)';
const SHORT = '#E77BA6';

type Sort = 'notional' | 'pnl' | 'liq';

interface Position {
  address: string;
  marketId: string;
  ticker: string;
  direction: 'long' | 'short';
  notionalUsd: number;
  entryPrice: number;
  markPrice: number;
  liqPrice: number | null;
  liqDistancePct: number | null;
  uPnlUsd: number;
  leverage: number | null;
  isTradFi: boolean;
}
interface MarketAgg {
  marketId: string;
  ticker: string;
  longNotionalUsd: number;
  shortNotionalUsd: number;
  netNotionalUsd: number;
  longTraders: number;
  shortTraders: number;
  isTradFi: boolean;
}
interface Snapshot {
  asOf: number;
  tradersScanned: number;
  tradersWithPositions: number;
  positionCount: number;
  markets: MarketAgg[];
  positions: Position[];
}

function fmtUsd(n: number): string {
  const s = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(1)}K`;
  return `${s}$${a.toFixed(0)}`;
}
function shortAddr(a: string): string {
  return `${a.slice(0, 9)}…${a.slice(-5)}`;
}
function agoLabel(ms: number): string {
  if (!ms) return 'no snapshot yet';
  const m = Math.round((Date.now() - ms) / 60_000);
  if (m < 1) return 'as of just now';
  if (m < 60) return `as of ${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `as of ${h}h ago`;
  return `as of ${Math.round(h / 24)}d ago`;
}

export default function SmartPositionsPage() {
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [sort, setSort] = useState<Sort>('notional');
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/smart-positions')
      .then((res) => res.json().then((d) => ({ ok: res.ok, d })))
      .then(({ ok, d }) => {
        if (cancelled) return;
        if (!ok) setError(d.error ?? 'Could not load smart money positions.');
        else { setData(d as Snapshot); setError(null); }
      })
      .catch(() => { if (!cancelled) setError('Network error, check your connection and try again.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const positions = useMemo(() => {
    const p = [...(data?.positions ?? [])];
    if (sort === 'pnl') p.sort((a, b) => b.uPnlUsd - a.uPnlUsd);
    else if (sort === 'liq') p.sort((a, b) => (a.liqDistancePct ?? 1e9) - (b.liqDistancePct ?? 1e9));
    else p.sort((a, b) => b.notionalUsd - a.notionalUsd);
    return p.slice(0, 100);
  }, [data, sort]);

  const empty = data && data.positionCount === 0;

  return (
    <main className="tx-main">
      <LensCursor />
      <LensAurora />

      <header className="tx-page-header" style={{ width: '100%', maxWidth: 920, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 0', borderBottom: '1px solid var(--tx-border)', marginBottom: '2rem' }}>
        <LensCrumb name="Smart Money Positions" accent={ACCENT} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <span className="tx-footer">Injective Mainnet</span>
          <button className="tx-version-btn" onClick={() => setChangelogOpen(true)}>{CURRENT_VERSION}</button>
        </div>
      </header>

      {changelogOpen && <Changelog onClose={() => setChangelogOpen(false)} />}

      <div style={{ width: '100%', maxWidth: 920, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <BackToRenzu />
        <span className="tx-footer" style={{ opacity: 0.7 }}>
          {data && data.positionCount > 0 ? `${data.tradersWithPositions} traders · ${data.positionCount} positions · ${agoLabel(data.asOf)}` : ''}
        </span>
      </div>

      <div style={{ width: '100%', maxWidth: 920, marginBottom: '1.25rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.55rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--tx-text)' }}>
          What smart money is holding
        </h1>
        <p style={{ margin: '0.5rem 0 0', color: 'var(--tx-text-muted)', fontSize: '0.9rem', maxWidth: '68ch', lineHeight: 1.55 }}>
          The live open perpetual positions of the top wallets by realized net PnL over the last 30 days,
          read straight from the exchange module. Every figure is on-chain: entry, mark, the chain{'’'}s own
          liquidation price, and unrealized PnL. It is a snapshot of proven-profitable wallets, not a
          recommendation.
        </p>
      </div>

      {error && (
        <div style={{ width: '100%', maxWidth: 920 }}>
          <div className="tx-error-msg">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </div>
        </div>
      )}

      {loading && !data && (
        <div style={{ width: '100%', maxWidth: 920, padding: '2rem 0' }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="tx-skel" style={{ height: 20, width: '100%', marginBottom: 12, opacity: 1 - i * 0.12 }} />
          ))}
        </div>
      )}

      {empty && !loading && (
        <div style={{ width: '100%', maxWidth: 920, padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--tx-text-muted)', fontSize: '0.9rem', border: '1px solid var(--tx-border)', borderRadius: 12 }}>
          The snapshot has not been built yet, or none of the top traders hold an open position right now.
        </div>
      )}

      {/* ── Section A: market positioning ── */}
      {data && data.markets.length > 0 && (
        <div style={{ width: '100%', maxWidth: 920, marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--tx-text)', margin: '0 0 0.75rem' }}>
            Where smart money leans, by market
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {data.markets.slice(0, 12).map((m) => {
              const gross = m.longNotionalUsd + m.shortNotionalUsd;
              const longPct = gross > 0 ? (m.longNotionalUsd / gross) * 100 : 50;
              const net = m.netNotionalUsd;
              return (
                <div key={m.marketId} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 2fr auto', gap: '0.85rem', alignItems: 'center', border: '1px solid var(--tx-border)', borderRadius: 8, padding: '0.55rem 0.8rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--tx-text)' }}>
                    {m.ticker.replace(' PERP', '')}
                    {m.isTradFi && <span style={{ fontSize: '0.55rem', color: ACCENT, border: `1px solid ${ACCENT}55`, borderRadius: 4, padding: '1px 4px' }}>RWA</span>}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ flex: 1, height: 7, borderRadius: 4, overflow: 'hidden', display: 'flex', background: SHORT }}>
                      <span style={{ width: `${longPct}%`, background: LONG }} />
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--tx-text-muted)', minWidth: 118, textAlign: 'right' }}>
                      {m.longTraders}L / {m.shortTraders}S
                    </span>
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700, textAlign: 'right', minWidth: 96, color: net >= 0 ? LONG : SHORT }}>
                    {net >= 0 ? 'net long ' : 'net short '}{fmtUsd(Math.abs(net))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Section B: positions table ── */}
      {data && data.positions.length > 0 && (
        <div style={{ width: '100%', maxWidth: 920 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--tx-text)', margin: 0 }}>Open positions</h2>
            <div style={{ display: 'inline-flex', border: '1px solid var(--tx-border)', borderRadius: 8, overflow: 'hidden' }}>
              {([['notional', 'Biggest'], ['pnl', 'Unrealized PnL'], ['liq', 'Closest to liq']] as Array<[Sort, string]>).map(([id, label]) => (
                <button key={id} onClick={() => setSort(id)} style={{ padding: '0.35rem 0.7rem', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer', border: 'none', background: sort === id ? 'rgba(240,178,74,0.16)' : 'transparent', color: sort === id ? ACCENT : 'var(--tx-text-muted)' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid var(--tx-border)', borderRadius: 12, background: 'rgba(20,22,29,0.5)' }}>
            <div style={{ minWidth: 760 }}>
              <div style={{ ...rowGrid, padding: '0.7rem 1rem', borderBottom: '1px solid var(--tx-border)', color: 'var(--tx-text-muted)', fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-mono)' }}>
                <span>Trader</span>
                <span>Market</span>
                <span style={{ textAlign: 'right' }}>Notional</span>
                <span style={{ textAlign: 'right' }}>UPnL</span>
                <span style={{ textAlign: 'right' }}>Lev</span>
                <span style={{ textAlign: 'right' }}>To liq</span>
              </div>
              {positions.map((p, i) => (
                <div key={`${p.address}-${p.marketId}-${i}`} style={{ ...rowGrid, padding: '0.6rem 1rem', borderBottom: i === positions.length - 1 ? 'none' : '1px solid rgba(240,178,74,0.06)', alignItems: 'center' }}>
                  <a href={`/pnl/${p.address}`} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: 'var(--tx-purple)', textDecoration: 'none' }}>
                    {shortAddr(p.address)}
                  </a>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--tx-text)' }}>
                    <span style={{ fontSize: '0.6rem', fontWeight: 800, color: p.direction === 'long' ? LONG : SHORT, textTransform: 'uppercase' }}>
                      {p.direction === 'long' ? 'L' : 'S'}
                    </span>
                    {p.ticker.replace(' PERP', '')}
                  </span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--tx-text)' }}>{fmtUsd(p.notionalUsd)}</span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: p.uPnlUsd >= 0 ? '#54D08A' : 'var(--tx-red)' }}>
                    {p.uPnlUsd >= 0 ? '+' : ''}{fmtUsd(p.uPnlUsd)}
                  </span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: 'var(--tx-text-muted)' }}>{p.leverage ? `${p.leverage.toFixed(1)}x` : '·'}</span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: p.liqDistancePct != null && p.liqDistancePct < 10 ? ACCENT : 'var(--tx-text-dim)' }}>
                    {p.liqDistancePct != null ? `${p.liqDistancePct.toFixed(0)}%` : '·'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <p style={{ margin: '1rem 0 0', color: 'var(--tx-text-dim)', fontSize: '0.75rem', lineHeight: 1.55 }}>
            Traders are the top {data.tradersScanned} wallets by realized net PnL over the last 30 days, from
            the {' '}
            <a href="/leaderboard" style={{ color: ACCENT, textDecoration: 'none' }}>Smart Money leaderboard</a>.
            Positions under $100 are hidden. Unrealized PnL is mark minus entry at current size; To liq is how
            far the mark is from the chain{'’'}s liquidation price. A snapshot, refreshed on a schedule, not live per keystroke.
          </p>
        </div>
      )}

      <footer style={{ marginTop: 'auto', padding: '2rem 0 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <span className="tx-footer">Made by S!G</span>
        <span className="tx-footer" style={{ opacity: 0.4 }}>·</span>
        <span className="tx-footer">Injective</span>
      </footer>
    </main>
  );
}

const rowGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1.2fr) 5.5rem 5.5rem 3.5rem 4rem',
  gap: '0.75rem',
};
