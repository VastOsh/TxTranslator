'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Changelog from '@/components/Changelog';
import { CURRENT_VERSION } from '@/data/changelog';

type Period = '1d' | '7d' | '30d' | '1y' | 'all';
const PERIODS: Array<{ id: Period; label: string }> = [
  { id: '1d', label: '24H' },
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: '1y', label: '1Y' },
  { id: 'all', label: 'All' },
];

interface MarketRow { ticker: string; type: 'derivative' | 'spot'; volumeUsd: number; trades: number }
interface StatsResp {
  period: Period;
  updatedAt: number;
  injPrice: number;
  coverage: { daysAvailable: number; daysCounted: number };
  totals: { volumeUsd: number; trades: number; derivUsd: number; spotUsd: number };
  series: Array<{ date: string; volumeUsd: number }>;
  markets: MarketRow[];
  burn: {
    latestRound: number | null; latestInj: number | null; latestUsd: number | null;
    cumulativeInj: number; roundsCovered: number;
  };
  defillama: { spot7d: number | null; spotAllTime: number | null; note: string };
  compare: { own7d: number; ownAll: number; llamaSpot7d: number | null; llamaSpotAll: number | null };
}

const AMBER = '#f0a020';

function fmtUsd(n: number | null | undefined): string {
  if (n == null) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
function fmtInt(n: number): string { return n.toLocaleString('en-US'); }
function fmtInj(n: number | null): string {
  if (n == null) return '—';
  return `${Math.round(n).toLocaleString('en-US')} INJ`;
}

function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="tx-pnl-card" style={{ padding: '0.9rem 1.1rem', flex: '1 1 150px', minWidth: 150 }}>
      <div style={{ fontSize: '0.64rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(244,241,233,0.5)' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: accent ?? 'var(--tx-text)', marginTop: '0.25rem', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.7rem', color: 'rgba(244,241,233,0.55)', marginTop: '0.2rem' }}>{sub}</div>}
    </div>
  );
}

function Series({ data }: { data: Array<{ date: string; volumeUsd: number }> }) {
  if (data.length < 2) return null;
  const max = Math.max(...data.map(d => d.volumeUsd), 1);
  return (
    <div className="tx-pnl-card" style={{ padding: '0.9rem 1.1rem' }}>
      <div style={{ fontSize: '0.64rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(244,241,233,0.5)', marginBottom: '0.6rem' }}>Daily volume</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 80 }}>
        {data.map((d) => (
          <div key={d.date} title={`${d.date}: ${fmtUsd(d.volumeUsd)}`}
            style={{ flex: 1, minWidth: 2, height: `${Math.max(2, (d.volumeUsd / max) * 100)}%`, background: AMBER, opacity: 0.75, borderRadius: '2px 2px 0 0' }} />
        ))}
      </div>
    </div>
  );
}

