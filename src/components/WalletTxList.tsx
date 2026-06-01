'use client';

import Link from 'next/link';

export interface WalletTx {
  hash: string;
  timestamp: string;
  messageType: string;
  actionLabel: string;
  status: 'success' | 'failed';
  protocol: string | null;
}

interface Props {
  address: string;
  txs: WalletTx[];
}

function relativeTime(iso: string): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (isNaN(diff) || diff < 0) return '—';
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function WalletTxList({ address, txs }: Props) {
  const shortAddr = `${address.slice(0, 10)}…${address.slice(-6)}`;

  return (
    <div className="tx-wallet-wrap">
      <div className="tx-wallet-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="tx-wallet-addr">{shortAddr}</span>
        </div>
        <span className="tx-wallet-count">
          {txs.length > 0 ? `${txs.length} recent transactions` : 'No transactions found'}
        </span>
      </div>

      {txs.length === 0 ? (
        <div className="tx-wallet-empty">
          No transactions found for this address on Injective mainnet.
        </div>
      ) : (
        <ul className="tx-wallet-list">
          {txs.map((tx) => (
            <li key={tx.hash} className="tx-wallet-row">
              <div className="tx-wallet-row-left">
                <span className={`tx-wallet-dot${tx.status === 'failed' ? ' tx-wallet-dot--fail' : ''}`} />
                <div className="tx-wallet-info">
                  <div className="tx-wallet-action-row">
                    <span className="tx-wallet-action">{tx.actionLabel}</span>
                    {tx.protocol && (
                      <span className="tx-wallet-protocol">{tx.protocol}</span>
                    )}
                  </div>
                  <span className="tx-wallet-time">{relativeTime(tx.timestamp)}</span>
                </div>
              </div>
              <Link href={`/tx/${tx.hash}?wallet=${address}`} className="tx-wallet-decode-btn">
                Decode →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
