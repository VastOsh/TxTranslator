'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import LensCrumb from '@/components/LensCrumb';
import LensCursor from '@/components/LensCursor';
import LensAurora from '@/components/LensAurora';
import BackToRenzu from '@/components/BackToRenzu';
import TranslationResult from '@/components/TranslationResult';
import InjChart from '@/components/InjChart';
import Changelog from '@/components/Changelog';
import { useRecentTxs } from '@/hooks/useRecentTxs';
import { CURRENT_VERSION } from '@/data/changelog';
import type { TranslationResponse } from '@/types';

function LoadingSkeleton() {
  return (
    <div className="tx-skel-wrap">
      <div className="tx-skel-card">
        <div className="tx-skel" style={{ height: 10, width: '40%' }} />
        <div className="tx-skel" style={{ height: 22, width: '85%' }} />
        <div className="tx-skel" style={{ height: 18, width: '60%' }} />
      </div>
      <div className="tx-skel-card">
        <div className="tx-skel" style={{ height: 10, width: '30%' }} />
        <div className="tx-skel" style={{ height: 18, width: '50%' }} />
      </div>
      <div className="tx-skel-card">
        <div className="tx-skel" style={{ height: 10, width: '35%' }} />
        <div className="tx-skel" style={{ height: 14, width: '95%' }} />
        <div className="tx-skel" style={{ height: 14, width: '70%' }} />
      </div>
    </div>
  );
}

export default function TxPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const hash = typeof params.hash === 'string' ? params.hash : '';
  const viewerAddress = searchParams.get('wallet') ?? undefined;

  const [changelogOpen, setChangelogOpen] = useState(false);
  const [result, setResult] = useState<TranslationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { addRecent } = useRecentTxs();

  useEffect(() => {
    if (!hash) {
      setError('No transaction hash provided.');
      setLoading(false);
      return;
    }

    fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash, ...(viewerAddress ? { viewerAddress } : {}) }),
    })
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setError(data.error ?? 'Something went wrong. Please try again.');
        } else {
          const tx = data as TranslationResponse;
          setResult(tx);
          addRecent({
            hash: tx.hash,
            action: tx.action,
            txCategory: tx.txCategory,
            protocol: tx.protocol,
            status: tx.status,
          });
        }
      })
      .catch(() => setError('Network error, check your connection and try again.'))
      .finally(() => setLoading(false));
  }, [hash, addRecent]);

  return (
    <main className="tx-main">
      <LensCursor />
      <LensAurora />
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
        <LensCrumb name="TxTranslator" accent="#35C9BE" />
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

      {loading && <LoadingSkeleton />}

      {error && (
        <div style={{ width: '100%', maxWidth: 680 }}>
          <div className="tx-error-msg">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </div>
          <div style={{ marginTop: '1rem' }}>
            <BackToRenzu />
          </div>
        </div>
      )}

      {result && (
        <>
          <TranslationResult data={result} />
          <div style={{
            marginTop: '0.75rem',
            padding: '0.55rem 0.85rem',
            borderRadius: '6px',
            background: 'rgba(251, 146, 60, 0.08)',
            border: '1px solid rgba(251, 146, 60, 0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            fontSize: '0.7rem',
            color: 'rgba(251, 146, 60, 0.85)',
            letterSpacing: '0.02em',
            width: '100%',
            maxWidth: 680,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}>
            <span style={{ fontSize: '0.75rem' }}>⚠</span>
            AI-generated insights may contain inaccuracies, this tool is in active development.
          </div>
        </>
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
          href="https://x.com/SiGPRMR"
          target="_blank"
          rel="noopener noreferrer"
          className="tx-footer"
          style={{ textDecoration: 'none', opacity: 0.7 }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '0.7')}
        >
          Contact me ↗
        </a>
        <span className="tx-footer" style={{ opacity: 0.4 }}>·</span>
        <a
          href="https://github.com/VastOsh/TxTranslator"
          target="_blank"
          rel="noopener noreferrer"
          className="tx-footer"
          style={{ textDecoration: 'none', opacity: 0.7 }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '0.7')}
        >
          GitHub ↗
        </a>
        <span className="tx-footer" style={{ opacity: 0.4 }}>·</span>
        <span className="tx-footer">Injective</span>
      </footer>
    </main>
  );
}
