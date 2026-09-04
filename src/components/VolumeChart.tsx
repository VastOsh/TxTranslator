'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

// Interactive on-chain volume chart for the Volume lens — DeFiLlama/Mintscan
// style: gradient area, crosshair, floating tooltip, real axes, and view
// toggles (daily vs cumulative, total vs perp/spot split). Pure SVG, no chart
// dependency, so it inherits the Renzu optical-dark theme exactly.

export interface DayPoint {
  date: string;
  volumeUsd: number;
  derivUsd: number;
  spotUsd: number;
  trades: number;
}

type View = 'total' | 'split';
type Scale = 'daily' | 'cumulative';

const PERP = '#F0B24A'; // amber — perps dominate, so amber is the lead
const SPOT = '#9B8CFF'; // violet — matches the markets table SPOT pill
const TOTAL = '#F0B24A';
const GRID = 'rgba(236,239,245,0.07)';
const AXIS = 'rgba(236,239,245,0.42)';

function fmtUsd(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}
function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function parse(d: string): { y: number; m: number; day: number } {
  const [y, m, day] = d.split('-').map(Number);
  return { y, m, day };
}
function fmtDateFull(d: string): string {
  const { y, m, day } = parse(d);
  return `${MONTHS[m - 1]} ${day}, ${y}`;
}
function fmtDateAxis(d: string, longSpan: boolean): string {
  const { y, m, day } = parse(d);
  return longSpan ? `${MONTHS[m - 1]} '${String(y).slice(2)}` : `${MONTHS[m - 1]} ${day}`;
}

