'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import LensCrumb from '@/components/LensCrumb';
import LensCursor from '@/components/LensCursor';
import LensAurora from '@/components/LensAurora';
import BackToRenzu from '@/components/BackToRenzu';
import Changelog from '@/components/Changelog';
import { CURRENT_VERSION } from '@/data/changelog';

const ACCENT = '#F0B24A'; // Markets lens colour

type Range = '7d' | '30d';
type Sort = 'pnl' | 'volume';

interface LeaderRow {
  address: string;
  subaccounts: number;
  netPnlUsd: number;
  volumeUsd: number;
  fills: number;
}
interface LeaderResp {
  range: Range;
  sort: Sort;
  updatedAt: number;
  daysCovered: number;
  note: string;
  traders: LeaderRow[];
}

const RANGES: Array<{ id: Range; label: string }> = [
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
];
const SORTS: Array<{ id: Sort; label: string }> = [
  { id: 'pnl', label: 'Net PnL' },
  { id: 'volume', label: 'Volume' },
];

function fmtSignedUsd(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '+';
  let body: string;
  if (a >= 1e9) body = `$${(a / 1e9).toFixed(2)}B`;
  else if (a >= 1e6) body = `$${(a / 1e6).toFixed(2)}M`;
  else if (a >= 1e3) body = `$${(a / 1e3).toFixed(1)}K`;
  else body = `$${a.toFixed(0)}`;
  return `${sign}${body}`;
}
function fmtUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
function fmtInt(n: number): string { return n.toLocaleString('en-US'); }
function shortAddr(a: string): string { return `${a.slice(0, 10)}…${a.slice(-6)}`; }
function agoLabel(ms: number): string {
  if (!ms) return 'not built yet';
  const h = Math.round((Date.now() - ms) / 3_600_000);
  if (h < 1) return 'updated just now';
  if (h < 24) return `updated ${h}h ago`;
  return `updated ${Math.round(h / 24)}d ago`;
}

