'use client';

import Link from 'next/link';
import type { DappSummary } from '@/lib/dapps/registry';

interface Props {
  dapps: DappSummary[];
}

function compactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

/** Days since last activity, or null when never active. */
function daysSince(ts: number): number | null {
  if (!ts) return null;
  return Math.floor((Date.now() - ts) / 86_400_000);
}

function liveLabel(days: number | null): { text: string; stale: boolean } {
  if (days === null) return { text: 'no activity', stale: true };
  if (days === 0) return { text: 'active today', stale: false };
  if (days === 1) return { text: 'active 1d ago', stale: false };
  if (days <= 7) return { text: `active ${days}d ago`, stale: false };
  return { text: `${days}d idle`, stale: true };
}

export default function DappDirectory({ dapps }: Props) {
  return (
    <div className="tx-dapp-wrap">
      <p className="tx-dapp-intro">
        Protocols Tx·Translator recognises on Injective, with lifetime on-chain contract executions
        and last-active status pulled live from the wasm registry. Execution counts measure direct
        contract calls — for orderbook venues like Helix, most trading flows through the exchange
        module rather than a contract, so the number understates real usage.
      </p>

      <div className="tx-dapp-grid">
        {dapps.map(d => {
          const days = daysSince(d.lastActiveAt);
          const live = liveLabel(days);
          return (
            <Link key={d.slug} href={`/dapps/${d.slug}`} className="tx-dapp-card">
              <div className="tx-dapp-card-head">
                <span className="tx-dapp-name">{d.name}</span>
                <span className="tx-dapp-live">
                  <span className={`tx-dapp-live-dot${live.stale ? ' tx-dapp-live-dot--stale' : ''}`} />
                  {live.text}
                </span>
              </div>

              {d.description && <span className="tx-dapp-desc">{d.description}</span>}

              <div className="tx-dapp-metrics">
                <div className="tx-dapp-metric">
                  <span className="tx-dapp-metric-value">{compactCount(d.totalExecutions)}</span>
                  <span className="tx-dapp-metric-label">Executions</span>
                </div>
                <div className="tx-dapp-metric">
                  <span className="tx-dapp-metric-value">
                    {d.resolvedContracts}
                    {d.resolvedContracts !== d.contractCount && (
                      <span style={{ color: 'var(--tx-text-dim)' }}> / {d.contractCount}</span>
                    )}
                  </span>
                  <span className="tx-dapp-metric-label">
                    {d.unresolvedContracts > 0 ? `Contracts · ${d.unresolvedContracts} unreachable` : 'Contracts'}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
