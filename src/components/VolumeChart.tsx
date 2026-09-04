'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

// Interactive on-chain volume chart for the Volume lens — DeFiLlama/Mintscan
// style: gradient stacked areas, crosshair, floating tooltip, real axes. View
// modes let you pick the composition: total, perp only, spot only, perp/spot
// split, or a selectable per-front-end (dApp) breakdown. Pure SVG, no chart lib.

export interface DayPoint {
  date: string;
  volumeUsd: number;
  derivUsd: number;
  spotUsd: number;
  trades: number;
}

export interface DappDayPoint {
  date: string;
  values: Record<string, number>;
}

type View = 'total' | 'perp' | 'spot' | 'split' | 'dapps';
type Scale = 'daily' | 'cumulative';

const PERP = '#F0B24A';
const SPOT = '#9B8CFF';
const TOTAL = '#F0B24A';
const GRID = 'rgba(236,239,245,0.07)';
const AXIS = 'rgba(236,239,245,0.42)';

// Keep dApp colours in sync with DappSplit.
const DAPP_COLORS: Record<string, string> = {
  Helix: '#35C9BE',
  'Automated MM': '#6EA8FF',
  Choice: '#9B8CFF',
  Mito: '#F0B24A',
  'Direct / API': '#7A8290',
  Other: '#464C57',
};
const FALLBACK = ['#E77BA6', '#4FD8CD', '#F2C879', '#C88CE7'];
function dappColor(name: string, i: number): string {
  return DAPP_COLORS[name] ?? FALLBACK[i % FALLBACK.length];
}

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
function parse(d: string) {
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

interface Layer {
  key: string;
  label: string;
  color: string;
}

export default function VolumeChart({
  data,
  dappSeries,
  dappNames,
  height = 300,
}: {
  data: DayPoint[];
  dappSeries?: DappDayPoint[];
  dappNames?: string[];
  height?: number;
}) {
  const uid = useId().replace(/[:]/g, '');
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(820);
  const [view, setView] = useState<View>('total');
  const [scale, setScale] = useState<Scale>('daily');
  const [hover, setHover] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
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

  const hasDapps = (dappSeries?.length ?? 0) >= 2 && (dappNames?.length ?? 0) > 0;
  const isDapp = view === 'dapps' && hasDapps;

  const names = useMemo(() => dappNames ?? [], [dappNames]);
  const layers: Layer[] = useMemo(() => {
    if (isDapp) {
      return names
        .filter((nm) => !hidden.has(nm))
        .map((nm, i) => ({ key: nm, label: nm, color: dappColor(nm, i) }));
    }
    if (view === 'perp') return [{ key: 'deriv', label: 'Perp', color: PERP }];
    if (view === 'spot') return [{ key: 'spot', label: 'Spot', color: SPOT }];
    if (view === 'split')
      return [
        { key: 'deriv', label: 'Perp', color: PERP },
        { key: 'spot', label: 'Spot', color: SPOT },
      ];
    return [{ key: 'total', label: 'Volume', color: TOTAL }];
  }, [isDapp, names, hidden, view]);

  // Build plotted rows (daily or cumulative) with per-layer values.
  const rows = useMemo(() => {
    const src: Array<{ date: string; get: (k: string) => number; trades: number }> = isDapp
      ? (dappSeries ?? []).map((p) => ({ date: p.date, get: (k) => p.values[k] ?? 0, trades: 0 }))
      : data.map((p) => ({
          date: p.date,
          trades: p.trades ?? 0,
          get: (k) =>
            k === 'deriv' ? p.derivUsd ?? 0 : k === 'spot' ? p.spotUsd ?? 0 : p.volumeUsd ?? (p.derivUsd ?? 0) + (p.spotUsd ?? 0),
        }));
    const acc: Record<string, number> = {};
    return src.map((p) => {
      const vals: Record<string, number> = {};
      let tot = 0;
      for (const L of layers) {
        let v = p.get(L.key);
        if (scale === 'cumulative') {
          acc[L.key] = (acc[L.key] ?? 0) + v;
          v = acc[L.key];
        }
        vals[L.key] = v;
        tot += v;
      }
      return { date: p.date, vals, tot, trades: p.trades };
    });
  }, [isDapp, dappSeries, data, layers, scale]);

  const n = rows.length;
  const maxY = useMemo(() => Math.max(1, ...rows.map((r) => r.tot)), [rows]);
  const longSpan = n > 70;

  const padL = 6;
  const padR = 12;
  const padT = 14;
  const padB = 24;
  const H = height;
  const innerW = Math.max(1, w - padL - padR);
  const innerH = Math.max(1, H - padT - padB);
  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + (1 - v / maxY) * innerH;
  const baseY = y(0);

  const yTicks = useMemo(() => Array.from({ length: 5 }, (_, i) => (maxY / 4) * i), [maxY]);
  const xTicks = useMemo(() => {
    if (n <= 1) return [0];
    const count = Math.min(5, n);
    return Array.from({ length: count }, (_, i) => Math.round((i / (count - 1)) * (n - 1)));
  }, [n]);

  const sumUpTo = (r: (typeof rows)[number], count: number) => {
    let s = 0;
    for (let k = 0; k < count && k < layers.length; k++) s += r.vals[layers[k].key] ?? 0;
    return s;
  };
  const lineAt = (li: number) => rows.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(sumUpTo(r, li + 1)).toFixed(1)}`).join(' ');
  const bandAt = (li: number) => {
    const top = rows.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(sumUpTo(r, li + 1)).toFixed(1)}`).join(' ');
    const bottom = rows.map((_, i) => `L${x(n - 1 - i).toFixed(1)},${y(sumUpTo(rows[n - 1 - i], li)).toFixed(1)}`).join(' ');
    return `${top} ${bottom} Z`;
  };

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * w;
    const i = Math.round(((mx - padL) / innerW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const toggle = (nm: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(nm)) next.delete(nm);
      else next.add(nm);
      return next;
    });

  const viewOpts: Array<[View, string]> = [
    ['total', 'Total'],
    ['perp', 'Perp'],
    ['spot', 'Spot'],
    ['split', 'Split'],
  ];
  if (hasDapps) viewOpts.push(['dapps', 'By dApp']);

  const hp = hover != null && rows[hover] ? rows[hover] : null;
  const tipLeft = hover != null ? x(hover) : 0;
  const flip = tipLeft > w * 0.62;
  const tooShort = n < 2;

  return (
    <div className="tx-pnl-card" style={{ padding: '0.9rem 1.1rem 0.6rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.64rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(236,239,245,0.5)' }}>
          {scale === 'cumulative' ? 'Cumulative' : 'Daily'} {isDapp ? 'volume by dApp' : 'volume'}
        </span>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <Seg options={viewOpts} value={view} onChange={(v) => setView(v as View)} />
          <Seg options={[['daily', 'Daily'], ['cumulative', 'Cumulative']]} value={scale} onChange={(v) => setScale(v as Scale)} />
        </div>
      </div>

      {/* dApp legend (clickable to toggle) */}
      {isDapp && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem 0.6rem', marginBottom: '0.5rem' }}>
          {names.map((nm, i) => {
            const off = hidden.has(nm);
            return (
              <button
                key={nm}
                onClick={() => toggle(nm)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', opacity: off ? 0.4 : 1 }}
              >
                <i style={{ width: 9, height: 9, borderRadius: 2, background: dappColor(nm, i), textDecoration: off ? 'line-through' : 'none' }} />
                <span style={{ fontSize: '0.68rem', color: 'rgba(236,239,245,0.75)', textDecoration: off ? 'line-through' : 'none' }}>{nm}</span>
              </button>
            );
          })}
        </div>
      )}

      <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
        {tooShort ? (
          <div style={{ height: H, display: 'flex', alignItems: 'center', color: 'var(--tx-text-muted)', fontSize: '0.8rem' }}>
            {isDapp ? 'The per-dApp split needs at least two days of attributed data.' : 'Pick a longer timeframe to see the chart.'}
          </div>
        ) : (
          <svg
            width={w}
            height={H}
            viewBox={`0 0 ${w} ${H}`}
            style={{ display: 'block', width: '100%', height: H, opacity: mounted ? 1 : 0, transition: 'opacity .5s ease' }}
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              {layers.map((L, li) => (
                <linearGradient key={li} id={`g-${uid}-${li}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={L.color} stopOpacity={layers.length > 1 ? 0.42 : 0.32} />
                  <stop offset="100%" stopColor={L.color} stopOpacity={layers.length > 1 ? 0.04 : 0} />
                </linearGradient>
              ))}
            </defs>

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

            {/* Stacked bands + top lines, bottom layer first */}
            {layers.map((L, li) => (
              <path key={`b${li}`} d={bandAt(li)} fill={`url(#g-${uid}-${li})`} />
            ))}
            {layers.map((L, li) => (
              <path key={`l${li}`} d={lineAt(li)} fill="none" stroke={L.color} strokeWidth={li === layers.length - 1 ? 2 : 1.6} strokeLinejoin="round" strokeLinecap="round" opacity={0.95} />
            ))}

            <circle cx={x(n - 1)} cy={y(rows[n - 1].tot)} r={3} fill={layers[layers.length - 1]?.color ?? TOTAL} />

            {xTicks.map((i) => (
              <text key={i} x={x(i)} y={H - 7} fill={AXIS} fontSize={10} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                {fmtDateAxis(rows[i].date, longSpan)}
              </text>
            ))}

            {hp && hover != null && (
              <g pointerEvents="none">
                <line x1={x(hover)} y1={padT} x2={x(hover)} y2={baseY} stroke="rgba(236,239,245,0.28)" strokeWidth={1} strokeDasharray="3 3" />
                {layers.map((L, li) => (
                  <circle key={li} cx={x(hover)} cy={y(sumUpTo(hp, li + 1))} r={3.5} fill={L.color} stroke="#0A0B0F" strokeWidth={1.5} />
                ))}
              </g>
            )}
          </svg>
        )}

        {hp && !tooShort && (
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
              minWidth: 150,
              boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
              backdropFilter: 'blur(6px)',
            }}
          >
            <div style={{ fontSize: '0.68rem', color: 'rgba(236,239,245,0.6)', marginBottom: 5 }}>{fmtDateFull(hp.date)}</div>
            {layers.length > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: '0.82rem', fontWeight: 700, marginBottom: 3 }}>
                <span style={{ color: 'rgba(236,239,245,0.7)' }}>Total</span>
                <span style={{ color: 'var(--tx-text)', fontVariantNumeric: 'tabular-nums' }}>{fmtUsd(hp.tot)}</span>
              </div>
            )}
            {[...layers].reverse().map((L) => (
              <div key={L.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: '0.74rem', marginTop: 2 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'rgba(236,239,245,0.65)' }}>
                  <i style={{ width: 7, height: 7, borderRadius: 2, background: L.color }} />
                  {L.label}
                </span>
                <span style={{ fontVariantNumeric: 'tabular-nums', color: 'rgba(236,239,245,0.92)' }}>{fmtUsd(hp.vals[L.key] ?? 0)}</span>
              </div>
            ))}
            {!isDapp && scale === 'daily' && (
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

function Seg({ options, value, onChange }: { options: Array<[string, string]>; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'inline-flex', background: 'rgba(236,239,245,0.05)', border: '1px solid var(--tx-border)', borderRadius: 8, padding: 2 }}>
      {options.map(([id, label]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          style={{
            padding: '0.28rem 0.55rem',
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