export default function StatsPage() {
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [period, setPeriod] = useState<Period>('7d');
  const [data, setData] = useState<StatsResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((p: Period) => {
    setLoading(true);
    setError(null);
    fetch(`/api/stats?period=${p}`)
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (ok) setData(d as StatsResp); else setError(d.error ?? 'Failed to load.'); })
      .catch(() => setError('Network error.'))
      .finally(() => setLoading(false));
  }, []);

  // Defer the fetch (and its setState) out of the effect body to satisfy
  // react-hooks/set-state-in-effect.
  useEffect(() => {
    const t = setTimeout(() => load(period), 0);
    return () => clearTimeout(t);
  }, [period, load]);

  const empty = data && data.coverage.daysAvailable === 0;

  return (
    <main className="tx-main">
      <header className="tx-page-header" style={{ width: '100%', maxWidth: 820, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 0', borderBottom: '1px solid var(--tx-border)', marginBottom: '2rem' }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <div className="tx-logo"><Image src="/logo.svg" alt="Tx·Translator logo" width={28} height={28} priority />TX · TRANSLATOR</div>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <span className="tx-footer">Injective Mainnet</span>
          <button className="tx-version-btn" onClick={() => setChangelogOpen(true)}>{CURRENT_VERSION}</button>
        </div>
      </header>

      {changelogOpen && <Changelog onClose={() => setChangelogOpen(false)} />}

      <div style={{ width: '100%', maxWidth: 820, marginBottom: '1.25rem' }}>
        <Link href="/" className="tx-back-link">← Back to decoder</Link>
      </div>

      <section className="tx-hero" style={{ marginBottom: '1.5rem' }}>
        <h1 className="tx-headline">Injective <span>volume</span></h1>
        <p className="tx-subline">Real spot + perp volume, reconstructed trade-by-trade from the chain — the numbers DeFiLlama misses.</p>
      </section>

      {/* Timeframe toggle */}
      <div style={{ width: '100%', maxWidth: 820, display: 'flex', gap: '0.4rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {PERIODS.map(p => (
          <button key={p.id} onClick={() => setPeriod(p.id)}
            style={{
              padding: '0.4rem 0.9rem', borderRadius: 8, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700,
              border: `1px solid ${period === p.id ? AMBER : 'var(--tx-border)'}`,
              background: period === p.id ? 'rgba(240,160,32,0.12)' : 'transparent',
              color: period === p.id ? AMBER : 'var(--tx-text-muted)',
            }}>{p.label}</button>
        ))}
      </div>

      {loading && <div className="tx-pnl-card" style={{ width: '100%', maxWidth: 820, padding: '1.2rem', color: 'var(--tx-text-muted)', fontSize: '0.8rem' }}><span className="tx-spinner" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 8 }} />Loading on-chain volume…</div>}

      {error && <div className="tx-error-msg" style={{ width: '100%', maxWidth: 820 }}>{error}</div>}

      {data && !loading && (
        <div style={{ width: '100%', maxWidth: 820, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {empty && (
            <div className="tx-pnl-card" style={{ padding: '1rem 1.2rem', fontSize: '0.8rem', color: 'var(--tx-text-muted)', lineHeight: 1.5 }}>
              No days ingested yet. Run the daily cron (<code>/api/cron/stats</code>) or the backfill script to populate the dataset — every timeframe fills in as days land.
            </div>
          )}

          {/* Headline tiles */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            <Tile label={`Volume (${period.toUpperCase()})`} value={fmtUsd(data.totals.volumeUsd)} accent={AMBER} sub={`${fmtInt(data.totals.trades)} trades`} />
            <Tile label="Perps" value={fmtUsd(data.totals.derivUsd)} sub={data.totals.volumeUsd ? `${((data.totals.derivUsd / data.totals.volumeUsd) * 100).toFixed(0)}% of volume` : undefined} />
            <Tile label="Spot" value={fmtUsd(data.totals.spotUsd)} sub={data.totals.volumeUsd ? `${((data.totals.spotUsd / data.totals.volumeUsd) * 100).toFixed(0)}% of volume` : undefined} />
            <Tile label="INJ burned" value={fmtInj(data.burn.cumulativeInj)} accent="var(--tx-purple)" sub={data.burn.latestUsd != null ? `last round ${fmtUsd(data.burn.latestUsd)}` : `${data.burn.roundsCovered} rounds`} />
          </div>

          <Series data={data.series} />

          {/* DeFiLlama gap panel */}
          <div className="tx-pnl-card" style={{ padding: '1rem 1.2rem' }}>
            <div className="tx-pnl-head-title" style={{ marginBottom: '0.7rem' }}>The DeFiLlama gap</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.2rem' }}>
              <div>
                <div style={{ fontSize: '0.64rem', textTransform: 'uppercase', color: 'rgba(244,241,233,0.5)' }}>On-chain 7D (this tracker)</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: AMBER }}>{fmtUsd(data.compare.own7d)}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.64rem', textTransform: 'uppercase', color: 'rgba(244,241,233,0.5)' }}>DeFiLlama 7D (spot only)</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--tx-red)' }}>{fmtUsd(data.compare.llamaSpot7d)}</div>
              </div>
              {data.compare.llamaSpot7d ? (
                <div>
                  <div style={{ fontSize: '0.64rem', textTransform: 'uppercase', color: 'rgba(244,241,233,0.5)' }}>Undercount</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>{data.compare.own7d && data.compare.llamaSpot7d ? `${Math.round(data.compare.own7d / data.compare.llamaSpot7d)}×` : '—'}</div>
                </div>
              ) : null}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'rgba(244,241,233,0.55)', marginTop: '0.7rem', lineHeight: 1.5 }}>{data.defillama.note}</div>
          </div>

          {/* Per-market table */}
          <div className="tx-pnl-card" style={{ padding: '0.4rem 0' }}>
            <div className="tx-pnl-head"><span className="tx-pnl-head-title">Markets</span><span className="tx-pnl-row-meta">{period.toUpperCase()} volume</span></div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ color: 'rgba(244,241,233,0.5)', textAlign: 'left' }}>
                    <th style={{ padding: '0.5rem 1.1rem', fontWeight: 600 }}>Market</th>
                    <th style={{ padding: '0.5rem 0.6rem', fontWeight: 600 }}>Type</th>
                    <th style={{ padding: '0.5rem 1.1rem', fontWeight: 600, textAlign: 'right' }}>Volume</th>
                    <th style={{ padding: '0.5rem 1.1rem', fontWeight: 600, textAlign: 'right' }}>Trades</th>
                  </tr>
                </thead>
                <tbody>
                  {data.markets.map((m) => (
                    <tr key={m.ticker + m.type} style={{ borderTop: '1px solid var(--tx-border)' }}>
                      <td style={{ padding: '0.5rem 1.1rem', fontWeight: 600 }}>{m.ticker}</td>
                      <td style={{ padding: '0.5rem 0.6rem' }}>
                        <span style={{ fontSize: '0.66rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: 5, background: m.type === 'derivative' ? 'rgba(240,160,32,0.14)' : 'rgba(167,139,250,0.14)', color: m.type === 'derivative' ? AMBER : 'var(--tx-purple)' }}>
                          {m.type === 'derivative' ? 'PERP' : 'SPOT'}
                        </span>
                      </td>
                      <td style={{ padding: '0.5rem 1.1rem', textAlign: 'right', fontWeight: 600 }}>{fmtUsd(m.volumeUsd)}</td>
                      <td style={{ padding: '0.5rem 1.1rem', textAlign: 'right', color: 'var(--tx-text-muted)' }}>{fmtInt(m.trades)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ fontSize: '0.66rem', color: 'rgba(244,241,233,0.45)', lineHeight: 1.5, padding: '0 0.2rem' }}>
            Volume is taker-side matched notional, reconstructed from the Injective indexer and counted once per trade. Coverage: {data.coverage.daysCounted}/{data.coverage.daysAvailable} stored days.
            {data.updatedAt ? ` Updated ${new Date(data.updatedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC.` : ''}
          </div>
        </div>
      )}

      <footer style={{ marginTop: 'auto', padding: '2rem 0.75rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: '0.55rem 1rem', textAlign: 'center' }}>
        <span className="tx-footer">Made by S!G</span>
        <span className="tx-footer" style={{ opacity: 0.4 }}>·</span>
        <a href="https://x.com/TxTranslator" target="_blank" rel="noopener noreferrer" className="tx-footer" style={{ textDecoration: 'none', opacity: 0.7 }}>Whale feed @TxTranslator ↗</a>
      </footer>
    </main>
  );
}
