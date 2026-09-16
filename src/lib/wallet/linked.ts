import { INDEXER_BASE, fetchJsonOverHttps } from '../injective';
import { fetchFirstFunder } from '../token/launchpad';

// ── Linked wallets: spotting one operator behind many addresses ──────────────
// Injective has no "who is the same person" index, and it never can be proven
// from the chain. What the chain does show is who first funded a wallet. A
// fresh wallet's very first incoming transfer is its seed, and the wallet that
// sent it is either the same operator or a shared exchange withdrawal address.
// We trace that seed relationship in both directions and grade every edge by
// how strong it really is, never claiming same-person identity.
//
//   seeded-by : the wallet that sent this one its first funds (one hop up).
//   sibling   : another wallet the same seed wallet also first-funded.
//   seeded    : a wallet this one first-funded (one hop down).
//
// The honest hard part is telling an operator's own seed wallet from an
// exchange. An exchange withdrawal wallet funds thousands and is extremely
// active; an operator's seed wallet funds a handful and then goes quiet. We use
// lifetime tx count as that discriminator and say so in the evidence, downgrading
// (never hiding) an edge that runs through a high-activity wallet. There is no
// reverse "funded-by-X" endpoint, so siblings and children come from a bounded
// scan of a wallet's outgoing transfers, each candidate verified by re-reading
// its own first funder. Everything is capped and cached; nothing is estimated.

/* eslint-disable @typescript-eslint/no-explicit-any */

// A wallet this active is an exchange, relayer or contract, not a personal
// address; clustering it would link unrelated people, so we only report its seed.
const TARGET_HUB_TX = 100_000;
// A seed wallet above this is almost certainly an exchange or distribution
// wallet: its "seeded-by" edge is weak and we do not expand its siblings.
const SEED_HUB_TX = 15_000;
// A seed wallet below this is a quiet operator wallet; its co-funded wallets are
// a strong link. Between the two thresholds the sibling link is "possible".
const SEED_STRONG_TX = 2_000;

const PAGE = 100;
const SCAN_PAGES = 2;        // bounded window of outgoing transfers to sample
const MAX_CANDIDATES = 10;   // distinct recipients we verify per direction
const VERIFY_CONCURRENCY = 8;

export type LinkKind = 'seeded-by' | 'sibling' | 'seeded';
export type Confidence = 'strong' | 'possible' | 'weak';

export interface LinkedWallet {
  address: string;
  kind: LinkKind;
  confidence: Confidence;
  evidence: string;
  txCount: number | null;
}

export interface LinkedWallets {
  address: string;
  seedWallet: string | null;   // the wallet that first funded this one, if any
  seedIsHub: boolean;          // that seed wallet looks like an exchange
  targetIsHub: boolean;        // this address itself looks like infrastructure
  links: LinkedWallet[];
  note: string;
}

/** Lifetime tx count from the explorer's own paging total (one call). */
async function txCountOf(inj: string): Promise<number | null> {
  const head = await fetchJsonOverHttps(`${INDEXER_BASE}/api/explorer/v1/accountTxs/${inj}?limit=1`);
  const total = Number(head?.body?.paging?.total);
  return Number.isFinite(total) ? total : null;
}

/** Distinct wallets `inj` sent value to, sampled over a bounded window, with a send count. */
async function outgoingRecipients(inj: string, pages: number): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let p = 0; p < pages; p++) {
    const res = await fetchJsonOverHttps(
      `${INDEXER_BASE}/api/explorer/v1/accountTxs/${inj}?limit=${PAGE}&skip=${p * PAGE}`,
    );
    const rows: any[] = res?.body?.data ?? [];
    if (rows.length === 0) break;
    for (const tx of rows) {
      for (const m of tx.messages ?? []) {
        const type = String(m.type ?? '');
        const v = m.value ?? {};
        if (type.includes('MsgSend')) {
          const from = v.from_address ?? v.fromAddress ?? v.sender;
          const to = v.to_address ?? v.toAddress ?? v.receiver;
          if (from === inj && typeof to === 'string' && to !== inj) out.set(to, (out.get(to) ?? 0) + 1);
        } else if (type.includes('MsgMultiSend')) {
          const inputs: any[] = v.inputs ?? [];
          if (inputs.some((i) => i.address === inj)) {
            for (const o of v.outputs ?? []) {
              const a = o.address;
              if (typeof a === 'string' && a !== inj) out.set(a, (out.get(a) ?? 0) + 1);
            }
          }
        }
      }
    }
    if (rows.length < PAGE) break;
  }
  return out;
}

