import { unstable_cache } from 'next/cache';

// ── Set 1: the verified token registry ───────────────────────────────────────
//
// Injective's official token list — the authoritative "these are the real
// tokens" source, regenerated from on-chain metadata every ~30 min. Identity is
// the `denom`; `symbol`/`name` are just labels anyone can copy, which is exactly
// the impersonation surface we check against.
// https://github.com/InjectiveLabs/injective-lists

export interface VerifiedToken {
  denom: string;
  symbol: string;
  name: string;
  tokenType: string; // symbol | erc20 | cw20 | tokenFactory | lp
  creator?: string;
  coinGeckoId?: string;
}

const TOKENS_URL =
  'https://raw.githubusercontent.com/InjectiveLabs/injective-lists/master/json/tokens/mainnet.json';

async function fetchVerifiedTokens(): Promise<VerifiedToken[]> {
  try {
    const res = await fetch(TOKENS_URL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return [];
    const arr = await res.json();
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (t) => t && typeof t.denom === 'string' && typeof t.symbol === 'string' &&
          t.tokenVerification === 'verified',
      )
      .map((t) => ({
        denom: t.denom as string,
        symbol: t.symbol as string,
        name: (t.name ?? t.symbol) as string,
        tokenType: (t.tokenType ?? '') as string,
        creator: typeof t.creator === 'string' ? t.creator : undefined,
        coinGeckoId: typeof t.coinGeckoId === 'string' ? t.coinGeckoId : undefined,
      }));
  } catch {
    return [];
  }
}

/** Cached verified-token registry (empty array if the source is unreachable). */
export const getVerifiedTokens = unstable_cache(fetchVerifiedTokens, ['verified-tokens-v1'], {
  revalidate: 1800,
});

// ── Restricted / sanctioned wallets ──────────────────────────────────────────
//
// Injective publishes the OFAC-sanctioned and otherwise-restricted wallet
// addresses (EVM hex) it enforces against. A token whose creator or a top holder
// is on this list is an authoritative red flag. We store them lowercased and
// 0x-stripped so a hex or bech32-derived address compares cleanly.
// https://github.com/InjectiveLabs/injective-lists/tree/master/json/wallets

const RESTRICTED_URL =
  'https://raw.githubusercontent.com/InjectiveLabs/injective-lists/master/json/wallets/ofacAndRestricted.json';

async function fetchRestrictedWallets(): Promise<string[]> {
  try {
    const res = await fetch(RESTRICTED_URL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return [];
    const arr = await res.json();
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((a): a is string => typeof a === 'string')
      .map((a) => a.replace(/^0x/, '').toLowerCase());
  } catch {
    return [];
  }
}

const getRestrictedList = unstable_cache(fetchRestrictedWallets, ['restricted-wallets-v1'], {
  revalidate: 1800,
});

/** Restricted/sanctioned wallets as a lookup set (0x-stripped, lowercased). */
export async function getRestrictedWallets(): Promise<Set<string>> {
  return new Set(await getRestrictedList());
}

// ── Set 2: known projects / NFT collections ──────────────────────────────────
//
// Famous Injective projects and blue-chip NFT collections whose *name* scammers
// borrow for tokens. Pinned to a real contract where one exists (never matched
// by name alone at the source — the same principle as the NFT blue-chip list in
// portfolio/nft.ts). Whether a project has an official token is resolved live
// against Set 1, so we never hard-code a claim that can go stale.
//
// Aliases are the strings a human would read as "this is <project>": the name,
// its ticker, and close variants. Kept deliberately tight to avoid false flags.

export interface KnownProject {
  name: string;
  kind: 'nft-collection' | 'project';
  aliases: string[];
  /** Contract address for NFT collections (for an explorer/Talis link). */
  contract?: string;
}

export const KNOWN_PROJECTS: KnownProject[] = [
  {
    name: 'Cult of Anons',
    kind: 'nft-collection',
    aliases: ['cult of anons', 'cult of anon', 'cultofanons', 'coa', 'anons'],
    contract: 'inj1mp8r8jy4cefgw4l0wtw9ahdnu9yv7nl6mqqkju',
  },
  {
    name: 'Injective Quants',
    kind: 'nft-collection',
    aliases: ['injective quants', 'quants', 'qunt'],
    contract: 'inj1vtd54v4jm50etkjepgtnd7lykr79yvvah8gdgw',
  },
  {
    name: 'The Ninjas',
    kind: 'nft-collection',
    aliases: ['the ninjas', 'premier ninjas', 'injective ninjas'],
    contract: 'inj19ly43dgrr2vce8h02a8nw0qujwhrzm9yv8d75c',
  },
  {
    name: 'MASKED',
    kind: 'nft-collection',
    aliases: ['masked'],
    contract: 'inj19lsr0vk0h42k0mspgym552hl432a9et0nhd4nj',
  },
  {
    name: 'Pedro',
    kind: 'nft-collection',
    aliases: ['pedro'],
    contract: 'inj1uq453kp4yda7ruc0axpmd9vzfm0fj62padhe0p',
  },
];
