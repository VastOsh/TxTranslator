import { Buffer } from 'node:buffer';
import { INDEXER_BASE, fetchJsonOverHttps } from '../injective';
import { subaccountToInjAddress } from '../feed/watch';

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

/** A set of top holders that trace back to one funding wallet. */
export interface HolderCluster {
  funder: string;         // inj1 wallet that first funded the members
  funderIsHolder: boolean;// the funder is itself one of the token's top holders
  members: string[];      // holder addresses (hex, matching bubble node ids)
  pct: number;            // combined supply % of the members
}

export interface LaunchpadHolders {
  // Launch-level flags from the launchpad's own backend (by-onchain record).
  flagged: boolean;          // the launchpad flags this launch (scam/impersonation)
  impersonates: string | null; // what the launchpad says it impersonates, if flagged
  devCreator: string | null; // the real deployer (EVM hex), from launch.creator

  totalHolders: number;
  userHolders: number;   // excluding protocol/pool addresses
  escrowPct: number;     // supply share held by protocol/escrow/pool addresses
  soldPct: number;       // 100 - escrowPct (roughly, how much left the curve)
  topRealPct: number;    // largest single non-protocol holder
  top10RealPct: number;
  rows: HolderRow[];      // top rows for the list (protocols labeled)
  bubble: Array<{ address: string; pct: number }>; // real holders only, for the bubble map

  // Wallet-connection analysis over the top real holders (funding graph).
  edges: Array<{ a: string; b: string }>; // connections to draw between bubble nodes
  clusters: HolderCluster[];               // groups sharing a funding source
  clustersResolved: boolean;               // the funding sweep actually ran to completion
  clusteredPct: number;                    // supply % held by connected wallets
  largestClusterSize: number;
}

// ── Wallet-connection analysis: who funded the top holders ──────────────────
// The launchpad's holder addresses are EVM hex; the same account is an inj1
// bech32 address on the Cosmos side, where the explorer indexer keeps full tx
// history. A wallet's oldest transaction is normally the bank send that first
// funded it — its "funder". Top holders that share one funder are connected
// (an insider/sybil cluster) — or were simply funded from a common exchange
// withdrawal. We surface the fact and the funder address; we never claim intent.
const CLUSTER_SAMPLE = 18;       // top real holders we trace funding for
const FUNDER_CONCURRENCY = 12;

/* eslint-disable @typescript-eslint/no-explicit-any */
// A wallet's oldest transaction reveals who first funded it. Two funding modes
// dominate this launchpad's holders: a Cosmos bank MsgSend (funder is an inj1
// sender) and an EVM transfer (MsgEthereumTx — the funder's EVM address is the
// base64 `from`, which we re-encode to inj1). Peggy bridge-ins and old wallets
// whose first indexed tx is their own action resolve to null (no edge — honest).
async function firstFunder(inj: string, ownHex: string): Promise<string | null> {
  const head = await fetchJsonOverHttps(`${INDEXER_BASE}/api/explorer/v1/accountTxs/${inj}?limit=1`);
  const total = Number(head?.body?.paging?.total);
  if (!Number.isFinite(total) || total <= 0) return null;
  const tail = await fetchJsonOverHttps(
    `${INDEXER_BASE}/api/explorer/v1/accountTxs/${inj}?limit=1&skip=${Math.max(0, total - 1)}`,
  );
  const oldest = (tail?.body?.data as any[])?.[0];
  for (const m of oldest?.messages ?? []) {
    const type = String(m.type ?? '');
    const v = m.value ?? {};
    if (type.includes('MsgSend')) {
      const to = v.to_address ?? v.toAddress ?? v.receiver;
      const from = v.from_address ?? v.fromAddress ?? v.sender;
      if (to === inj && from && from !== inj) return String(from);
    } else if (type.includes('MsgEthereumTx') && typeof v.from === 'string') {
      // `from` is base64 of the sender's 20-byte EVM address.
      let fromHex: string | null = null;
      try { fromHex = Buffer.from(v.from, 'base64').toString('hex').toLowerCase(); } catch { fromHex = null; }
      if (fromHex && /^[0-9a-f]{40}$/.test(fromHex) && fromHex !== ownHex) {
        return subaccountToInjAddress(fromHex);
      }
    }
  }
  return null;
}

interface ClusterResult {
  edges: Array<{ a: string; b: string }>;
  clusters: HolderCluster[];
  resolved: boolean;
  clusteredPct: number;
  largestClusterSize: number;
}

