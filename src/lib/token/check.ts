import { getVerifiedTokens, KNOWN_PROJECTS, type VerifiedToken } from './reference';
import { normalizeTight, normalizeLoose, normalizeLeet, usesConfusables, editDistance } from './normalize';

export type SignalLevel = 'ok' | 'info' | 'warn' | 'danger';

export interface Signal {
  level: SignalLevel;
  title: string;
  detail: string;
  link?: { label: string; url: string };
}

export type Verdict = 'verified' | 'impersonation' | 'lookalike' | 'unverified' | 'unknown';

export interface TokenCheck {
  query: string;
  mode: 'denom' | 'lookup';
  denom: string | null;
  onchainName: string | null;
  onchainSymbol: string | null;
  creator: string | null;
  verdict: Verdict;
  headline: string;
  signals: Signal[];
}

const LCDS = [
  'https://sentry.lcd.injective.network',
  'https://injective-api.polkachu.com',
  'https://injective-rest.publicnode.com',
];

const EXPLORER = 'https://explorer.injective.network';

function explorerAccount(addr: string) {
  return `${EXPLORER}/account/${addr}`;
}
function explorerContract(addr: string) {
  return `${EXPLORER}/contract/${addr}`;
}

/** Read a denom's on-chain bank metadata (name + symbol). null if unreadable. */
async function fetchDenomMetadata(denom: string): Promise<{ name: string; symbol: string } | null> {
  const enc = encodeURIComponent(denom);
  for (const lcd of LCDS) {
    try {
      const res = await fetch(
        `${lcd}/cosmos/bank/v1beta1/denoms_metadata_by_query_string?denom=${enc}`,
        { signal: AbortSignal.timeout(8_000) },
      );
      if (!res.ok) continue;
      const j = await res.json();
      const m = j?.metadata;
      if (!m) continue;
      const name = typeof m.name === 'string' ? m.name : '';
      const symbol = typeof m.symbol === 'string' ? m.symbol : '';
      if (!name && !symbol) continue;
      return { name, symbol };
    } catch {
      continue;
    }
  }
  return null;
}

/** factory/{creator}/{subdenom} → creator, else null. */
function creatorOf(denom: string): string | null {
  if (!denom.startsWith('factory/')) return null;
  const parts = denom.split('/');
  return parts.length >= 3 && /^inj1[a-z0-9]{38}$/.test(parts[1]) ? parts[1] : null;
}

/** Heuristic: does the input look like a bank denom rather than a symbol/name? */
export function looksLikeDenom(q: string): boolean {
  return (
    q.startsWith('factory/') ||
    q.startsWith('ibc/') ||
    q.startsWith('peggy') ||
    q.startsWith('erc20:') ||
    q.startsWith('share') ||
    q === 'inj' ||
    q.includes('/')
  );
}

const DISCLAIMER: Signal = {
  level: 'info',
  title: 'No red flags is not a safety guarantee',
  detail:
    'This tool checks identity and impersonation against on-chain data and Injective’s verified lists only. It does not assess liquidity, holders, or contract behaviour, and cannot prove a token is safe. Always do your own research.',
};

// Find the verified (official) token that corresponds to a known project, if any —
// resolved live against the registry so we never hard-code that a project has (or
// lacks) an official token.
function officialTokenForAliases(aliasTights: Set<string>, tokens: VerifiedToken[]): VerifiedToken | null {
  for (const t of tokens) {
    if (aliasTights.has(normalizeTight(t.symbol)) || aliasTights.has(normalizeTight(t.name))) return t;
  }
  return null;
}