export default function LeaderboardPage() {
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [range, setRange] = useState<Range>('7d');
  const [sort, setSort] = useState<Sort>('pnl');
  const [data, setData] = useState<LeaderResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/leaderboard?range=${range}&sort=${sort}`)
      .then((res) => res.json().then((d) => ({ ok: res.ok, d })))
      .then(({ ok, d }) => {
        if (cancelled) return;
        if (!ok) setError(d.error ?? 'Could not load the leaderboard.');
        else { setData(d as LeaderResp); setError(null); }
      })
      .catch(() => { if (!cancelled) setError('Network error, check your connection and try again.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range, sort]);

  const rows = data?.traders ?? [];

  return (
    <main className="tx-main">
      <LensCursor />
      <LensAurora />

      <header
        className="tx-page-header"
        style={{
          width: '100%', maxWidth: 860, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', padding: '1.25rem 0',
          borderBottom: '1px solid var(--tx-border)', marginBottom: '2rem',
        }}
      >
        <LensCrumb name="Smart Money" accent={ACCENT} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <span className="tx-footer">Injective Mainnet</span>
          <button className="tx-version-btn" onClick={() => setChangelogOpen(true)}>{CURRENT_VERSION}</button>
        </div>
      </header>

      {changelogOpen && <Changelog onClose={() => setChangelogOpen(false)} />}

      <div style={{ width: '100%', maxWidth: 860, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <BackToRenzu />
        <span className="tx-footer" style={{ opacity: 0.7 }}>
          {data ? `${data.daysCovered} days · ${agoLabel(data.updatedAt)}` : ''}
        </span>
      </div>

      {/* Title + intent */}
      <div style={{ width: '100%', maxWidth: 860, marginBottom: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.55rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--tx-text)' }}>
          Smart-money leaderboard
        </h1>
        <p style={{ margin: '0.5rem 0 0', color: 'var(--tx-text-muted)', fontSize: '0.9rem', maxWidth: '60ch', lineHeight: 1.55 }}>
          The most profitable perpetual traders on Injective, ranked by realized net PnL taken straight
          from the chain{'’'}s own per-fill numbers. A trader{'’'}s subaccounts are summed together.
          Open any row for the full round-trip breakdown.
        </p>
      </div>

      {/* Controls */}
      <div style={{ width: '100%', maxWidth: 860, display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
        <Toggle options={RANGES} value={range} onChange={(r) => { if (r !== range) { setLoading(true); setRange(r); } }} />
        <Toggle options={SORTS} value={sort} onChange={(s) => { if (s !== sort) { setLoading(true); setSort(s); } }} label="Sort" />
      </div>

      {/* Table */}
      <div style={{ width: '100%', maxWidth: 860 }}>
        {error && (
          <div className="tx-error-msg">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </div>
        )}

        {!error && (
          <div style={{ border: '1px solid var(--tx-border)', borderRadius: 12, overflow: 'hidden', background: 'rgba(20,22,29,0.5)' }}>
            {/* head */}
            <div style={{ ...rowGrid, padding: '0.7rem 1rem', borderBottom: '1px solid var(--tx-border)', color: 'var(--tx-text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-mono)' }}>
              <span>#</span>
              <span>Trader</span>
              <span style={{ textAlign: 'right' }}>Net PnL</span>
              <span style={{ textAlign: 'right' }}>Volume</span>
              <span style={{ textAlign: 'right' }}>Fills</span>
              <span />
            </div>

            {loading && rows.length === 0 && (
              <div style={{ padding: '2rem 1rem' }}>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="tx-skel" style={{ height: 20, width: '100%', marginBottom: 12, opacity: 1 - i * 0.12 }} />
                ))}
              </div>
            )}

            {!loading && rows.length === 0 && (
              <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--tx-text-muted)', fontSize: '0.9rem' }}>
                No trader data yet. The board fills in once the daily ingest has run.
              </div>
            )}

            {rows.map((r, i) => (
              <div key={r.address} style={{ ...rowGrid, padding: '0.7rem 1rem', borderBottom: i === rows.length - 1 ? 'none' : '1px solid rgba(53,201,190,0.07)', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: i < 3 ? ACCENT : 'var(--tx-text-muted)', fontWeight: i < 3 ? 700 : 400 }}>{i + 1}</span>
                <Link href={`/pnl/${r.address}`} style={{ textDecoration: 'none', color: 'var(--tx-text)', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span>{shortAddr(r.address)}</span>
                  {r.subaccounts > 1 && (
                    <span style={{ fontSize: '0.66rem', color: 'var(--tx-text-dim)' }}>{r.subaccounts} subaccounts</span>
                  )}
                </Link>
                <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 600, color: r.netPnlUsd >= 0 ? 'var(--tx-green)' : 'var(--tx-red)' }}>
                  {fmtSignedUsd(r.netPnlUsd)}
                </span>
                <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--tx-text-muted)' }}>{fmtUsd(r.volumeUsd)}</span>
                <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--tx-text-muted)' }}>{fmtInt(r.fills)}</span>
                <Link href={`/wallet?address=${r.address}`} title="Open in Wallet Intelligence" style={{ justifySelf: 'end', color: 'var(--tx-text-dim)', display: 'flex' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" />
                  </svg>
                </Link>
              </div>
            ))}
          </div>
        )}

        {data && rows.length > 0 && (
          <p style={{ margin: '1rem 0 0', color: 'var(--tx-text-dim)', fontSize: '0.75rem', lineHeight: 1.55 }}>
            {data.note}
          </p>
        )}
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
  gridTemplateColumns: '2rem minmax(0,1fr) 6rem 5rem 3.5rem 1.5rem',
  gap: '0.75rem',
};

function Toggle<T extends string>({ options, value, onChange, label }: {
  options: Array<{ id: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      {label && <span className="tx-footer" style={{ fontSize: '0.72rem', opacity: 0.7 }}>{label}</span>}
      <div style={{ display: 'inline-flex', border: '1px solid var(--tx-border)', borderRadius: 8, overflow: 'hidden' }}>
        {options.map((o) => (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            style={{
              padding: '0.35rem 0.75rem', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', border: 'none',
              background: value === o.id ? 'rgba(240,178,74,0.16)' : 'transparent',
              color: value === o.id ? '#F0B24A' : 'var(--tx-text-muted)',
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
