'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import LensCrumb from '@/components/LensCrumb';
import LensCursor from '@/components/LensCursor';
import LensAurora from '@/components/LensAurora';
import BackToRenzu from '@/components/BackToRenzu';
import Changelog from '@/components/Changelog';
import { CURRENT_VERSION } from '@/data/changelog';

const ACCENT = '#F0B24A'; // Markets lens colour

interface Pulse {
  asOf: number;
  volumeAsOf: number | null;
  perpAsOf: number | null;
  bridgedAsOf: string | null;
  daysCounted: number;
  token: {
    injPrice: number | null;
    marketCap: number | null;
    supply: number | null;
    inflation: number | null;
    stakingApr: number | null;
    bondedInj: number | null;
    bondedRatio: number | null;
  };
  volume: {
    v24h: number | null;
    v7d: number | null;
    v30d: number | null;
    deriv24h: number | null;
    spot24h: number | null;
    weeklyChange: number | null;
  };
  burn: {
    cumulativeInj: number | null;
    roundsCovered: number | null;
    latestRound: number | null;
    latestInj: number | null;
    latestUsd: number | null;
  };
  capital: { stablecoinUsd: number | null; bridgedTvl: number | null; inflows24h: number | null };
  chain: {
    blockHeight: number | null;
    blockTimeSec: number | null;
    totalTxs: number | null;
    communityPoolInj: number | null;
    communityPoolUsd: number | null;
  };
  perps: {
    totalOiUsd: number | null;
    openPositions: number | null;
    activeMarkets: number | null;
    topTrader30dPnl: number | null;
    topTrader30dAddr: string | null;
    profitableTraders30d: number | null;
  };
}