/** Keep only the recipients whose OWN first funder is `funder` (i.e. it seeded them). */
async function verifySeeded(funder: string, candidates: string[]): Promise<Map<string, number | null>> {
  const seeded = new Map<string, number | null>();
  let next = 0;
  async function worker() {
    while (next < candidates.length) {
      const cand = candidates[next++];
      const [f, tx] = await Promise.all([fetchFirstFunder(cand), txCountOf(cand)]);
      if (f === funder) seeded.set(cand, tx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(VERIFY_CONCURRENCY, candidates.length) }, worker));
  return seeded;
}

function topCandidates(recips: Map<string, number>, exclude: Set<string>): string[] {
  return [...recips.entries()]
    .filter(([a]) => !exclude.has(a))
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_CANDIDATES)
    .map(([a]) => a);
}

export async function buildLinkedWallets(inj: string): Promise<LinkedWallets> {
  const targetTx = await txCountOf(inj);
  const empty = (note: string, seedWallet: string | null = null, seedIsHub = false, targetIsHub = false, links: LinkedWallet[] = []): LinkedWallets =>
    ({ address: inj, seedWallet, seedIsHub, targetIsHub, links, note });

  if (targetTx == null || targetTx === 0) {
    return empty('No transactions found for this wallet yet, so there is nothing to link.');
  }

  const funder = await fetchFirstFunder(inj);
  const targetIsHub = targetTx > TARGET_HUB_TX;
  const links: LinkedWallet[] = [];
  const seen = new Set<string>([inj]);

  // ── One hop up: the wallet that seeded this one ──
  let seedIsHub = false;
  if (funder) {
    const funderTx = await txCountOf(funder);
    seedIsHub = funderTx != null && funderTx > SEED_HUB_TX;
    links.push({
      address: funder,
      kind: 'seeded-by',
      confidence: seedIsHub ? 'weak' : 'strong',
      evidence: seedIsHub
        ? `Sent this wallet its first funds, but is highly active (${funderTx!.toLocaleString('en-US')} txs), so it is more likely an exchange or distribution wallet than a personal link.`
        : 'Sent this wallet its first funds. A quiet wallet that seeds another is usually the same operator.',
      txCount: funderTx,
    });
    seen.add(funder);
  }

  // ── Siblings: other wallets the same (non-exchange) seed wallet first-funded ──
  if (funder && !seedIsHub && !targetIsHub) {
    const funderTx = links[0]?.txCount ?? null;
    const recips = await outgoingRecipients(funder, SCAN_PAGES);
    const seeded = await verifySeeded(funder, topCandidates(recips, seen));
    const conf: Confidence = funderTx != null && funderTx < SEED_STRONG_TX ? 'strong' : 'possible';
    for (const [addr, tx] of seeded) {
      if (seen.has(addr)) continue;
      links.push({
        address: addr,
        kind: 'sibling',
        confidence: conf,
        evidence: `First funded by the same wallet (${shortAddr(funder)}) that seeded this one.`,
        txCount: tx,
      });
      seen.add(addr);
    }
  }

  // ── One hop down: wallets this one first-funded ──
  if (!targetIsHub) {
    const recips = await outgoingRecipients(inj, SCAN_PAGES);
    const seeded = await verifySeeded(inj, topCandidates(recips, seen));
    for (const [addr, tx] of seeded) {
      if (seen.has(addr)) continue;
      links.push({
        address: addr,
        kind: 'seeded',
        confidence: 'strong',
        evidence: 'This wallet sent it its first funds, so this wallet created or seeded it.',
        txCount: tx,
      });
      seen.add(addr);
    }
  }

  const rank: Record<LinkKind, number> = { seeded: 0, sibling: 1, 'seeded-by': 2 };
  const confRank: Record<Confidence, number> = { strong: 0, possible: 1, weak: 2 };
  links.sort((a, b) =>
    confRank[a.confidence] - confRank[b.confidence] ||
    rank[a.kind] - rank[b.kind] ||
    (a.txCount ?? Infinity) - (b.txCount ?? Infinity),
  );

  const note = targetIsHub
    ? `This address appears in ${targetTx.toLocaleString('en-US')} transactions, which is typical of an exchange, relayer or contract rather than one person. Only its seed wallet is shown; a fleet scan would link unrelated users.`
    : links.length > 1 || (links.length === 1 && links[0].kind !== 'seeded-by')
      ? 'Links are drawn from who first funded whom on-chain. A shared seed wallet or a direct seeding is a strong signal of one operator, not proof of identity.'
      : 'No further linked wallets found in a bounded scan of recent transfers. Absence of a link is not proof of independence.';

  return { address: inj, seedWallet: funder, seedIsHub, targetIsHub, links, note };
}

function shortAddr(a: string): string {
  return a.length > 20 ? `${a.slice(0, 10)}…${a.slice(-6)}` : a;
}

/* eslint-enable @typescript-eslint/no-explicit-any */
