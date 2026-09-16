'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import LensCrumb from '@/components/LensCrumb';
import LensCursor from '@/components/LensCursor';
import LensAurora from '@/components/LensAurora';
import BackToRenzu from '@/components/BackToRenzu';
import Changelog from '@/components/Changelog';
import { CURRENT_VERSION } from '@/data/changelog';
import type { FeedEvent } from '@/lib/feed/events';

// The publisher's tick runs every few minutes; polling a touch faster than
// that keeps the page feeling live without hammering a route that is only
// ever reading a Redis ring.
const POLL_MS = 30_000;

type Filter = 'all' | 'perp_open' | 'liquidation' | 'position_close';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'perp_open', label: 'Opens' },
  { id: 'liquidation', label: 'Liquidations' },
  { id: 'position_close', label: 'Closes' },
];

function fmtUsd(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (a >= 1_000) return `${sign}$${(a / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${sign}$${Math.round(a)}`;
}

function fmtPrice(n: number): string {
  if (n >= 1000) return `$${Math.round(n).toLocaleString('en-US')}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toPrecision(3)}`;
}

function fmtQty(n: number): string {
  if (n >= 1000) return Math.round(n).toLocaleString('en-US');
  return n.toFixed(3).replace(/\.?0+$/, '');
}

function ago(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// Colour and wording per event kind. A close is split on its result — banking
// a profit and cutting a loss are opposite stories and shouldn't look alike.
function kindMeta(e: FeedEvent): { icon: string; label: string; color: string } {
  if (e.kind === 'liquidation') {
    return { icon: '💀', label: 'Liquidated', color: 'var(--tx-red)' };
  }
  if (e.kind === 'position_close') {
    return (e.pnlUsd ?? 0) > 0
      ? { icon: '💰', label: 'Closed in profit', color: 'var(--tx-green)' }
      : { icon: '🩸', label: 'Cut at a loss', color: 'var(--tx-red-dim)' };
  }
  return { icon: '🐋', label: 'Position opened', color: 'var(--tx-cyan)' };
}

/** The middle line: whatever numbers this kind of event is actually about. */
function detailLine(e: FeedEvent): string {
  const parts: string[] = [];
  if (e.quantity != null) parts.push(`${fmtQty(e.quantity)} ${e.baseSymbol}`);
  if (e.price != null) {
    const verb = e.kind === 'perp_open' ? 'entry' : e.kind === 'liquidation' ? 'forced out at' : 'exit';
    parts.push(`${verb} ${fmtPrice(e.price)}`);
  }
  if (e.kind === 'perp_open' && e.marginUsd != null) {
    parts.push(`margin ${fmtUsd(e.marginUsd)} ${e.quoteSymbol}`);
  }
  if (e.kind !== 'perp_open' && e.pnlUsd != null) {
    parts.push(`${e.pnlUsd > 0 ? '+' : ''}${fmtUsd(e.pnlUsd)} realized`);
  }
  return parts.join(' · ');
}

function EventRow({ e, now, fresh }: { e: FeedEvent; now: number; fresh: boolean }) {
  const meta = kindMeta(e);
  const side = e.direction === 'short' ? 'Short' : e.direction === 'long' ? 'Long' : null;
  const lev = e.leverage ? `${e.leverage.toFixed(e.leverage >= 10 ? 0 : 1).replace(/\.0$/, '')}x` : null;
  const detail = detailLine(e);

  return (
    <article
      className={`tx-feed-row${e.tier === 'hero' ? ' tx-feed-row--hero' : ''}${fresh ? ' tx-feed-row--fresh' : ''}`}
      style={{ '--feed-accent': meta.color } as React.CSSProperties}
    >
      <div className="tx-feed-row-top">
        <span className="tx-feed-icon" aria-hidden="true">{meta.icon}</span>
        <span className="tx-feed-kind">{meta.label}</span>
        <span className="tx-feed-ticker">{e.ticker}</span>
        {side && <span className="tx-feed-side">{side}{lev ? ` ${lev}` : ''}</span>}
        {e.isTradFi && <span className="tx-feed-tag">tokenized</span>}
        {e.tier === 'hero' && <span className="tx-feed-tag tx-feed-tag--hero">hero</span>}
        <span className="tx-feed-notional">{fmtUsd(e.notionalUsd)}</span>
      </div>

      {detail && <div className="tx-feed-detail">{detail}</div>}
      {e.context && <p className="tx-feed-context">{e.context}</p>}

      <div className="tx-feed-row-foot">
        <time dateTime={new Date(e.executedAt).toISOString()}>{ago(e.executedAt, now)}</time>
        {e.hash && (
          <Link href={`/tx/0x${e.hash}`} className="tx-feed-decode">
            Decode this transaction →
          </Link>
        )}
      </div>
    </article>
  );
}

export default function FeedPage() {
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [events, setEvents] = useState<FeedEvent[] | null>(null);
  const [persistent, setPersistent] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [now, setNow] = useState(() => Date.now());

  // Order hashes present on the previous poll — anything new gets the arrival
  // highlight. Held in a ref so a re-render can't mark old rows fresh again,
  // and left empty on the first load so the whole page doesn't flash at once.
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/feed');
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not load the feed.');
        return;
      }
      const next: FeedEvent[] = Array.isArray(data.events) ? data.events : [];
      setError(null);
      setPersistent(data.persistent !== false);

      const known = seen.current;
      if (known) {
        const arrived = next.filter(e => !known.has(e.orderHash)).map(e => e.orderHash);
        if (arrived.length > 0) setFresh(new Set(arrived));
      }
      seen.current = new Set(next.map(e => e.orderHash));

      setEvents(next);
      setNow(Date.now());
    } catch {
      setError('Network error, retrying…');
    }
  }, []);

  useEffect(() => {
    let live = true;
    const tick = () => { if (live) void load(); };
    tick();
    const poll = setInterval(tick, POLL_MS);
    // A backgrounded tab keeps polling on some browsers and is throttled on
    // others, so refresh on the way back in rather than trusting the timer.
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    // Cheap clock so "4m ago" ages between polls.
    const clock = setInterval(() => { if (live) setNow(Date.now()); }, 30_000);
    return () => {
      live = false;
      clearInterval(poll);
      clearInterval(clock);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const shown = useMemo(
    () => (events ?? []).filter(e => filter === 'all' || e.kind === filter),
    [events, filter],
  );

  return (
    <main className="tx-main">
      <LensCursor />
      <LensAurora />
      <header
        className="tx-page-header"
        style={{
          width: '100%', maxWidth: 680, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', padding: '1.25rem 0',
          borderBottom: '1px solid var(--tx-border)', marginBottom: '2rem',
        }}
      >
        <LensCrumb name="Whale Feed" accent="#F0B24A" />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <span className="tx-footer">Injective Mainnet</span>
          <button className="tx-version-btn" onClick={() => setChangelogOpen(true)}>
            {CURRENT_VERSION}
          </button>
        </div>
      </header>

      {changelogOpen && <Changelog onClose={() => setChangelogOpen(false)} />}

      <div style={{ width: '100%', maxWidth: 680, marginBottom: '1.25rem' }}>
        <BackToRenzu />
      </div>

      <section className="tx-hero" style={{ marginBottom: '1.75rem' }}>
        <h1 className="tx-headline">
          Whale <span>feed</span>
        </h1>
        <p className="tx-subline">
          Large perp positions, liquidations and closes on Injective, the moment they settle, with
          every one decoded down to the transaction that made it
        </p>
      </section>

      <div style={{ width: '100%', maxWidth: 680 }}>
        <div className="tx-feed-bar">
          <div className="tx-feed-filters" role="group" aria-label="Filter events by kind">
            {FILTERS.map(f => (
              <button
                key={f.id}
                type="button"
                className={`tx-feed-filter${filter === f.id ? ' tx-feed-filter--on' : ''}`}
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
              >
                {f.label}
              </button>
            ))}
          </div>
          <span className="tx-feed-live">
            <span className="tx-feed-dot" aria-hidden="true" />
            live
          </span>
        </div>

        {error && (
          <div className="tx-error-msg" style={{ marginBottom: '1rem' }}>{error}</div>
        )}

        {!persistent && (
          <div className="tx-feed-note" style={{ marginBottom: '1rem' }}>
            The feed store isn’t configured on this deployment, so nothing is being kept between
            ticks. Set the Upstash credentials to turn this page on.
          </div>
        )}

        {!events && !error && (
          <div className="tx-pnl-card">
            <div className="tx-pnl-head">
              <span className="tx-pnl-head-title">Whale feed</span>
              <span className="tx-pnl-row-meta">
                <span className="tx-spinner" style={{ display: 'inline-block', verticalAlign: 'middle' }} /> loading recent events…
              </span>
            </div>
          </div>
        )}

        {events && shown.length === 0 && (
          <div className="tx-pnl-card">
            <div style={{ padding: '1rem 1.2rem', fontSize: '0.8rem', color: 'var(--tx-text)' }}>
              {events.length === 0
                ? 'Nothing has cleared the bar yet. The feed only posts trades large enough to matter, so quiet stretches are normal — this page refreshes itself.'
                : 'No events of that kind in the last few days. Try another filter.'}
            </div>
          </div>
        )}

        {shown.length > 0 && (
          <>
            <div style={{ fontSize: '0.72rem', color: 'var(--tx-text-muted)', marginBottom: '0.75rem' }}>
              {shown.length} event{shown.length === 1 ? '' : 's'} · newest first · last 7 days
            </div>
            {shown.map(e => (
              <EventRow key={e.orderHash} e={e} now={now} fresh={fresh.has(e.orderHash)} />
            ))}
            <div className="tx-feed-note" style={{ marginTop: '0.8rem' }}>
              Every event here was detected on-chain and published as it happened. The bar adapts to
              the day — a rolling percentile on top of fixed floors — so a quiet market lowers it and
              a busy one raises it, and one account can’t monopolize the feed. Position sizes are
              notional, not margin.
            </div>
          </>
        )}
      </div>

      <footer
        style={{
          marginTop: 'auto', padding: '2rem 0.75rem 1.5rem', display: 'flex', alignItems: 'center',
          justifyContent: 'center', flexWrap: 'wrap', gap: '0.55rem 1rem', textAlign: 'center',
        }}
      >
        <span className="tx-footer">Made by S!G</span>
        <span className="tx-footer" style={{ opacity: 0.4 }}>·</span>
        <a href="https://x.com/TxTranslator" target="_blank" rel="noopener noreferrer" className="tx-footer" style={{ textDecoration: 'none', opacity: 0.7 }}>
          Also posted to @TxTranslator ↗
        </a>
      </footer>
    </main>
  );
}