export async function checkToken(rawQuery: string): Promise<TokenCheck> {
  const query = rawQuery.trim();
  const tokens = await getVerifiedTokens();

  // ── Lookup mode: a bare symbol/name → point at the real token(s)/project(s) ──
  if (!looksLikeDenom(query)) {
    return lookupMode(query, tokens);
  }

  // ── Denom mode ──────────────────────────────────────────────────────────────
  const denom = query;
  const creator = creatorOf(denom);
  const signals: Signal[] = [];

  // 1. Already in the verified registry → it IS the official token.
  const registered = tokens.find((t) => t.denom === denom);
  if (registered) {
    signals.push({
      level: 'ok',
      title: `Verified token: ${registered.symbol}`,
      detail: `This denom is ${registered.name} (${registered.symbol}) on Injective’s official verified token list. This is the real one.`,
    });
    signals.push(identitySignal(denom, registered.name, registered.symbol, creator));
    signals.push(DISCLAIMER);
    return {
      query, mode: 'denom', denom, onchainName: registered.name, onchainSymbol: registered.symbol,
      creator, verdict: 'verified', headline: `Verified: this is the official ${registered.symbol}.`, signals,
    };
  }

  // 2. Not verified → read what it calls itself on-chain.
  const meta = await fetchDenomMetadata(denom);
  if (!meta) {
    signals.push({
      level: 'info',
      title: 'No on-chain metadata',
      detail:
        'This denom has no readable bank metadata, or it could not be reached. It is not on the verified token list either — its identity cannot be confirmed.',
    });
    signals.push(identitySignal(denom, null, null, creator));
    signals.push(DISCLAIMER);
    return {
      query, mode: 'denom', denom, onchainName: null, onchainSymbol: null, creator,
      verdict: 'unknown', headline: 'Not on the verified list and no readable metadata — unverified.', signals,
    };
  }

  const name = meta.name || '';
  const symbol = meta.symbol || '';
  const symTight = normalizeTight(symbol);
  const nameTight = normalizeTight(name);

  let danger = false;
  let warn = false;

  // 3a. Impersonating a verified TOKEN (symbol collision at a different denom).
  const symbolClash = symbol
    ? tokens.find((t) => normalizeTight(t.symbol) === symTight && t.denom !== denom)
    : undefined;
  if (symbolClash) {
    danger = true;
    signals.push({
      level: 'danger',
      title: `Impersonates the verified token ${symbolClash.symbol}`,
      detail: `This token advertises the symbol “${symbol}”, which belongs to the verified ${symbolClash.name} (${symbolClash.symbol}). This denom is not that token — the real ${symbolClash.symbol} is ${symbolClash.denom}.`,
    });
  }

  // 3b. Look-alike of a verified token (homoglyph / digit-swap / one-char off).
  if (!symbolClash && symbol) {
    const leet = normalizeLeet(symbol);
    const look = tokens.find((t) => {
      const ts = normalizeTight(t.symbol);
      if (ts === symTight) return false;
      return normalizeLeet(t.symbol) === leet || (symTight.length >= 4 && editDistance(ts, symTight) <= 1);
    });
    if (look) {
      warn = true;
      const trick = usesConfusables(symbol)
        ? 'using look-alike characters'
        : 'using a near-identical spelling';
      signals.push({
        level: 'warn',
        title: `Look-alike of verified token ${look.symbol}`,
        detail: `The symbol “${symbol}” closely resembles the verified ${look.name} (${look.symbol}) ${trick}. The real ${look.symbol} is ${look.denom}.`,
      });
    }
  }

  // 3c. Borrowing a known PROJECT / NFT collection name.
  for (const proj of KNOWN_PROJECTS) {
    const aliasTights = new Set(proj.aliases.map(normalizeTight));
    aliasTights.add(normalizeTight(proj.name));
    const projNameTight = normalizeTight(proj.name);
    const matched =
      (symTight && aliasTights.has(symTight)) ||
      (nameTight && aliasTights.has(nameTight)) ||
      (nameTight && projNameTight.length >= 5 && editDistance(nameTight, projNameTight) <= 1);
    if (!matched) continue;

    const official = officialTokenForAliases(aliasTights, tokens);
    if (official && official.denom === denom) break; // it is the official token (handled above)

    if (official) {
      danger = true;
      signals.push({
        level: 'danger',
        title: `Impersonates ${proj.name}`,
        detail: `This token uses the identity of ${proj.name}, whose official token is ${official.symbol} (${official.denom}). This denom is not it.`,
        link: proj.contract
          ? { label: `${proj.name} on explorer`, url: explorerContract(proj.contract) }
          : undefined,
      });
    } else {
      danger = true;
      const kind = proj.kind === 'nft-collection' ? 'NFT collection' : 'project';
      signals.push({
        level: 'danger',
        title: `Borrows the name of ${proj.name}`,
        detail: `This token advertises “${name || symbol}”, matching the well-known ${kind} ${proj.name}, which has no official token on Injective’s verified list. A token using its name is almost certainly not affiliated — verify directly with the project before buying.`,
        link: proj.contract
          ? { label: `Real ${proj.name} (NFT) on explorer`, url: explorerContract(proj.contract) }
          : undefined,
      });
    }
    break; // one project match is enough
  }

  // 3d. Nothing matched → unverified, but not evidence of anything either way.
  if (!danger && !warn) {
    signals.push({
      level: 'info',
      title: 'No impersonation match',
      detail:
        'This token is not on the verified list, and its name/symbol does not match any verified token or known project we track. That is neither good nor bad on its own — its identity is simply unverified.',
    });
  }

  signals.push(identitySignal(denom, name, symbol, creator));
  signals.push(DISCLAIMER);

  const verdict: Verdict = danger ? 'impersonation' : warn ? 'lookalike' : 'unverified';
  const headline = danger
    ? `Likely impersonation — this is not the real ${symbol || name}.`
    : warn
      ? `Look-alike of a verified token — check carefully.`
      : `Unverified token — no impersonation detected, but identity is unconfirmed.`;

  return { query, mode: 'denom', denom, onchainName: name, onchainSymbol: symbol, creator, verdict, headline, signals };
}

