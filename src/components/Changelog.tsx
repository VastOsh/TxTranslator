'use client';

import { useEffect, useRef } from 'react';
import { CHANGELOG, CURRENT_VERSION, type EntryType } from '@/data/changelog';

const BADGE: Record<EntryType, { cls: string; label: string }> = {
  critical:    { cls: 'tx-badge tx-badge-red',   label: 'Critical' },
  fix:         { cls: 'tx-badge tx-badge-green',  label: 'Fix' },
  improvement: { cls: 'tx-badge tx-badge-amber',  label: 'Improvement' },
  feature:     { cls: 'tx-badge tx-badge-cyan',   label: 'Feature' },
};

interface Props {
  onClose: () => void;
}

export default function Changelog({ onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      className="tx-cl-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Changelog"
    >
      <div className="tx-cl-panel" ref={panelRef}>
        {/* Header */}
        <div className="tx-cl-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span className="tx-cl-title">CHANGELOG</span>
            <span className="tx-badge tx-badge-cyan" style={{ fontSize: '0.65rem' }}>
              {CURRENT_VERSION}
            </span>
          </div>
          <button className="tx-cl-close" onClick={onClose} aria-label="Close changelog">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Legend */}
        <div className="tx-cl-legend">
          {(Object.entries(BADGE) as [EntryType, { cls: string; label: string }][]).map(([, b]) => (
            <span key={b.label} className={b.cls} style={{ fontSize: '0.62rem' }}>{b.label}</span>
          ))}
        </div>

        {/* Versions */}
        <div className="tx-cl-body">
          {CHANGELOG.map(ver => (
            <section key={ver.version} className="tx-cl-version">
              <div className="tx-cl-version-header">
                <span className="tx-cl-ver-num">{ver.version}</span>
                <span className="tx-cl-ver-date">{ver.date}</span>
              </div>
              <ul className="tx-cl-entries">
                {ver.entries.map((entry, i) => {
                  const b = BADGE[entry.type];
                  return (
                    <li key={i} className="tx-cl-entry">
                      <span className={b.cls} style={{ fontSize: '0.6rem', flexShrink: 0 }}>
                        {b.label}
                      </span>
                      <span className="tx-cl-entry-text">{entry.text}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