// ── formatters ───────────────────────────────────────────────────────────────
function fmtUsd(n: number): string {
  const s = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(1)}K`;
  return `${s}$${a.toFixed(0)}`;
}
function usdWords(n: number): string {
  const s = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)} billion`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)} million`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(0)}K`;
  return `${s}$${a.toFixed(0)}`;
}
function injCompact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(a / 1e6).toFixed(2)}M INJ`;
  if (a >= 1e3) return `${(a / 1e3).toFixed(1)}K INJ`;
  return `${a.toFixed(0)} INJ`;
}
function injWords(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(a / 1e6).toFixed(2)} million INJ`;
  if (a >= 1e3) return `${(a / 1e3).toFixed(1)}K INJ`;
  return `${a.toFixed(0)} INJ`;
}
function numCompact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(a / 1e6).toFixed(0)}M`;
  if (a >= 1e3) return `${(a / 1e3).toFixed(0)}K`;
  return `${a}`;
}
function intWords(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(a / 1e9).toFixed(1)} billion`;
  if (a >= 1e6) return `${(a / 1e6).toFixed(0)} million`;
  if (a >= 1e3) return `${(a / 1e3).toFixed(0)}K`;
  return `${a}`;
}
function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
function pct(frac: number, dp = 1): string {
  return `${(frac * 100).toFixed(dp)}%`;
}
function fmtDate(ms: number | null): string {
  if (!ms) return 'today';
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateStr(s: string | null): string {
  if (!s) return 'today';
  const d = new Date(`${s}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
function shortAddr(a: string): string {
  return `${a.slice(0, 9)}…${a.slice(-5)}`;
}

// ── fact model ───────────────────────────────────────────────────────────────
type Tint = 'pos' | 'neg' | null;
interface Fact {
  key: string;
  label: string;
  display: string;
  sub: string;
  say: string; // the copy-ready sentence for this stat
  tint?: Tint;
  href?: string;
}
interface Section {
  title: string;
  note: string;
  facts: Fact[];
}

function buildSections(p: Pulse): Section[] {
  const secs: Section[] = [];
  const liveDate = fmtDate(p.asOf);
  const volDate = fmtDate(p.volumeAsOf);
  const capDate = fmtDateStr(p.bridgedAsOf);
  const perpDate = fmtDate(p.perpAsOf);

  // Token and network (live) ──────────────────────────────────────────────
  const tf: Fact[] = [];
  const t = p.token;
  if (t.injPrice != null) {
    tf.push({
      key: 'price', label: 'INJ price', display: `$${t.injPrice.toFixed(2)}`, sub: 'live from the chain',
      say: `INJ is trading at $${t.injPrice.toFixed(2)} on Injective, read live from the chain as of ${liveDate}.`,
    });
  }
  if (t.marketCap != null && t.supply != null) {
    tf.push({
      key: 'mcap', label: 'Market cap', display: fmtUsd(t.marketCap), sub: 'on live total supply',
      say: `Injective's market cap is ${usdWords(t.marketCap)}, priced on the live total supply of ${injWords(t.supply)} rather than the stale 100 million figure many trackers still use (as of ${liveDate}).`,
    });
  }
  if (t.supply != null) {
    tf.push({
      key: 'supply', label: 'INJ supply', display: `${(t.supply / 1e6).toFixed(1)}M INJ`, sub: 'total, circulating approx equal',
      say: `INJ total supply stands at ${injWords(t.supply)} as of ${liveDate}.`,
    });
  }
  if (t.bondedRatio != null && t.bondedInj != null) {
    tf.push({
      key: 'staked', label: 'Staked', display: pct(t.bondedRatio), sub: `${injCompact(t.bondedInj)} securing the chain`,
      say: `${pct(t.bondedRatio)} of INJ supply is staked, ${injWords(t.bondedInj)} securing the chain (as of ${liveDate}).`,
    });
  }
  if (t.stakingApr != null) {
    tf.push({
      key: 'apr', label: 'Staking APR', display: pct(t.stakingApr), sub: 'current reward rate',
      say: `The current INJ staking reward rate is ${pct(t.stakingApr)} APR (as of ${liveDate}).`,
    });
  }
  if (t.inflation != null) {
    tf.push({
      key: 'inflation', label: 'Inflation', display: pct(t.inflation), sub: 'trends down over time',
      say: `INJ inflation is currently ${pct(t.inflation)} and trends down over time (as of ${liveDate}).`,
    });
  }
  if (tf.length) secs.push({ title: 'Token and network', note: `Live, as of ${liveDate}`, facts: tf });

  // Trading volume (daily aggregate) ──────────────────────────────────────
  const vf: Fact[] = [];
  const v = p.volume;
  if (v.v30d != null) {
    vf.push({
      key: 'v30', label: '30-day volume', display: fmtUsd(v.v30d), sub: 'spot and perp, reconstructed',
      say: `Injective settled ${usdWords(v.v30d)} in spot and perpetual trading volume over the last 30 days, reconstructed trade by trade from the chain (as of ${volDate}).`,
    });
  }
  if (v.v7d != null) {
    vf.push({
      key: 'v7', label: '7-day volume', display: fmtUsd(v.v7d), sub: 'spot and perp',
      say: `Injective settled ${usdWords(v.v7d)} in trading volume over the last 7 days (as of ${volDate}).`,
    });
  }
  if (v.v24h != null) {
    vf.push({
      key: 'v24', label: '24-hour volume', display: fmtUsd(v.v24h), sub: 'spot and perp',
      say: `Injective settled ${usdWords(v.v24h)} in trading volume in the last 24 hours (as of ${volDate}).`,
    });
  }
  if (v.deriv24h != null && v.spot24h != null && v.deriv24h + v.spot24h > 0) {
    const dp = Math.round((v.deriv24h / (v.deriv24h + v.spot24h)) * 100);
    vf.push({
      key: 'split', label: 'Perp share (24h)', display: `${dp}% perp`, sub: `perp ${fmtUsd(v.deriv24h)} · spot ${fmtUsd(v.spot24h)}`,
      say: `Of Injective's last 24 hours of volume, ${usdWords(v.deriv24h)} was perpetuals and ${usdWords(v.spot24h)} was spot (as of ${volDate}).`,
    });
  }
  if (v.weeklyChange != null) {
    const up = v.weeklyChange >= 0;
    const ap = Math.abs(v.weeklyChange * 100).toFixed(0);
    vf.push({
      key: 'wow', label: 'Week over week', display: `${up ? '+' : '-'}${ap}%`, sub: 'this week vs prior week', tint: up ? 'pos' : 'neg',
      say: `Weekly trading volume is ${up ? 'up' : 'down'} ${ap}% versus the prior week (as of ${volDate}).`,
    });
  }
  if (vf.length) secs.push({ title: 'Trading volume', note: `On-chain, as of ${volDate} · ${p.daysCounted} days counted`, facts: vf });

  // INJ burn (live) ───────────────────────────────────────────────────────
  const bf: Fact[] = [];
  const b = p.burn;
  if (b.cumulativeInj != null) {
    const rounds = b.roundsCovered ?? 0;
    bf.push({
      key: 'burncum', label: 'INJ burned', display: injCompact(b.cumulativeInj), sub: `over ${rounds} rounds`,
      say: `${injWords(b.cumulativeInj)} has been permanently burned through Injective's buy-back-and-burn, over ${rounds} rounds.`,
    });
  }
  if (b.latestInj != null && b.latestRound != null) {
    const usdTail = b.latestUsd != null ? `, about ${usdWords(b.latestUsd)}` : '';
    bf.push({
      key: 'burnlast', label: 'Latest burn round', display: injCompact(b.latestInj),
      sub: `round ${b.latestRound}${b.latestUsd != null ? ` · ${fmtUsd(b.latestUsd)}` : ''}`,
      say: `Injective's most recent burn round (round ${b.latestRound}) removed ${injWords(b.latestInj)}${usdTail}.`,
    });
  }
  if (bf.length) secs.push({ title: 'INJ burn', note: 'Buy-back-and-burn, live', facts: bf });

  // Capital on Injective (bridged snapshot) ───────────────────────────────
  const cf: Fact[] = [];
  const c = p.capital;
  if (c.stablecoinUsd != null) {
    cf.push({
      key: 'stables', label: 'Stablecoins', display: fmtUsd(c.stablecoinUsd), sub: 'dollar-pegged, held on-chain',
      say: `${usdWords(c.stablecoinUsd)} of stablecoins are held on Injective (as of ${capDate}).`,
    });
  }
  if (c.bridgedTvl != null) {
    cf.push({
      key: 'bridged', label: 'Bridged assets', display: fmtUsd(c.bridgedTvl), sub: 'at market value',
      say: `${usdWords(c.bridgedTvl)} of bridged assets are held on Injective (as of ${capDate}).`,
    });
  }
  if (c.inflows24h != null) {
    const posv = c.inflows24h >= 0;
    cf.push({
      key: 'inflows', label: 'Net inflows (24h)', display: `${posv ? '+' : '-'}${fmtUsd(Math.abs(c.inflows24h))}`,
      sub: 'change in bridged value', tint: posv ? 'pos' : 'neg',
      say: `Bridged capital on Injective ${posv ? 'grew' : 'fell'} by ${usdWords(Math.abs(c.inflows24h))} in the last day (as of ${capDate}).`,
    });
  }
  if (cf.length) secs.push({ title: 'Capital on Injective', note: `Bridged snapshot, as of ${capDate}`, facts: cf });

  // Chain vitals (live) ───────────────────────────────────────────────────
  const nf: Fact[] = [];
  const ch = p.chain;
  if (ch.blockHeight != null) {
    nf.push({
      key: 'height', label: 'Block height', display: fmtInt(ch.blockHeight), sub: 'current head',
      say: `Injective is producing blocks at height ${fmtInt(ch.blockHeight)} (as of ${liveDate}).`,
    });
  }
  if (ch.blockTimeSec != null) {
    nf.push({
      key: 'blocktime', label: 'Block time', display: `${ch.blockTimeSec.toFixed(2)}s`, sub: 'time to finality',
      say: `Injective finalizes a block roughly every ${ch.blockTimeSec.toFixed(2)} seconds (as of ${liveDate}).`,
    });
  }
  if (ch.totalTxs != null) {
    nf.push({
      key: 'txs', label: 'Total transactions', display: numCompact(ch.totalTxs), sub: 'all time',
      say: `Injective has processed ${intWords(ch.totalTxs)} transactions all time (as of ${liveDate}).`,
    });
  }
  if (ch.communityPoolInj != null) {
    const usdTail = ch.communityPoolUsd != null ? `, about ${usdWords(ch.communityPoolUsd)}` : '';
    nf.push({
      key: 'pool', label: 'Community pool', display: injCompact(ch.communityPoolInj),
      sub: ch.communityPoolUsd != null ? fmtUsd(ch.communityPoolUsd) : 'on-chain treasury',
      say: `Injective's community pool holds ${injWords(ch.communityPoolInj)}${usdTail} (as of ${liveDate}).`,
    });
  }
  if (nf.length) secs.push({ title: 'Chain vitals', note: `Live, as of ${liveDate}`, facts: nf });

  // Perpetual markets (snapshot) ──────────────────────────────────────────
  const pf: Fact[] = [];
  const pp = p.perps;
  if (pp.totalOiUsd != null && pp.activeMarkets != null) {
    pf.push({
      key: 'oi', label: 'Open interest', display: fmtUsd(pp.totalOiUsd), sub: `${pp.activeMarkets} active markets`,
      say: `There is ${usdWords(pp.totalOiUsd)} in open interest live across ${pp.activeMarkets} Injective perpetual markets (as of ${perpDate}).`,
    });
  }
  if (pp.openPositions != null) {
    pf.push({
      key: 'openpos', label: 'Open positions', display: fmtInt(pp.openPositions), sub: 'live across all perps',
      say: `${fmtInt(pp.openPositions)} perpetual positions are open on Injective right now (as of ${perpDate}).`,
    });
  }
  if (pp.topTrader30dPnl != null && pp.topTrader30dPnl > 0) {
    pf.push({
      key: 'toptrader', label: 'Top trader (30d)', display: fmtUsd(pp.topTrader30dPnl),
      sub: pp.topTrader30dAddr ? shortAddr(pp.topTrader30dAddr) : 'realized net PnL', tint: 'pos',
      href: pp.topTrader30dAddr ? `/pnl/${pp.topTrader30dAddr}` : undefined,
      say: `The top perpetual trader on Injective is up ${usdWords(pp.topTrader30dPnl)} in realized PnL over the last 30 days (as of ${perpDate}).`,
    });
  }
  if (pf.length) secs.push({ title: 'Perpetual markets', note: `Markets snapshot, as of ${perpDate}`, facts: pf });

  return secs;
}