async function buildClusters(
  bubble: Array<{ address: string; pct: number }>,
  budgetMs: number,
  excludeFunders: Set<string>,
): Promise<ClusterResult> {
  const empty: ClusterResult = { edges: [], clusters: [], resolved: false, clusteredPct: 0, largestClusterSize: 0 };
  if (budgetMs <= 0) return empty;

  const sample = bubble.slice(0, CLUSTER_SAMPLE);
  const injOf = new Map<string, string>(); // hex → inj1
  for (const b of sample) {
    const inj = subaccountToInjAddress(b.address);
    if (inj) injOf.set(b.address, inj);
  }
  if (injOf.size < 2) return empty;

  const funderOf = new Map<string, string>(); // hex → funder inj1
  const entries = [...injOf.entries()];
  const deadline = Date.now() + budgetMs;
  let next = 0;
  let ranOut = false;
  async function worker() {
    while (next < entries.length) {
      if (Date.now() >= deadline) { ranOut = true; return; }
      const [hex, inj] = entries[next++];
      const ownHex = hex.replace(/^0x/, '').toLowerCase();
      const f = await firstFunder(inj, ownHex);
      if (f && f !== inj) funderOf.set(hex, f);
    }
  }
  await Promise.all(Array.from({ length: Math.min(FUNDER_CONCURRENCY, entries.length) }, worker));

  const pctByHex = new Map(sample.map((s) => [s.address, s.pct]));
  const injToHex = new Map<string, string>();
  for (const [hex, inj] of injOf) injToHex.set(inj, hex);

  const byFunder = new Map<string, string[]>();
  for (const [hex, f] of funderOf) {
    if (!byFunder.has(f)) byFunder.set(f, []);
    byFunder.get(f)!.push(hex);
  }

  // A funder that seeds a large fraction of the sample is infrastructure — a
  // CEX/bridge withdrawal wallet or a launchpad gas faucet — not a distinguishing
  // insider cluster. Above this share we drop it rather than cry wolf.
  const hubCap = Math.max(6, Math.ceil(funderOf.size * 0.6));

  const clusters: HolderCluster[] = [];
  const edges: Array<{ a: string; b: string }> = [];
  const clusteredHex = new Set<string>();
  for (const [funder, members] of byFunder) {
    if (members.length < 2) continue;
    if (excludeFunders.has(funder)) continue;   // labeled protocol / escrow / issuer
    if (members.length > hubCap) continue;       // too broad — likely CEX/faucet, not a cluster
    members.sort((a, b) => (pctByHex.get(b) ?? 0) - (pctByHex.get(a) ?? 0));
    const funderIsHolder = injToHex.has(funder);
    const funderHex = funderIsHolder ? injToHex.get(funder)! : null;
    const pct = members.reduce((s, h) => s + (pctByHex.get(h) ?? 0), 0)
      + (funderHex ? (pctByHex.get(funderHex) ?? 0) : 0);
    clusters.push({ funder, funderIsHolder, members, pct: Math.round(pct * 100) / 100 });
    // Star the connections through a hub node (the funder if it holds, else the
    // largest member) so the edge count stays small and reads as one group.
    const hub = funderHex ?? members[0];
    for (const m of members) if (m !== hub) edges.push({ a: hub, b: m });
    for (const m of members) clusteredHex.add(m);
    if (funderHex) clusteredHex.add(funderHex);
  }
  clusters.sort((a, b) => b.members.length - a.members.length || b.pct - a.pct);

  let clusteredPct = 0;
  for (const hex of clusteredHex) clusteredPct += pctByHex.get(hex) ?? 0;

  return {
    edges,
    clusters,
    resolved: !ranOut,
    clusteredPct: Math.round(clusteredPct * 100) / 100,
    largestClusterSize: clusters.reduce((m, c) => Math.max(m, c.members.length + (c.funderIsHolder ? 1 : 0)), 0),
  };
}

export async function fetchLaunchpadHolders(
  denom: string,
  totalSupplyRaw: string,
  opts: { clusterBudgetMs?: number } = {},
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
  const bubble = real.slice(0, 40).map((h) => ({ address: String(h.address), pct: pctOf(String(h.balance)) }));

  // Funders that are launchpad/protocol infrastructure, not real peers: the
  // labeled escrow/pool addresses, the curve core, the settler, and the issuer.
  // Excluded so a gas-seeding or escrow address never reads as an insider cluster.
  const excludeFunders = new Set<string>([LAUNCHPAD_ISSUER]);
  for (const hexAddr of protoSet) {
    const inj = subaccountToInjAddress(hexAddr);
    if (inj) excludeFunders.add(inj);
  }
  for (const infra of [launch?.core, launch?.settler, launch?.sinkAddr, launch?.lockerAddr]) {
    if (typeof infra === 'string') {
      const inj = subaccountToInjAddress(infra);
      if (inj) excludeFunders.add(inj);
    }
  }

  // Trace the funding graph over the top real holders (budgeted; skipped on 0).
  const cl = await buildClusters(bubble, opts.clusterBudgetMs ?? 0, excludeFunders);

  return {
    flagged: Boolean(launch?.flagged),
    impersonates: launch?.impersonates ? String(launch.impersonates) : null,
    devCreator: launch?.creator ? String(launch.creator) : null,
    totalHolders: Number(count?.count) || items.length,
    userHolders: Number(count?.userCount) || real.length,
    escrowPct,
    soldPct: Math.max(0, 100 - escrowPct),
    topRealPct: real.length ? pctOf(String(real[0].balance)) : 0,
    top10RealPct: Number((top10Raw * BigInt(10000)) / supply) / 100,
    rows,
    bubble,
    edges: cl.edges,
    clusters: cl.clusters,
    clustersResolved: cl.resolved,
    clusteredPct: cl.clusteredPct,
    largestClusterSize: cl.largestClusterSize,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
