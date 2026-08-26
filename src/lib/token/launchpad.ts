import { Buffer } from 'node:buffer';

// ── Trippy launchpad (choice_mts issuer) — per-token rug-risk state ─────────
// pump.trippyinj mints every token through one CosmWasm issuer contract, which
// is therefore the factory-denom creator of every launch. That contract exposes
// per-token state we can turn into honest, sourced rug-risk signals:
//   • launch_by_denom(denom)          → status, admin_renounced, evm_authority, age
//   • launches({ evm_authority })     → every token that same dev launched
// The dev's own supply share comes from a normal bank balance query. Cosmos-side
// holder *enumeration* is disabled chain-wide, so a full holder map isn't
// possible — but the launch wallet's share (usually ~all of a pre-graduation
// token) is the single most useful concentration number and is directly queryable.

export const LAUNCHPAD_ISSUER = 'inj13j2rpnlwl30c02d4pzukykwfeyyhelvry9cqte';

const LCDS = [
  'https://sentry.lcd.injective.network',
  'https://injective-api.polkachu.com',
  'https://injective-rest.publicnode.com',
];

/* eslint-disable @typescript-eslint/no-explicit-any */
async function lcdJson(path: string): Promise<any | null> {
  for (const lcd of LCDS) {
    try {
      const res = await fetch(`${lcd}${path}`, { signal: AbortSignal.timeout(8_000) });
      if (!res.ok) continue;
      return await res.json();
    } catch {
      continue;
    }
  }
  return null;
}

async function smart(query: Record<string, unknown>): Promise<any | null> {
  const b64 = Buffer.from(JSON.stringify(query)).toString('base64');
  const j = await lcdJson(`/cosmwasm/wasm/v1/contract/${LAUNCHPAD_ISSUER}/smart/${b64}`);
  return j?.data ?? null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Is this denom one minted by the Trippy launchpad? (creator = the issuer.) */
export function isLaunchpadDenom(creator: string | null): boolean {
  return creator === LAUNCHPAD_ISSUER;
}

export interface LaunchInfo {
  status: string;          // 'registered' (on curve) | 'delivered' | …
  adminRenounced: boolean; // can more supply still be minted?
  evmAuthority: string;    // the real dev/launch wallet
  registeredAt: number;    // unix seconds
  graduated: boolean;      // choice_factory set = live on a real market
  totalSupplyRaw: string;
}

export async function fetchLaunchInfo(denom: string): Promise<LaunchInfo | null> {
  const x = await smart({ launch_by_denom: { denom } });
  if (!x) return null;
  return {
    status: String(x.status ?? ''),
    adminRenounced: Boolean(x.admin_renounced),
    evmAuthority: String(x.evm_authority ?? ''),
    registeredAt: Number(x.registered_at) || 0,
    graduated: x.choice_factory != null,
    totalSupplyRaw: String(x.total_supply ?? '0'),
  };
}

export interface DevRecord {
  total: number;
  graduated: number; // reached a real market
  onLaunchpad: number; // still registered/delivered on the launchpad
}

export async function fetchDevRecord(evmAuthority: string): Promise<DevRecord | null> {
  if (!evmAuthority) return null;
  const d = await smart({ launches: { evm_authority: evmAuthority } });
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const arr: any[] = Array.isArray(d) ? d : Array.isArray(d?.launches) ? d.launches : [];
  if (!arr.length) return null;
  let graduated = 0;
  for (const l of arr) if (l?.choice_factory != null) graduated++;
  return { total: arr.length, graduated, onLaunchpad: arr.length - graduated };
}

/** The launch wallet's share of supply, as a percentage (0–100), or null. */
export async function fetchAuthorityHoldingPct(
  denom: string,
  authority: string,
  totalSupplyRaw: string,
): Promise<number | null> {
  if (!authority) return null;
  const enc = encodeURIComponent(denom);
  const j = await lcdJson(`/cosmos/bank/v1beta1/balances/${authority}/by_denom?denom=${enc}`);
  const amt = j?.balance?.amount;
  if (amt == null) return null;
  try {
    const supply = BigInt(totalSupplyRaw);
    if (supply <= BigInt(0)) return null;
    return Number((BigInt(amt) * BigInt(10000)) / supply) / 100;
  } catch {
    return null;
  }
}