export default function VolumeChart({ data, height = 300 }: { data: DayPoint[]; height?: number }) {
  const uid = useId().replace(/[:]/g, '');
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(820);
  const [view, setView] = useState<View>('total');
  const [scale, setScale] = useState<Scale>('daily');
  const [hover, setHover] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw) setW(Math.max(320, cw));
    });
    ro.observe(el);
    setW(Math.max(320, el.clientWidth || 820));
    const t = setTimeout(() => setMounted(true), 20);
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, []);

  const padL = 6;
  const padR = 12;
  const padT = 14;
  const padB = 24;
  const H = height;
  const innerW = Math.max(1, w - padL - padR);
  const innerH = Math.max(1, H - padT - padB);

  // Build the plotted series (daily or running cumulative).
  const pts = useMemo(() => {
    let cd = 0;
    let cs = 0;
    return data.map((p) => {
      // Guard against a stale cached response that predates the perp/spot split.
      const deriv = p.derivUsd ?? 0;
      const spot = p.spotUsd ?? 0;
      const total = p.volumeUsd ?? deriv + spot;
      if (scale === 'cumulative') {
        cd += deriv;
        cs += spot;
        return { date: p.date, deriv: cd, spot: cs, total: cd + cs, trades: p.trades ?? 0 };
      }
      return { date: p.date, deriv, spot, total, trades: p.trades ?? 0 };
    });
  }, [data, scale]);

  const n = pts.length;
  const maxY = useMemo(() => Math.max(1, ...pts.map((p) => p.total)), [pts]);
  const longSpan = n > 70;

  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + (1 - v / maxY) * innerH;
  const baseY = y(0);

  // Y gridlines / labels (~4).
  const yTicks = useMemo(() => {
    const steps = 4;
    return Array.from({ length: steps + 1 }, (_, i) => (maxY / steps) * i);
  }, [maxY]);

  // X ticks (~5, evenly spaced by index).
  const xTicks = useMemo(() => {
    if (n <= 1) return [0];
    const count = Math.min(5, n);
    return Array.from({ length: count }, (_, i) => Math.round((i / (count - 1)) * (n - 1)));
  }, [n]);

  // Path builders.
  const linePath = (sel: (p: (typeof pts)[number]) => number) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(sel(p)).toFixed(1)}`).join(' ');

  const areaPath = (sel: (p: (typeof pts)[number]) => number) =>
    `${linePath(sel)} L${x(n - 1).toFixed(1)},${baseY.toFixed(1)} L${x(0).toFixed(1)},${baseY.toFixed(1)} Z`;

  // Stacked band for spot (sits on top of the perp line).
  const spotBand = () => {
    const top = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.total).toFixed(1)}`).join(' ');
    const bottom = pts
      .map((p, i) => `L${x(n - 1 - i).toFixed(1)},${y(pts[n - 1 - i].deriv).toFixed(1)}`)
      .join(' ');
    return `${top} ${bottom} Z`;
  };

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * w;
    const i = Math.round(((mx - padL) / innerW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  if (n < 2) {
    return (
      <div className="tx-pnl-card" style={{ padding: '1.4rem 1.2rem', color: 'var(--tx-text-muted)', fontSize: '0.8rem' }}>
        Pick a longer timeframe to see the volume chart. Daily history needs at least two stored days.
      </div>
    );
  }

  const hp = hover != null ? pts[hover] : null;
  const tipLeft = hover != null ? x(hover) : 0;
  const flip = tipLeft > w * 0.62;

  return (
    <div className="tx-pnl-card" style={{ padding: '0.9rem 1.1rem 0.6rem' }}>
      {/* Header: title + view toggles */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '0.4rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem' }}>
          <span style={{ fontSize: '0.64rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(236,239,245,0.5)' }}>
            {scale === 'cumulative' ? 'Cumulative volume' : 'Daily volume'}
          </span>
          {view === 'split' && (
            <span style={{ display: 'inline-flex', gap: '0.7rem', fontSize: '0.62rem', color: 'rgba(236,239,245,0.6)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><i style={{ width: 8, height: 8, borderRadius: 2, background: PERP }} />Perp</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><i style={{ width: 8, height: 8, borderRadius: 2, background: SPOT }} />Spot</span>
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <Seg options={[['total', 'Total'], ['split', 'Perp / Spot']]} value={view} onChange={(v) => setView(v as View)} />
          <Seg options={[['daily', 'Daily'], ['cumulative', 'Cumulative']]} value={scale} onChange={(v) => setScale(v as Scale)} />
        </div>
      </div>

      <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
        <svg
          width={w}
          height={H}
          viewBox={`0 0 ${w} ${H}`}
          style={{ display: 'block', width: '100%', height: H, opacity: mounted ? 1 : 0, transition: 'opacity .5s ease' }}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={`g-total-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={TOTAL} stopOpacity="0.32" />
              <stop offset="100%" stopColor={TOTAL} stopOpacity="0" />
            </linearGradient>
            <linearGradient id={`g-perp-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PERP} stopOpacity="0.34" />
              <stop offset="100%" stopColor={PERP} stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id={`g-spot-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SPOT} stopOpacity="0.42" />
              <stop offset="100%" stopColor={SPOT} stopOpacity="0.04" />
            </linearGradient>
          </defs>

          {/* Y gridlines + labels */}
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={padL} y1={y(v)} x2={w - padR} y2={y(v)} stroke={GRID} strokeWidth={1} />
              {i > 0 && (
                <text x={padL + 2} y={y(v) - 4} fill={AXIS} fontSize={10} style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                  {fmtUsd(v)}
                </text>
              )}
            </g>
          ))}

          {/* Areas */}
          {view === 'total' ? (
            <>
              <path d={areaPath((p) => p.total)} fill={`url(#g-total-${uid})`} />
              <path d={linePath((p) => p.total)} fill="none" stroke={TOTAL} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </>
          ) : (
            <>
              <path d={areaPath((p) => p.deriv)} fill={`url(#g-perp-${uid})`} />
              <path d={spotBand()} fill={`url(#g-spot-${uid})`} />
              <path d={linePath((p) => p.deriv)} fill="none" stroke={PERP} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              <path d={linePath((p) => p.total)} fill="none" stroke={SPOT} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
            </>
          )}

          {/* Endpoint dot (total) */}
          <circle cx={x(n - 1)} cy={y(pts[n - 1].total)} r={3} fill={TOTAL} />

          {/* X axis labels */}
          {xTicks.map((i) => (
            <text key={i} x={x(i)} y={H - 7} fill={AXIS} fontSize={10} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} style={{ fontFamily: 'var(--font-mono, monospace)' }}>
              {fmtDateAxis(pts[i].date, longSpan)}
            </text>
          ))}

          {/* Crosshair */}
          {hp && hover != null && (
            <g pointerEvents="none">
              <line x1={x(hover)} y1={padT} x2={x(hover)} y2={baseY} stroke="rgba(236,239,245,0.28)" strokeWidth={1} strokeDasharray="3 3" />
              {view === 'split' ? (
                <>
                  <circle cx={x(hover)} cy={y(hp.deriv)} r={3.5} fill={PERP} stroke="#0A0B0F" strokeWidth={1.5} />
                  <circle cx={x(hover)} cy={y(hp.total)} r={3.5} fill={SPOT} stroke="#0A0B0F" strokeWidth={1.5} />
                </>
              ) : (
                <circle cx={x(hover)} cy={y(hp.total)} r={4} fill={TOTAL} stroke="#0A0B0F" strokeWidth={1.5} />
              )}
            </g>
          )}
        </svg>

        {/* Tooltip */}
        {hp && (
          <div
            style={{
              position: 'absolute',
              top: 6,
              left: flip ? undefined : `calc(${(tipLeft / w) * 100}% + 12px)`,
              right: flip ? `calc(${(1 - tipLeft / w) * 100}% + 12px)` : undefined,
              pointerEvents: 'none',
              background: 'rgba(14,16,22,0.94)',
              border: '1px solid var(--tx-border)',
              borderRadius: 10,
              padding: '0.55rem 0.7rem',
              minWidth: 148,
              boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
              backdropFilter: 'blur(6px)',
            }}
          >
            <div style={{ fontSize: '0.68rem', color: 'rgba(236,239,245,0.6)', marginBottom: 5 }}>{fmtDateFull(hp.date)}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: '0.82rem', fontWeight: 700 }}>
              <span style={{ color: 'rgba(236,239,245,0.7)' }}>{scale === 'cumulative' ? 'Total' : 'Volume'}</span>
              <span style={{ color: TOTAL, fontVariantNumeric: 'tabular-nums' }}>{fmtUsd(hp.total)}</span>
            </div>
            <Row color={PERP} label="Perp" value={fmtUsd(hp.deriv)} />
            <Row color={SPOT} label="Spot" value={fmtUsd(hp.spot)} />
            {scale === 'daily' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: '0.68rem', marginTop: 4, color: 'rgba(236,239,245,0.5)' }}>
                <span>Trades</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtInt(hp.trades)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: '0.72rem', marginTop: 3 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'rgba(236,239,245,0.62)' }}>
        <i style={{ width: 7, height: 7, borderRadius: 2, background: color }} />
        {label}
      </span>
      <span style={{ fontVariantNumeric: 'tabular-nums', color: 'rgba(236,239,245,0.9)' }}>{value}</span>
    </div>
  );
}

function Seg({ options, value, onChange }: { options: Array<[string, string]>; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'inline-flex', background: 'rgba(236,239,245,0.05)', border: '1px solid var(--tx-border)', borderRadius: 8, padding: 2 }}>
      {options.map(([id, label]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          style={{
            padding: '0.28rem 0.6rem',
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.68rem',
            fontWeight: 700,
            background: value === id ? 'rgba(240,178,74,0.16)' : 'transparent',
            color: value === id ? '#F0B24A' : 'rgba(236,239,245,0.55)',
            transition: 'background .15s, color .15s',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
