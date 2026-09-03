'use client';

import { use, useState, useEffect } from 'react';
import LensCrumb from '@/components/LensCrumb';
import BackToRenzu from '@/components/BackToRenzu';
import PnlDashboard, { type PnlRangeKey } from '@/components/PnlDashboard';
import InjChart from '@/components/InjChart';
import Changelog from '@/components/Changelog';
import { CURRENT_VERSION } from '@/data/changelog';
import type { PnlReport } from '@/lib/pnl/aggregate';

const ADDR_RE = /^inj1[a-z0-9]{38}$/;

function PnlSkeleton() {
  return (
    <div className="tx-skel-wrap">
      <div className="tx-skel-card">
        <div className="tx-skel" style={{ height: 10, width: '30%' }} />
        <div className="tx-skel" style={{ height: 32, width: '55%' }} />
        <div className="tx-skel" style={{ height: 12, width: '80%' }} />
        <div className="tx-skel" style={{ height: 76, width: '100%' }} />
      </div>
      <div className="tx-skel-card">
        <div className="tx-skel" style={{ height: 10, width: '25%' }} />
        <div className="tx-skel" style={{ height: 16, width: '70%' }} />
        <div className="tx-skel" style={{ height: 16, width: '60%' }} />
      </div>
    </div>
  );
}

export default function PnlPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);

  const [changelogOpen, setChangelogOpen] = useState(false);
  const [report, setReport] = useState<PnlReport | null>(null);
  const [range, setRange] = useState<PnlRangeKey>('7d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const validAddress = ADDR_RE.test(address);

  useEffect(() => {
    if (!validAddress) return;
    // A range switch can land while the previous request is still in flight;
    // the stale response must not overwrite the newer one.
    let cancelled = false;

    fetch('/api/pnl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, range }),
    })
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) setError(data.error ?? 'Could not build the PnL report.');
        else setReport(data.report as PnlReport);
      })
      .catch(() => {
        if (!cancelled) setError('Network error, check your connection and try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [address, validAddress, range]);

  function handleRangeChange(r: PnlRangeKey) {
    if (r === range) return;
    setLoading(true);
    setError(null);
    setRange(r);
  }

  const shownError = validAddress ? error : 'That is not a valid inj1… address.';
  const short = `${address.slice(0, 12)}…${address.slice(-8)}`;

  return (
    <main className="tx-main">
      <header
        className="tx-page-header"
        style={{
          width: '100%',
          maxWidth: 680,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1.25rem 0',
          borderBottom: '1px solid var(--tx-border)',
          marginBottom: '2rem',
        }}
      >
        <LensCrumb name="Perp PnL" accent="#35C9BE" />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <span className="tx-footer">Injective Mainnet</span>
          <button className="tx-version-btn" onClick={() => setChangelogOpen(true)}>
            {CURRENT_VERSION}
          </button>
        </div>
      </header>

      {changelogOpen && <Changelog onClose={() => setChangelogOpen(false)} />}

      <div
        style={{
          width: '100%',
          maxWidth: 680,
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <BackToRenzu />
        <span className="tx-wallet-addr">{short}</span>
      </div>

      {loading && !report && validAddress && <PnlSkeleton />}

      {shownError && (
        <div style={{ width: '100%', maxWidth: 680 }}>
          <div className="tx-error-msg">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {shownError}
          </div>
        </div>
      )}

      {report && (
        <PnlDashboard report={report} range={range} onRangeChange={handleRangeChange} loading={loading} />
      )}

      <InjChart />

      <footer
        style={{
          marginTop: 'auto',
          padding: '2rem 0 1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
        }}
      >
        <span className="tx-footer">Made by S!G</span>
        <span className="tx-footer" style={{ opacity: 0.4 }}>·</span>
        <a
          href="https://x.com/TxTranslator"
          target="_blank"
          rel="noopener noreferrer"
          className="tx-footer"
          style={{ textDecoration: 'none', opacity: 0.7 }}
        >
          Whale feed @TxTranslator ↗
        </a>
        <span className="tx-footer" style={{ opacity: 0.4 }}>·</span>
        <span className="tx-footer">Injective</span>
      </footer>
    </main>
  );
}