function identitySignal(
  denom: string,
  name: string | null,
  symbol: string | null,
  creator: string | null,
): Signal {
  const bits: string[] = [];
  if (name || symbol) bits.push(`Calls itself ${name || '—'}${symbol ? ` (${symbol})` : ''}.`);
  bits.push(`Denom: ${denom}.`);
  if (creator) bits.push(`Factory creator: ${creator}.`);
  return {
    level: 'info',
    title: 'On-chain identity',
    detail: bits.join(' '),
    link: creator ? { label: 'Creator on explorer', url: explorerAccount(creator) } : undefined,
  };
}

// ── Lookup mode: bare symbol/name → surface the real token(s)/project(s) ───────
function lookupMode(query: string, tokens: VerifiedToken[]): TokenCheck {
  const qTight = normalizeTight(query);
  const qLoose = normalizeLoose(query);
  const signals: Signal[] = [];

  const matchingTokens = tokens.filter(
    (t) => normalizeTight(t.symbol) === qTight || normalizeLoose(t.name) === qLoose,
  );
  for (const t of matchingTokens) {
    signals.push({
      level: 'ok',
      title: `Verified token ${t.symbol}`,
      detail: `The official ${t.name} (${t.symbol}) is ${t.denom}. Any other token using this symbol is not it.`,
    });
  }

  for (const proj of KNOWN_PROJECTS) {
    const aliasTights = new Set(proj.aliases.map(normalizeTight));
    aliasTights.add(normalizeTight(proj.name));
    if (!aliasTights.has(qTight) && normalizeLoose(proj.name) !== qLoose) continue;
    const official = officialTokenForAliases(aliasTights, tokens);
    signals.push({
      level: official ? 'info' : 'warn',
      title: `${proj.name} (${proj.kind === 'nft-collection' ? 'NFT collection' : 'project'})`,
      detail: official
        ? `${proj.name}’s official token is ${official.symbol} (${official.denom}).`
        : `${proj.name} has no official token on the verified list. Any token using this name is unaffiliated unless the project says otherwise.`,
      link: proj.contract ? { label: `${proj.name} on explorer`, url: explorerContract(proj.contract) } : undefined,
    });
  }

  signals.push(DISCLAIMER);

  const found = matchingTokens.length > 0 || signals.length > 1;
  return {
    query,
    mode: 'lookup',
    denom: null,
    onchainName: null,
    onchainSymbol: null,
    creator: null,
    verdict: matchingTokens.length ? 'verified' : found ? 'unverified' : 'unknown',
    headline: found
      ? `Here is what “${query}” officially refers to on Injective.`
      : `No verified token or known project matches “${query}”. Paste the token’s denom to check a specific one.`,
    signals,
  };
}
