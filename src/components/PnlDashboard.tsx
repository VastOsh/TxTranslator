'use client';

import { useState } from 'react';
import type { PnlReport, PnlTrade } from '@/lib/pnl/aggregate';

export const PNL_RANGE_KEYS = ['24h', '7d', '30d', 'all'] as const;
export type PnlRangeKey = (typeof PNL_RANGE_KEYS)[number];

const RANGE_LABELS: Record<PnlRangeKey, string> = {
  '24h': '24H',
  '7d': '7D',
  '30d': '30D',
  all: 'MAX',
};

interface Props {
  report: PnlReport;
  range: PnlRangeKey;
  onRangeChange: (r: PnlRangeKey) => void;
  loading?: boolean;
}

function signedUsd(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}k`;
  if (abs >= 1) return `${sign}$${abs.toFixed(2)}`;
  if (abs === 0) return '$0.00';
  return `${sign}$${abs.toFixed(4)}`;
}

function plainUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}

function price(n: number): string {
  if (n >= 1000) return n.toFixed(2);
  if (n >= 1) return n.toFixed(4);
  return n.toPrecision(4);
}

function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = m / 60;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function ago(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function toneClass(n: number): string {
  return n > 0 ? 'tx-pnl-up' : n < 0 ? 'tx-pnl-down' : 'tx-pnl-flat';
}

/** Cumulative net-PnL line. Purely presentational, no axes, it's a shape. */
function EquityCurve({ points, positive }: { points: Array<{ t: number; v: number }>; positive: boolean }) {
  if (points.length < 2) return null;

  const W = 640;
  const H = 90;
  const PAD = 4;
  const xs = points.map(p => p.t);
  const vs = points.map(p => p.v);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minV = Math.min(...vs, 0);
  const maxV = Math.max(...vs, 0);
  const spanX = maxX - minX || 1;
  const spanV = maxV - minV || 1;

  const x = (t: number) => PAD + ((t - minX) / spanX) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - minV) / spanV) * (H - PAD * 2);

  const line = points.map(p => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = `${x(minX).toFixed(1)},${y(0).toFixed(1)} ${line} ${x(maxX).toFixed(1)},${y(0).toFixed(1)}`;
  const stroke = positive ? 'var(--tx-green)' : 'var(--tx-red)';
  const fill = positive ? 'rgba(14, 226, 155, 0.10)' : 'rgba(246, 71, 114, 0.10)';

  return (
    <svg className="tx-pnl-curve" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" height={90} role="img" aria-label="Cumulative net PnL over the selected window">
      <line x1={PAD} y1={y(0)} x2={W - PAD} y2={y(0)} stroke="var(--tx-border-hi)" strokeWidth="1" strokeDasharray="3 3" />
      <polygon points={area} fill={fill} />
      <polyline points={line} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Side({ direction }: { direction: 'long' | 'short' }) {
  return <span className={`tx-pnl-side tx-pnl-side--${direction}`}>{direction}</span>;
}

function TradeRow({ t }: { t: PnlTrade }) {
  return (
    <li className="tx-pnl-row">
      <div className="tx-pnl-row-left">
        <div className="tx-pnl-row-main">
          <span className="tx-pnl-ticker">{t.ticker.replace(' PERP', '')}</span>
          <Side direction={t.direction} />
        </div>
        <span className="tx-pnl-row-meta">
          {price(t.entryPrice)} → {price(t.exitPrice)} · held {duration(t.closedAt - t.openedAt)} · {ago(t.closedAt)}
        </span>
      </div>
      <div className={`tx-pnl-row-right ${toneClass(t.netPnlUsd)}`}>
        {signedUsd(t.netPnlUsd)}
        <span className="tx-pnl-row-right-sub">{plainUsd(t.volumeUsd)} vol</span>
      </div>
    </li>
  );
}

export default function PnlDashboard({ report, range, onRangeChange, loading = false }: Props) {
  const [showAllTrades, setShowAllTrades] = useState(false);
  const [showAllMarkets, setShowAllMarkets] = useState(false);
  const [showAllPositions, setShowAllPositions] = useState(false);

  const {
    netPnlUsd, grossPnlUsd, feesUsd, volumeUsd, fills,
    roundTrips, wins, losses, winRate, avgWinUsd, avgLossUsd, profitFactor,
    bestUsd, worstUsd, avgHoldMs, orphanCloses, orphanPnlUsd,
    marketsTraded, markets, trades, openPositions, unrealizedPnlUsd,
    equityCurve, truncated, windowFrom, windowTo,
  } = report;

  const hasActivity = fills > 0;
  const visibleTrades = showAllTrades ? trades : trades.slice(0, 8);
  const visibleMarkets = showAllMarkets ? markets : markets.slice(0, 6);
  const visiblePositions = showAllPositions ? openPositions : openPositions.slice(0, 6);
  const windowHours = windowTo > windowFrom ? (windowTo - windowFrom) / 3_600_000 : 0;

  return (
    <div className="tx-pnl-wrap" style={loading ? { opacity: 0.5, transition: 'opacity 0.15s' } : undefined}>
      {/* ── Hero: net PnL + equity curve ── */}
      <div className="tx-pnl-card">
        <div className="tx-pnl-head">
          <span className="tx-pnl-head-title">Perp trading · realized</span>
          <div className="tx-pnl-ranges">
            {PNL_RANGE_KEYS.map(k => (
              <button
                key={k}
                className={`tx-pnl-range${k === range ? ' tx-pnl-range--on' : ''}`}
                onClick={() => onRangeChange(k)}
                disabled={loading}
              >
                {RANGE_LABELS[k]}
              </button>
            ))}
          </div>
        </div>

        {!hasActivity ? (
          <div className="tx-pnl-empty">
            No perp trades in this window. Try a longer range, this wallet may only trade spot or hold positions.
          </div>
        ) : (
          <>
            <div className="tx-pnl-hero">
              <span className="tx-pnl-hero-label">Net realized PnL</span>
              <span className={`tx-pnl-hero-value ${toneClass(netPnlUsd)}`}>{signedUsd(netPnlUsd)}</span>
              <span className="tx-pnl-hero-sub">
                {signedUsd(grossPnlUsd)} gross − {plainUsd(feesUsd)} fees · {plainUsd(volumeUsd)} traded across{' '}
                {marketsTraded} market{marketsTraded === 1 ? '' : 's'} · {fills.toLocaleString()} fills
                {windowHours > 0 && ` over ${windowHours < 48 ? `${windowHours.toFixed(1)}h` : `${(windowHours / 24).toFixed(1)}d`}`}
              </span>
            </div>

            <EquityCurve points={equityCurve} positive={netPnlUsd >= 0} />

            <div className="tx-pnl-grid">
              <div className="tx-pnl-stat">
                <span className="tx-pnl-stat-label">Win rate</span>
                <span className="tx-pnl-stat-value">
                  {winRate === null ? '—' : `${winRate.toFixed(1)}%`}
                </span>
              </div>
              <div className="tx-pnl-stat">
                <span className="tx-pnl-stat-label">Round trips</span>
                <span className="tx-pnl-stat-value">{roundTrips.toLocaleString()}</span>
              </div>
              <div className="tx-pnl-stat">
                <span className="tx-pnl-stat-label">W / L</span>
                <span className="tx-pnl-stat-value">{wins} / {losses}</span>
              </div>
              <div className="tx-pnl-stat">
                <span className="tx-pnl-stat-label">Avg win</span>
                <span className="tx-pnl-stat-value tx-pnl-up">
                  {avgWinUsd === null ? '—' : signedUsd(avgWinUsd)}
                </span>
              </div>
              <div className="tx-pnl-stat">
                <span className="tx-pnl-stat-label">Avg loss</span>
                <span className="tx-pnl-stat-value tx-pnl-down">
                  {avgLossUsd === null ? '—' : signedUsd(avgLossUsd)}
                </span>
              </div>
              <div className="tx-pnl-stat">
                <span className="tx-pnl-stat-label">Profit factor</span>
                <span className="tx-pnl-stat-value">
                  {profitFactor === null ? '—' : profitFactor.toFixed(2)}
                </span>
              </div>
              <div className="tx-pnl-stat">
                <span className="tx-pnl-stat-label">Best trade</span>
                <span className="tx-pnl-stat-value tx-pnl-up">
                  {bestUsd === null ? '—' : signedUsd(bestUsd)}
                </span>
              </div>
              <div className="tx-pnl-stat">
                <span className="tx-pnl-stat-label">Worst trade</span>
                <span className="tx-pnl-stat-value tx-pnl-down">
                  {worstUsd === null ? '—' : signedUsd(worstUsd)}
                </span>
              </div>
              <div className="tx-pnl-stat">
                <span className="tx-pnl-stat-label">Avg hold</span>
                <span className="tx-pnl-stat-value">
                  {avgHoldMs === null ? '—' : duration(avgHoldMs)}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Open positions ── */}
      {openPositions.length > 0 && (
        <div className="tx-pnl-card">
          <div className="tx-pnl-head">
            <span className="tx-pnl-head-title">Open positions · {openPositions.length}</span>
            <span className={`tx-pnl-row-right ${toneClass(unrealizedPnlUsd)}`} style={{ fontSize: '0.8rem' }}>
              {signedUsd(unrealizedPnlUsd)} unrealized
            </span>
          </div>
          <ul className="tx-pnl-list">
            {visiblePositions.map((p, i) => (
              <li key={`${p.ticker}-${i}`} className="tx-pnl-row">
                <div className="tx-pnl-row-left">
                  <div className="tx-pnl-row-main">
                    <span className="tx-pnl-ticker">{p.ticker.replace(' PERP', '')}</span>
                    <Side direction={p.direction} />
                    {p.leverage && p.leverage >= 1.5 && (
                      <span className="tx-pnl-row-meta">{p.leverage.toFixed(1)}x</span>
                    )}
                  </div>
                  <span className="tx-pnl-row-meta">
                    entry {price(p.entryPrice)} · mark {price(p.markPrice)}
                    {p.liquidationPrice && ` · liq ${price(p.liquidationPrice)}`}
                  </span>
                </div>
                <div className={`tx-pnl-row-right ${toneClass(p.unrealizedPnlUsd)}`}>
                  {signedUsd(p.unrealizedPnlUsd)}
                  <span className="tx-pnl-row-right-sub">{plainUsd(p.notionalUsd)} size</span>
                </div>
              </li>
            ))}
          </ul>
          {openPositions.length > 6 && (
            <button className="tx-pnl-more" onClick={() => setShowAllPositions(v => !v)}>
              {showAllPositions ? 'Show less' : `Show all ${openPositions.length} positions`}
            </button>
          )}
        </div>
      )}

      {/* ── Per-market breakdown ── */}
      {markets.length > 0 && (
        <div className="tx-pnl-card">
          <div className="tx-pnl-head">
            <span className="tx-pnl-head-title">By market · {markets.length}</span>
          </div>
          <ul className="tx-pnl-list">
            {visibleMarkets.map(m => (
              <li key={m.ticker} className="tx-pnl-row">
                <div className="tx-pnl-row-left">
                  <div className="tx-pnl-row-main">
                    <span className="tx-pnl-ticker">{m.ticker.replace(' PERP', '')}</span>
                  </div>
                  <span className="tx-pnl-row-meta">
                    {plainUsd(m.volumeUsd)} vol · {m.fills} fill{m.fills === 1 ? '' : 's'} · {plainUsd(m.feesUsd)} fees
                  </span>
                </div>
                <div className={`tx-pnl-row-right ${toneClass(m.netPnlUsd)}`}>{signedUsd(m.netPnlUsd)}</div>
              </li>
            ))}
          </ul>
          {markets.length > 6 && (
            <button className="tx-pnl-more" onClick={() => setShowAllMarkets(v => !v)}>
              {showAllMarkets ? 'Show less' : `Show all ${markets.length} markets`}
            </button>
          )}
        </div>
      )}

      {/* ── Closed round trips ── */}
      {trades.length > 0 && (
        <div className="tx-pnl-card">
          <div className="tx-pnl-head">
            <span className="tx-pnl-head-title">Closed trades · most recent</span>
          </div>
          <ul className="tx-pnl-list">
            {visibleTrades.map((t, i) => (
              <TradeRow key={`${t.ticker}-${t.closedAt}-${i}`} t={t} />
            ))}
          </ul>
          {trades.length > 8 && (
            <button className="tx-pnl-more" onClick={() => setShowAllTrades(v => !v)}>
              {showAllTrades ? 'Show less' : `Show ${trades.length} closed trades`}
            </button>
          )}
        </div>
      )}

      {/* ── Caveats, these numbers have real limits, say so ── */}
      {truncated && (
        <div className="tx-pnl-note">
          <span>⚠</span>
          <span>
            This wallet trades faster than one window can hold. Stats cover the most recent{' '}
            {fills.toLocaleString()} fills only, not the full {RANGE_LABELS[range]} range.
          </span>
        </div>
      )}
      {orphanCloses > 0 && (
        <div className="tx-pnl-note">
          <span>⚠</span>
          <span>
            {orphanCloses} position{orphanCloses === 1 ? '' : 's'} closed in this window opened before it
            ({signedUsd(orphanPnlUsd)}). That PnL counts in the total above but is excluded from win rate and
            per-trade stats, since there is no observable entry.
          </span>
        </div>
      )}
    </div>
  );
}
