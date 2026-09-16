import { getLaunchByToken } from './evm';
import { analyzeLaunchHolders, type LaunchpadHolders } from './launchpad';

// ── Sprout launchpad (ex-Trippy), EVM era ──────────────────────────────────
// Sprout mints native EVM ERC-20s. The token's launch record + holder
// distribution live on the same backend shape as the old Trippy pump-api, so
// the holder/cluster/sell-impact analysis is reused verbatim (analyzeLaunchHolders).
// The only new step is resolving a token contract to its launch: the core
// registry's getLaunchByToken(address) view returns the onchainId.
// See project_sprout_evm_tokens for the reverse-engineering.

const SPROUT_API = 'https://api.trysprout.fun';
// The Sprout core/registry that indexes launches by token address. Verified to
// resolve live launches (WINJ 0x27c2… -> 10011). A token not registered here
// (an older core, or graduated off-curve) makes getLaunchByToken revert, and we
// fall back to EVM identity only.
const SPROUT_CORE = '0x1333692eb905823df110762525c26f7489bb9300';

/* eslint-disable @typescript-eslint/no-explicit-any */
async function apiJson(path: string): Promise<any | null> {
  try {
    const res = await fetch(`${SPROUT_API}${path}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface SproutInfo {
  onchainId: string;
  launchId: string;
  creator: string | null;      // deployer, EVM hex
  flagged: boolean;
  impersonates: string | null;
  graduated: boolean;
  onCurve: boolean;
  createdAt: number;           // unix seconds
  holders: LaunchpadHolders | null;
}

function isoToUnix(s: unknown): number {
  if (typeof s !== 'string') return 0;
  const t = Date.parse(s);
  return Number.isFinite(t) ? Math.floor(t / 1000) : 0;
}

/**
 * Resolve an EVM token contract to its Sprout launch and read its rug-risk
 * state. Returns null when the token is not a Sprout launch on the known core
 * (getLaunchByToken reverts) — the caller then shows EVM identity only.
 * `totalSupplyRaw` is the EVM totalSupply(), used as the % denominator.
 */
export async function fetchSproutInfo(
  tokenAddr: string,
  totalSupplyRaw: string,
  opts: { clusterBudgetMs?: number } = {},
): Promise<SproutInfo | null> {
  const onchainId = await getLaunchByToken(SPROUT_CORE, tokenAddr);
  if (!onchainId) return null;

  const launch = await apiJson(`/launches/by-onchain/${onchainId}`);
  const launchId = launch?.id;
  if (launchId == null) return null;

  const [count, holders] = await Promise.all([
    apiJson(`/launches/${launchId}/holders/count`),
    apiJson(`/launches/${launchId}/holders?limit=100`),
  ]);

  const holdersAnalysis = await analyzeLaunchHolders(launch, count, holders, totalSupplyRaw, opts);

  const graduated = launch.graduatedPoolAddress != null || Number(launch.state) === 4;

  return {
    onchainId: String(onchainId),
    launchId: String(launchId),
    creator: typeof launch.creator === 'string' ? launch.creator : null,
    flagged: Boolean(launch.flagged),
    impersonates: launch.impersonates ? String(launch.impersonates) : null,
    graduated,
    onCurve: !graduated,
    createdAt: isoToUnix(launch.createdAt),
    holders: holdersAnalysis,
  };
}
