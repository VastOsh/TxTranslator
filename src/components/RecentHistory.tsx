'use client';

import type { RecentTx } from '@/hooks/useRecentTxs';

interface Props {
  recent: RecentTx[];
  onSelect: (hash: string) => void;
  onClear: () => void;
}

function categoryColor(category: string, status: string): string {
  if (status === 'failed') return 'var(--tx-red)';
  switch (category) {
    case 'TRADE':  return 'var(--tx-cyan)';
    case 'STAKE':
    case 'REDELEGATE': return 'var(--tx-green)';
    case 'UNSTAKE': return 'var(--tx-amber)';
    case 'VOTE':
    case 'PROPOSE':
    case 'GOV_DEPOSIT': return 'var(--tx-purple)';
    case 'BRIDGE': return 'var(--tx-cyan)';
    default: return 'var(--tx-text-muted)';
  }
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

export default function RecentHistory({ recent, onSelect, onClear }: Props) {
  if (recent.length === 0) return null;

  return (
    <div className="tx-recent-wrap">
      <div className="tx-recent-header">
        <span className="tx-recent-label">
          <span className="tx-recent-glyph">◷</span>
          Recent
        </span>
        <button className="tx-recent-clear" onClick={onClear}>
          Clear
        </button>
      </div>
      <ul className="tx-recent-list">
        {recent.map(tx => (
          <li key={tx.hash} className="tx-recent-row">
            <span
              className="tx-recent-dot"
              style={{ background: categoryColor(tx.txCategory, tx.status) }}
            />
            <span className="tx-recent-action">
              {tx.action.length > 52 ? tx.action.slice(0, 51) + '…' : tx.action}
            </span>
            {tx.protocol && (
              <span className="tx-recent-protocol">{tx.protocol}</span>
            )}
            <span className="tx-recent-hash">{shortHash(tx.hash)}</span>
            <span className="tx-recent-time">{relativeTime(tx.decodedAt)}</span>
            <button
              className="tx-recent-arrow"
              onClick={() => onSelect(tx.hash)}
              aria-label={`Re-decode ${tx.hash}`}
            >
              →
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
