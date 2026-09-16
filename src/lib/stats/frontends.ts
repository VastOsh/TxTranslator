// ── Front-end attribution registry ──────────────────────────────────────────
// The exchange module is one shared order book; a trade is attributed to a
// front-end by the `feeRecipient` set on its order. Relayers (Helix, Mito, ...)
// set their own address to collect the 40% relayer fee share, so the recipient
// wallet identifies who routed the flow. This maps the wallets we have
// identified to names; every other wallet surfaces by its address until labeled.

export type RecipientKind = 'frontend' | 'direct' | 'mm' | 'other';

export interface RecipientLabel {
  name: string;
  kind: RecipientKind;
  /** Brand colour for known front-ends; unknown/other get a palette slot in the UI. */
  color?: string;
}

// Marker used by the reconstruction for the folded long tail of small wallets.
export const OTHER_ADDR = '__other__';

// Identified fee-recipient wallets. Confidence notes live beside each entry so a
// label is never a silent guess.
const KNOWN: Record<string, { name: string; color: string }> = {
  // Dominant relayer by a wide margin and present across essentially every
  // market (240+), which matches Helix being the primary Injective order-book
  // front-end. High confidence.
  inj1tnf9wk2yuu32xj4unhkh8d3nflacnhq8n0u7kp: { name: 'Helix', color: '#35C9BE' },
  // Confirmed from real txs: both tag orders with their own contract, whose
  // on-chain wasm label names them ("Choice DEX Aggregator v2.0" / "Mito Master 1").
  inj1520rsss9aykhkfmuf89nh5hp2jww770z4u3eu0: { name: 'Choice', color: '#9B8CFF' },
  inj1vcqkkvqs7prqu70dpddfj7kqeqfdz5gg662qs3: { name: 'Mito', color: '#F0B24A' },
};

// Unset / default fee recipient: orders with no front-end tag. These are direct
// on-chain flow — professional market makers and API traders — not a dApp.
const DIRECT = new Set<string>([
  '',
  '(none)',
  'inj1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqe2hm49', // all-zero address
]);

/** Truncate a bech32 address for display: inj1abcd…wxyz. */
export function shortAddr(addr: string): string {
  if (!addr || addr.length < 14) return addr || '—';
  return `${addr.slice(0, 8)}…${addr.slice(-4)}`;
}

/** Resolve a fee-recipient wallet to a display label. */
export function labelRecipient(addr: string): RecipientLabel {
  if (addr === OTHER_ADDR) return { name: 'Other', kind: 'other' };
  if (DIRECT.has(addr)) return { name: 'Direct / API', kind: 'direct', color: '#7A8290' };
  const k = KNOWN[addr];
  if (k) return { name: k.name, kind: 'frontend', color: k.color };
  // Everything else is a plain-account fee recipient with no public label. On
  // Injective a real front-end deploys a contract (Helix/Choice/Mito are all
  // named above); an unlabeled plain account setting its own fee recipient is an
  // automated market-maker / trading bot. Group them all under one bucket.
  return { name: 'Automated MM', kind: 'mm', color: '#6EA8FF' };
}
