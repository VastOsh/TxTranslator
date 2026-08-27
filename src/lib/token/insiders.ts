import { unstable_cache } from 'next/cache';
import { Buffer } from 'node:buffer';
import { fetchFirstFunder } from './launchpad';
import { hexToInj } from '../address';

// ── Cross-token insider / serial-funder tracker ─────────────────────────────
// The wallet-connection work on /token traces each token's top holders back to
// the wallet that first funded them. This aggregates that across the recent
// launchpad launches: a funder that seeded the top holders of MANY different
// tokens is a serial insider / market-maker fleet operator — a pattern no
// Injective explorer surfaces. Honest framing: recurring funding across tokens
// is a strong signal of coordinated activity, not proof of intent; each funder
// links to its own wallet profile so it can be inspected.

const PUMP_API = 'https://pump-api.trippyinj.xyz';
const SCAN_LAUNCHES = 30;   // recent launches to pull
const TOP_HOLDERS = 6;      // top real holders per launch we trace
const MIN_LAUNCHES = 2;     // a funder must recur to count as serial

/* eslint-disable @typescript-eslint/no-explicit-any */
async function apiJson(path: string): Promise<any | null> {
  try {
    const res = await fetch(`${PUMP_API}${path}`, {
      headers: { Accept: 'application/json', Origin: 'https://pump.trippyinj.xyz' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function symbolOf(launch: any): string {
  try {
    const uri: string = launch?.metadataURI ?? '';
    const b64 = uri.split(',')[1];
    if (!b64) return '';
    const meta = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    return typeof meta?.symbol === 'string' ? meta.symbol : '';
  } catch {
    return '';
  }
}

export interface SerialFunderToken {
  id: string;
  onchainId: string;
  symbol: string;
}

export interface SerialFunder {
  funder: string;        // inj1 wallet that funded top holders across launches
  launchCount: number;   // number of distinct launches it seeded
  tokens: SerialFunderToken[];
}

async function scanSerialFunders(): Promise<SerialFunder[]> {
  const list = await apiJson(`/launches?limit=${SCAN_LAUNCHES}`);
  const launches: any[] = (Array.isArray(list) ? list : list?.items ?? [])
    .filter((l: any) => Number(l?.userHolderCount ?? 0) >= 4);

  // funder(inj1) → Map<launchId, token>
  const byFunder = new Map<string, Map<string, SerialFunderToken>>();

  // Bounded parallelism across launches; funder lookups within a launch run together.
  const CONCURRENCY = 4;
  let next = 0;
  async function worker() {
    while (next < launches.length) {
      const l = launches[next++];
      const holders = await apiJson(`/launches/${l.id}/holders?limit=20`);
      const real: any[] = (holders?.items ?? []).filter((h: any) => !h.label).slice(0, TOP_HOLDERS);
      const token: SerialFunderToken = { id: String(l.id), onchainId: String(l.onchainId ?? ''), symbol: symbolOf(l) };
      const funders = await Promise.all(
        real.map(async (h) => {
          const inj = hexToInj(String(h.address));
          return inj ? fetchFirstFunder(inj) : null;
        }),
      );
      for (const f of funders) {
        if (!f) continue;
        if (!byFunder.has(f)) byFunder.set(f, new Map());
        byFunder.get(f)!.set(token.id, token);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, launches.length) }, worker));

  const out: SerialFunder[] = [];
  for (const [funder, tokens] of byFunder) {
    if (tokens.size < MIN_LAUNCHES) continue;
    out.push({ funder, launchCount: tokens.size, tokens: [...tokens.values()] });
  }
  out.sort((a, b) => b.launchCount - a.launchCount);
  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Cached serial-funder leaderboard (rebuilt hourly; heavy cross-launch scan). */
export const getSerialFunders = unstable_cache(scanSerialFunders, ['serial-funders-v1'], {
  revalidate: 3600,
});

/**
 * Look specific funders up in the cached index, bounded by a timeout so a cold
 * index never blocks the caller (e.g. a /token check). On timeout the cache
 * build continues in the background and this returns empty — the annotation is
 * simply skipped this time, never wrong.
 */
export async function lookupSerialFunders(
  funders: string[],
  timeoutMs = 4000,
): Promise<Map<string, SerialFunder>> {
  const want = new Set(funders);
  const result = new Map<string, SerialFunder>();
  if (want.size === 0) return result;
  const list = await Promise.race([
    getSerialFunders(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
  if (!list) return result;
  for (const sf of list) if (want.has(sf.funder)) result.set(sf.funder, sf);
  return result;
}
