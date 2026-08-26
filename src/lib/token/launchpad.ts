import { Buffer } from 'node:buffer';

// ── Trippy launchpad (choice_mts) — per-token rug-risk state ────────────────
// pump.trippyinj mints every token through one CosmWasm issuer contract, which
// is therefore the factory-denom creator of every launch. Two data sources:
//  1. the issuer contract, for mint-authority + stage (on-chain, authoritative);
//  2. the launchpad's own backend (pump-api), for the holder distribution — the
//     chain disables denom-holder enumeration, so this is the only holder source,
//     and crucially it LABELS protocol addresses (bonding-curve escrow, pools) so
//     we can separate them from real holders. The token's `evm_authority` on the
//     contract is the escrow/core, NOT the dev — so holder concentration must come
//     from the labeled API data, never from a raw balance query.

export const LAUNCHPAD_ISSUER = 'inj13j2rpnlwl30c02d4pzukykwfeyyhelvry9cqte';
const PUMP_API = 'https://pump-api.trippyinj.xyz';

const LCDS = [
  'https://sentry.lcd.injective.network',
  'https://injective-api.polkachu.com',
  'https://injective-rest.publicnode.com',
];

/* eslint-disable @typescript-eslint/no-explicit-any */
async function lcdSmart(query: Record<string, unknown>): Promise<any | null> {
  const b64 = Buffer.from(JSON.stringify(query)).toString('base64');
  for (const lcd of LCDS) {
    try {
      const res = await fetch(
        `${lcd}/cosmwasm/wasm/v1/contract/${LAUNCHPAD_ISSUER}/smart/${b64}`,
        { signal: AbortSignal.timeout(8_000) },
      );
      if (!res.ok) continue;
      const j = await res.json();
      if (j?.data !== undefined) return j.data;
    } catch {
      continue;
    }
  }
  return null;
}

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
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Is this denom one minted by the Trippy launchpad? (creator = the issuer.) */
export function isLaunchpadDenom(creator: string | null): boolean {
  return creator === LAUNCHPAD_ISSUER;
}

/** factory/{issuer}/{prefix}_{onchainId}_{hash} → onchainId, else null. */
function onchainIdFromDenom(denom: string): number | null {
  const m = denom.match(/_(\d+)_[0-9a-f]+$/i);
  return m ? Number(m[1]) : null;
}

// ── On-chain: mint authority + stage (authoritative, unambiguous) ───────────
export interface LaunchInfo {
  status: string;          // 'registered' (on curve) | 'delivered' | …
  adminRenounced: boolean; // can more supply still be minted?
  registeredAt: number;    // unix seconds
  graduated: boolean;      // choice_factory set = live on a real market
  totalSupplyRaw: string;
}

export async function fetchLaunchInfo(denom: string): Promise<LaunchInfo | null> {
  const x = await lcdSmart({ launch_by_denom: { denom } });
  if (!x) return null;
  return {
    status: String(x.status ?? ''),
    adminRenounced: Boolean(x.admin_renounced),
    registeredAt: Number(x.registered_at) || 0,
    graduated: x.choice_factory != null,
    totalSupplyRaw: String(x.total_supply ?? '0'),
  };
}

// ── pump-api: holder distribution (labels protocol addresses) ───────────────
export interface HolderRow {
  address: string;
  pct: number;
  isProtocol: boolean;   // bonding-curve escrow / pool — not a real holder
  label: string | null;  // e.g. 'Launchpad escrow', 'Graduated pool'
}

export interface LaunchpadHolders {
  totalHolders: number;
  userHolders: number;   // excluding protocol/pool addresses
  escrowPct: number;     // supply share held by protocol/escrow/pool addresses
  soldPct: number;       // 100 - escrowPct (roughly, how much left the curve)
  topRealPct: number;    // largest single non-protocol holder
  top10RealPct: number;
  rows: HolderRow[];      // top rows for display (protocols labeled)
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function fetchLaunchpadHolders(
  denom: string,
  totalSupplyRaw: string,
): Promise<LaunchpadHolders | null> {
  const onchainId = onchainIdFromDenom(denom);
  if (onchainId == null) return null;

  const launch = await apiJson(`/launches/by-onchain/${onchainId}`);
  const id = launch?.id;
  if (id == null) return null;

  const [count, holders] = await Promise.all([
    apiJson(`/launches/${id}/holders/count`),
    apiJson(`/launches/${id}/holders?limit=100`),
  ]);

  let supply: bigint;
  try { supply = BigInt(totalSupplyRaw); } catch { return null; }
  if (supply <= BigInt(0)) return null;
  const pctOf = (v: string): number => {
    try { return Number((BigInt(v) * BigInt(10000)) / supply) / 100; } catch { return 0; }
  };

  const protocols: any[] = Array.isArray(count?.protocols) ? count.protocols : [];
  const protoSet = new Set(protocols.map((p) => String(p.address).toLowerCase()));
  const labelBy = new Map<string, string>(
    protocols.map((p) => [String(p.address).toLowerCase(), String(p.label ?? p.kind ?? 'protocol')]),
  );
  let escrowRaw = BigInt(0);
  for (const p of protocols) { try { escrowRaw += BigInt(p.balance); } catch { /* ignore */ } }

  const items: any[] = Array.isArray(holders?.items) ? [...holders.items] : [];
  // Defensive: ensure balance-descending so the top holders are really the top.
  items.sort((a, b) => { try { return BigInt(b.balance) > BigInt(a.balance) ? 1 : -1; } catch { return 0; } });

  const real = items.filter((h) => !protoSet.has(String(h.address).toLowerCase()));
  let top10Raw = BigInt(0);
  for (const h of real.slice(0, 10)) { try { top10Raw += BigInt(h.balance); } catch { /* ignore */ } }

  const rows: HolderRow[] = items.slice(0, 12).map((h) => {
    const a = String(h.address).toLowerCase();
    return { address: String(h.address), pct: pctOf(String(h.balance)), isProtocol: protoSet.has(a), label: labelBy.get(a) ?? null };
  });

  const escrowPct = Number((escrowRaw * BigInt(10000)) / supply) / 100;
  return {
    totalHolders: Number(count?.count) || items.length,
    userHolders: Number(count?.userCount) || real.length,
    escrowPct,
    soldPct: Math.max(0, 100 - escrowPct),
    topRealPct: real.length ? pctOf(String(real[0].balance)) : 0,
    top10RealPct: Number((top10Raw * BigInt(10000)) / supply) / 100,
    rows,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
