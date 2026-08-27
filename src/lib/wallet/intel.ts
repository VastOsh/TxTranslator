import { fetchWalletInfo } from '../buyback/deposits';
import { fetchFirstFunder, fetchCreatorStats } from '../token/launchpad';
import { getRestrictedWallets } from '../token/reference';
import { injToHex } from '../address';

// ── Wallet Intelligence: "who is this address" ──────────────────────────────
// Aggregates what the chain and the launchpad reveal about a wallet into one
// honest picture: how old it is, how active, who first funded it, whether it
// has launched tokens (and how those fared), and whether it is on Injective's
// restricted list. It describes what a wallet has DONE — never who it is; the
// launchpad is pseudonymous and we never attribute real-world identity.

export interface WalletIntel {
  inj: string;
  hex: string | null;
  firstSeen: number | null;   // unix seconds of the oldest tx (≈ account age)
  ageDays: number | null;
  txCount: number;            // lifetime transactions the wallet appears in
  firstFunder: string | null; // inj1 wallet that first funded it
  restricted: boolean;        // on Injective's OFAC / restricted list
  launched: number;           // launchpad tokens this wallet created
  graduated: number;          // how many reached a live market
  flags: WalletFlag[];
}

export interface WalletFlag {
  level: 'danger' | 'warn' | 'info';
  label: string;
}

export async function buildWalletIntel(inj: string): Promise<WalletIntel> {
  const hex = injToHex(inj);

  const [info, funder, restrictedSet, creator] = await Promise.all([
    fetchWalletInfo(inj),
    fetchFirstFunder(inj),
    getRestrictedWallets(),
    hex ? fetchCreatorStats(hex) : Promise.resolve(null),
  ]);

  const firstSeen = info?.firstSeen ?? null;
  const txCount = info?.txCount ?? 0;
  const ageDays = firstSeen ? Math.max(0, Math.floor((Date.now() / 1000 - firstSeen) / 86400)) : null;
  const restricted = hex ? restrictedSet.has(hex) : false;
  const launched = creator?.launched ?? 0;
  const graduated = creator?.graduated ?? 0;

  const flags: WalletFlag[] = [];
  if (restricted) flags.push({ level: 'danger', label: 'On Injective’s restricted / OFAC list' });
  if (ageDays != null && ageDays < 30) flags.push({ level: 'warn', label: `New wallet · ${ageDays}d old` });
  if (txCount >= 5000) flags.push({ level: 'info', label: `Very active · ${txCount.toLocaleString('en-US')} txs` });
  if (launched >= 5 && graduated === 0) flags.push({ level: 'warn', label: `Serial launcher · ${launched} tokens, none graduated` });
  else if (launched > 0) flags.push({ level: 'info', label: `Launchpad creator · ${launched} token${launched === 1 ? '' : 's'}` });

  return { inj, hex, firstSeen, ageDays, txCount, firstFunder: funder, restricted, launched, graduated, flags };
}
