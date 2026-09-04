'use client';

// Front-end / dApp share of on-chain order-book volume, attributed by the
// feeRecipient wallet on each trade. Named where we have identified the wallet;
// unlabeled relayers surface by address; unset recipients are Direct / API.

export interface DappRow {
  name: string;
  kind: 'frontend' | 'direct' | 'unknown' | 'other';
  addr: string | null;
  volumeUsd: number;
  trades: number;
  share: number;
}

const PALETTE = ['#35C9BE', '#9B8CFF', '#F0B24A', '#E77BA6', '#4FD8CD', '#6EA8FF', '#F2C879', '#C88CE7'];
const DIRECT_COLOR = '#7A8290';
const OTHER_COLOR = '#464C57';

function fmtUsd(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

function colorFor(rows: DappRow[]): Map<DappRow, string> {
  const m = new Map<DappRow, string>();
  let fi = 0;
  for (const r of rows) {
    if (r.kind === 'direct') m.set(r, DIRECT_COLOR);
    else if (r.kind === 'other') m.set(r, OTHER_COLOR);
    else m.set(r, PALETTE[fi++ % PALETTE.length]);
  }
  return m;
}

export default function DappSplit({
  dapps,
  coverage,
  daysCounted,
}: {
  dapps: DappRow[];
  coverage: { daysWithData: number; volumeUsd: number };
  daysCounted: number;
}) {
  const colors = colorFor(dapps);
  const partial = coverage.daysWithData > 0 && coverage.daysWithData < daysCounted;

  if (!dapps.length || coverage.daysWithData === 0) {
    return (
      <div className="tx-pnl-card" style={{ padding: '1rem 1.2rem' }}>
        <div className="tx-pnl-head-title" style={{ marginBottom: '0.5rem' }}>By dApp / front-end</div>
        <div style={{ fontSize: '0.76rem', color: 'var(--tx-text-muted)', lineHeight: 1.5 }}>
          Front-end attribution is available for days ingested with per-trade recipient data. As the daily cron runs (or after a backfill), the split by front-end fills in here.
        </div>
      </div>
    );
  }

  return (
    <div className="tx-pnl-card" style={{ padding: '1rem 1.2rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
        <div className="tx-pnl-head-title">By dApp / front-end</div>
        <div style={{ fontSize: '0.64rem', color: 'rgba(236,239,245,0.45)' }}>attributed by fee recipient</div>
      </div>

      {/* Stacked share bar */}
      <div style={{ display: 'flex', width: '100%', height: 14, borderRadius: 7, overflow: 'hidden', background: 'rgba(236,239,245,0.05)', marginBottom: '0.9rem' }}>
        {dapps.map((d, i) => (
          <div key={i} title={`${d.name} · ${(d.share * 100).toFixed(1)}%`}
            style={{ width: `${d.share * 100}%`, background: colors.get(d), minWidth: d.share > 0.004 ? 1 : 0 }} />
        ))}
      </div>

      {/* Legend / table */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
        {dapps.map((d, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center', gap: '0.75rem', padding: '0.3rem 0', borderTop: i ? '1px solid var(--tx-border)' : 'none' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
              <i style={{ width: 9, height: 9, borderRadius: 2, background: colors.get(d), flexShrink: 0 }} />
              <span style={{ fontWeight: 600, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
              {d.kind === 'unknown' && <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'rgba(236,239,245,0.4)', border: '1px solid var(--tx-border)', borderRadius: 4, padding: '0 0.3rem' }}>UNVERIFIED</span>}
            </span>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: '0.82rem' }}>{(d.share * 100).toFixed(d.share >= 0.1 ? 1 : 2)}%</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--tx-text-muted)', fontSize: '0.78rem', minWidth: 62, textAlign: 'right' }}>{fmtUsd(d.volumeUsd)}</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: '0.64rem', color: 'rgba(236,239,245,0.45)', lineHeight: 1.5, marginTop: '0.7rem' }}>
        Share of order-book taker volume by the fee recipient set on each order. Direct / API is flow with no front-end tag (market makers, bots). Unverified wallets are large relayers we have not yet identified.
        {partial && ` Covers ${coverage.daysWithData} of ${daysCounted} days in range (${fmtUsd(coverage.volumeUsd)} attributed).`}
      </div>
    </div>
  );
}