// ── page ─────────────────────────────────────────────────────────────────────
export default function PulsePage() {
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [data, setData] = useState<Pulse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/pulse')
      .then((res) => res.json().then((d) => ({ ok: res.ok, d })))
      .then(({ ok, d }) => {
        if (cancelled) return;
        if (!ok) setError(d.error ?? 'Could not load the Injective pulse.');
        else { setData(d as Pulse); setError(null); }
      })
      .catch(() => { if (!cancelled) setError('Network error, check your connection and try again.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const sections = useMemo(() => (data ? buildSections(data) : []), [data]);
  const factCount = useMemo(() => sections.reduce((n, s) => n + s.facts.length, 0), [sections]);

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setToast(label);
    } catch {
      setToast('Copy failed, select and copy manually.');
    }
    window.setTimeout(() => setToast(null), 1800);
  }

  function copyBrief() {
    if (!data) return;
    const header = `Injective on-chain brief, ${fmtDate(data.asOf)}`;
    const lines = sections.flatMap((s) => s.facts.map((f) => `- ${f.say}`));
    const text = `${header}\n\n${lines.join('\n')}\n\nRead from the Injective chain via renzu.xyz`;
    copy(text, `Full brief copied (${lines.length} stats)`);
  }

  const empty = data && factCount === 0;

  return (
    <main className="tx-main">
      <LensCursor />
      <LensAurora />

      <header className="tx-page-header" style={{ width: '100%', maxWidth: 960, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 0', borderBottom: '1px solid var(--tx-border)', marginBottom: '2rem' }}>
        <LensCrumb name="Injective Pulse" accent={ACCENT} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <span className="tx-footer">Injective Mainnet</span>
          <button className="tx-version-btn" onClick={() => setChangelogOpen(true)}>{CURRENT_VERSION}</button>
        </div>
      </header>

      {changelogOpen && <Changelog onClose={() => setChangelogOpen(false)} />}

      <div style={{ width: '100%', maxWidth: 960, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <BackToRenzu />
        <span className="tx-footer" style={{ opacity: 0.7 }}>
          {data ? `${factCount} facts · as of ${fmtDate(data.asOf)}` : ''}
        </span>
      </div>

      <div style={{ width: '100%', maxWidth: 960, marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.55rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--tx-text)' }}>
          The state of Injective, ready to quote
        </h1>
        <p style={{ margin: '0.5rem 0 0', color: 'var(--tx-text-muted)', fontSize: '0.9rem', maxWidth: '68ch', lineHeight: 1.55 }}>
          Every headline number on Injective in one place, each read straight from the chain and timestamped.
          Built for the moment someone asks you for a figure. Copy any single stat as a clean sentence, or grab
          the whole brief. Nothing here is estimated.
        </p>
      </div>

      {/* controls */}
      {data && !empty && (
        <div style={{ width: '100%', maxWidth: 960, marginBottom: '1.75rem', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '1rem', flexWrap: 'wrap' }}>
          <button
            onClick={copyBrief}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0.5rem 0.95rem', fontSize: '0.82rem',
              fontWeight: 600, cursor: 'pointer', borderRadius: 8, border: `1px solid ${ACCENT}`,
              background: 'color-mix(in srgb, ' + ACCENT + ' 14%, transparent)', color: 'var(--tx-text)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            Copy full brief
          </button>
        </div>
      )}

      {error && (
        <div style={{ width: '100%', maxWidth: 960 }}>
          <div className="tx-error-msg">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </div>
        </div>
      )}

      {loading && !data && (
        <div style={{ width: '100%', maxWidth: 960, padding: '1rem 0' }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="tx-skel" style={{ height: 22, width: '100%', marginBottom: 12, opacity: 1 - i * 0.12 }} />
          ))}
        </div>
      )}

      {empty && !loading && (
        <div style={{ width: '100%', maxWidth: 960, padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--tx-text-muted)', fontSize: '0.9rem', border: '1px solid var(--tx-border)', borderRadius: 12 }}>
          The pulse has no data yet. The volume, bridged and perp snapshots need to run at least once.
        </div>
      )}

      {/* sections */}
      {sections.map((sec) => (
        <section key={sec.title} style={{ width: '100%', maxWidth: 960, marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.85rem', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--tx-text)', margin: 0 }}>{sec.title}</h2>
            <span style={{ fontSize: '0.68rem', color: 'var(--tx-text-dim)', fontFamily: 'var(--font-mono)' }}>{sec.note}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(224px, 1fr))', gap: '0.75rem' }}>
            {sec.facts.map((f) => (
              <FactTile key={f.key} fact={f} onCopy={() => copy(f.say, 'Stat copied')} />
            ))}
          </div>
        </section>
      ))}

      {/* footer note */}
      {data && !empty && (
        <div style={{ width: '100%', maxWidth: 960, margin: '0.5rem 0 3rem' }}>
          <p style={{ fontSize: '0.72rem', color: 'var(--tx-text-dim)', lineHeight: 1.6, margin: 0, maxWidth: '72ch' }}>
            Volume, capital and perp figures come from stored snapshots that refresh on a schedule, so each
            section is timestamped with when it was last read. Price, supply and chain vitals are live.
          </p>
        </div>
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed', left: '50%', bottom: 28, transform: 'translateX(-50%)', zIndex: 60,
            padding: '0.6rem 1.1rem', borderRadius: 10, background: 'var(--tx-bg-card)',
            border: `1px solid ${ACCENT}`, color: 'var(--tx-text)', fontSize: '0.82rem', fontWeight: 600,
            boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
          }}
        >
          {toast}
        </div>
      )}
    </main>
  );
}

function FactTile({ fact, onCopy }: { fact: Fact; onCopy: () => void }) {
  const tintColor = fact.tint === 'pos' ? 'var(--tx-green)' : fact.tint === 'neg' ? 'var(--tx-red)' : 'var(--tx-text)';
  const value = (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.32rem', fontWeight: 700, color: tintColor, letterSpacing: '-0.01em', lineHeight: 1.1 }}>
      {fact.display}
    </span>
  );
  return (
    <div
      style={{
        position: 'relative', border: '1px solid var(--tx-border)', borderRadius: 12, padding: '0.85rem 0.9rem',
        background: 'var(--tx-bg-card)', display: 'flex', flexDirection: 'column', gap: '0.3rem', minHeight: 104,
      }}
    >
      <span style={{ fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--tx-text-muted)', fontFamily: 'var(--font-mono)' }}>
        {fact.label}
      </span>
      <div style={{ marginTop: '0.1rem' }}>
        {fact.href ? (
          <Link href={fact.href} style={{ textDecoration: 'none' }}>{value}</Link>
        ) : value}
      </div>
      <span style={{ fontSize: '0.72rem', color: 'var(--tx-text-dim)', lineHeight: 1.35, fontVariantNumeric: 'tabular-nums' }}>{fact.sub}</span>
      <button
        onClick={onCopy}
        aria-label="Copy this stat as a sentence"
        title="Copy as a sentence"
        style={{
          position: 'absolute', top: 8, right: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 26, height: 26, borderRadius: 7, border: '1px solid var(--tx-border)', background: 'transparent',
          color: 'var(--tx-text-muted)', cursor: 'pointer',
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      </button>
    </div>
  );
}
