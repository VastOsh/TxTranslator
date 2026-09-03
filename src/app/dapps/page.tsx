'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import LensCrumb from '@/components/LensCrumb';
import DappDirectory from '@/components/DappDirectory';
import Changelog from '@/components/Changelog';
import { CURRENT_VERSION } from '@/data/changelog';
import type { DappSummary } from '@/lib/dapps/registry';

function DirectorySkeleton() {
  return (
    <div className="tx-dapp-grid" style={{ width: '100%', maxWidth: 680 }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="tx-skel-card" style={{ gap: '0.6rem' }}>
          <div className="tx-skel" style={{ height: 16, width: '55%' }} />
          <div className="tx-skel" style={{ height: 11, width: '90%' }} />
          <div className="tx-skel" style={{ height: 22, width: '70%' }} />
        </div>
      ))}
    </div>
  );
}

export default function DappsPage() {
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [dapps, setDapps] = useState<DappSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/dapps')
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) setError(data.error ?? 'Could not load the dApp directory.');
        else setDapps(data.dapps as DappSummary[]);
      })
      .catch(() => { if (!cancelled) setError('Network error — check your connection and try again.'); });
    return () => { cancelled = true; };
  }, []);

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
        <LensCrumb name="dApp Directory" accent="#E77BA6" />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <span className="tx-footer">Injective Mainnet</span>
          <button className="tx-version-btn" onClick={() => setChangelogOpen(true)}>
            {CURRENT_VERSION}
          </button>
        </div>
      </header>

      {changelogOpen && <Changelog onClose={() => setChangelogOpen(false)} />}

      <div style={{ width: '100%', maxWidth: 680, marginBottom: '1.5rem' }}>
        <Link href="/" className="tx-back-link">← Decode a transaction</Link>
        <h1 className="tx-headline" style={{ fontSize: '1.9rem', marginTop: '1rem' }}>
          Injective <span>dApps</span>
        </h1>
      </div>

      {error && (
        <div style={{ width: '100%', maxWidth: 680 }}>
          <div className="tx-error-msg">{error}</div>
        </div>
      )}

      {!dapps && !error && <DirectorySkeleton />}
      {dapps && <DappDirectory dapps={dapps} />}

      <footer
        style={{
          marginTop: 'auto',
          padding: '2.5rem 0 1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
        }}
      >
        <span className="tx-footer">Made by S!G</span>
        <span className="tx-footer" style={{ opacity: 0.4 }}>·</span>
        <span className="tx-footer">Injective</span>
      </footer>
    </main>
  );
}
