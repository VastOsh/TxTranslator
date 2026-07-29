import { INDEXER_BASE, fetchJsonOverHttps } from '../injective';
import { CONTRACT_PROTOCOLS, PROTOCOL_CONTEXTS } from '@/constants/contracts';
import type { ProtocolName } from '@/constants/contracts';

// ── dApp directory: the known protocol registry, enriched from chain ──
//
// This does NOT report TVL, USD volume, or unique users. None of those exist as
// a lookup on the indexer — they'd each need bespoke per-protocol state queries
// plus historical pricing, and they rot every time a protocol ships. What the
// wasm registry DOES give cheaply and honestly is per-contract execution
// counts, instantiation and last-active timestamps. Those are what we show.
//
// "Executions" is the chain's lifetime count of contract calls. For an
// orderbook venue like Helix most real activity flows through the exchange
// module, not this swap-router contract, so a low number here is not low usage
// — it's the wrong denominator. The UI labels the figure precisely rather than
// dressing it up as a volume metric.

export interface DappContract {
  address: string;
  label: string | null;
  executions: number;
  createdAt: number;
  lastActiveAt: number;
  /** False when the address resolves to an account/denom rather than a wasm contract. */
  isContract: boolean;
  /** True when the on-chain lookup never succeeded — figures below are unknown, not zero. */
  unresolved: boolean;
}

export interface DappSummary {
  slug: string;
  name: ProtocolName;
  description: string;
  /** Official app/site URL, when the protocol has a public one. */
  website?: string;
  contractCount: number;
  /** Contracts that actually resolved as wasm contracts on chain. */
  resolvedContracts: number;
  /** Contracts whose lookup failed this build — their figures are missing, not zero. */
  unresolvedContracts: number;
  totalExecutions: number;
  firstSeenAt: number;
  lastActiveAt: number;
}

export interface DappDetail extends DappSummary {
  context: string;
  contracts: DappContract[];
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

interface WasmMeta {
  label: string | null;
  executions: number;
  createdAt: number;
  lastActiveAt: number;
  isContract: boolean;
  unresolved: boolean;
}

// Cap concurrency: firing all ~36 lookups at once exhausts the socket pool and
// causes timeouts, which then get misread as "not a contract".
const WASM_CONCURRENCY = 8;
const WASM_ATTEMPTS = 3;

async function fetchWasmMeta(address: string): Promise<WasmMeta> {
  for (let attempt = 0; attempt < WASM_ATTEMPTS; attempt++) {
    const result = await fetchJsonOverHttps(
      `${INDEXER_BASE}/api/explorer/v1/wasm/contracts/${address}`,
    );

    // A completed HTTP response — trust it, even a 404 (that's a real "not a
    // wasm contract", e.g. a token-factory account).
    if (result) {
      const body = result.body;
      if (result.status === 200 && body?.label) {
        return {
          label: body.label ?? null,
          executions: Number(body.executes) || 0,
          createdAt: Number(body.instantiated_at) || 0,
          lastActiveAt: Number(body.last_executed_at) || 0,
          isContract: true,
          unresolved: false,
        };
      }
      return { label: null, executions: 0, createdAt: 0, lastActiveAt: 0, isContract: false, unresolved: false };
    }
    // null = the request itself failed (timeout/network); retry before giving up.
  }
  // Never reached the indexer — report unknown, not zero, so a flaky network
  // does not silently erase a real contract's activity.
  return { label: null, executions: 0, createdAt: 0, lastActiveAt: 0, isContract: false, unresolved: true };
}

/** Resolve a list of addresses with bounded concurrency. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** All registry contracts grouped by protocol, enriched with on-chain meta. */
async function loadDappContracts(): Promise<Map<ProtocolName, DappContract[]>> {
  const addresses = Object.keys(CONTRACT_PROTOCOLS);
  const metas = await mapWithConcurrency(addresses, WASM_CONCURRENCY, async address => ({
    address,
    meta: await fetchWasmMeta(address),
  }));

  const byProtocol = new Map<ProtocolName, DappContract[]>();
  for (const { address, meta } of metas) {
    const protocol = CONTRACT_PROTOCOLS[address];
    const list = byProtocol.get(protocol) ?? [];
    list.push({
      address,
      label: meta.label,
      executions: meta.executions,
      createdAt: meta.createdAt,
      lastActiveAt: meta.lastActiveAt,
      isContract: meta.isContract,
      unresolved: meta.unresolved,
    });
    byProtocol.set(protocol, list);
  }
  return byProtocol;
}

function summarize(name: ProtocolName, contracts: DappContract[]): DappSummary {
  const resolved = contracts.filter(c => c.isContract);
  const created = contracts.map(c => c.createdAt).filter(Boolean);
  return {
    slug: slugify(name),
    name,
    description: PROTOCOL_CONTEXTS[name]?.description ?? '',
    website: PROTOCOL_CONTEXTS[name]?.website,
    contractCount: contracts.length,
    resolvedContracts: resolved.length,
    unresolvedContracts: contracts.filter(c => c.unresolved).length,
    totalExecutions: contracts.reduce((sum, c) => sum + c.executions, 0),
    firstSeenAt: created.length ? Math.min(...created) : 0,
    lastActiveAt: Math.max(0, ...contracts.map(c => c.lastActiveAt)),
  };
}

export async function buildDappDirectory(): Promise<DappSummary[]> {
  const byProtocol = await loadDappContracts();
  const summaries: DappSummary[] = [];
  for (const [name, contracts] of byProtocol) {
    summaries.push(summarize(name, contracts));
  }
  summaries.sort((a, b) => b.totalExecutions - a.totalExecutions);
  return summaries;
}

export async function buildDappDetail(slug: string): Promise<DappDetail | null> {
  const byProtocol = await loadDappContracts();
  for (const [name, contracts] of byProtocol) {
    if (slugify(name) !== slug) continue;
    contracts.sort((a, b) => b.executions - a.executions);
    return {
      ...summarize(name, contracts),
      context: PROTOCOL_CONTEXTS[name]?.context ?? '',
      contracts,
    };
  }
  return null;
}
