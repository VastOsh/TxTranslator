import { getVerifiedTokens, getRestrictedWallets, KNOWN_PROJECTS, type VerifiedToken } from './reference';
import { findSpotMarketByBase, choiceTradeUrl, choiceTokenUrl, type SpotMarket } from './market';
import { normalizeTight, normalizeLoose, normalizeLeet, usesConfusables, editDistance } from './normalize';
import {
  isLaunchpadDenom, fetchLaunchInfo, fetchLaunchpadHolders, fetchCreatorStats, type LaunchpadHolders,
} from './launchpad';
import { lookupSerialFunders } from './insiders';

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
  market: { ticker: string; marketId: string; status: string; url: string | null } | null;
  verdict: Verdict;
  headline: string;
  signals: Signal[];
  holders: LaunchpadHolders | null;
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
function talisCollectionUrl(contract: string) {
  return `https://injective.talis.art/collection/${contract}`;
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

  // Has it graduated to a real spot market? (read once; used in every branch)
  const spot = await findSpotMarketByBase(denom);
  const market = spot
    ? { ticker: spot.ticker, marketId: spot.marketId, status: spot.status, url: choiceTradeUrl(spot.marketId) }
    : null;

  // Launchpad rug-risk signals (empty + no network call for non-launchpad denoms).
  const launchpad = await buildLaunchpadSignals(denom, creator);
  const launchpadSignals = launchpad.signals;

  // 1. Already in the verified registry → it IS the official token.
  const registered = tokens.find((t) => t.denom === denom);
  if (registered) {
    signals.push({
      level: 'ok',
      title: `Verified token: ${registered.symbol}`,
      detail: `This denom is ${registered.name} (${registered.symbol}) on Injective’s official verified token list. This is the real one.`,
      link: { label: `Open ${registered.symbol} on Choice`, url: choiceTokenUrl(denom) },
    });
    signals.push(identitySignal(denom, registered.name, registered.symbol, creator));
    signals.push(marketSignal(spot));
    signals.push(DISCLAIMER);
    return {
      query, mode: 'denom', denom, onchainName: registered.name, onchainSymbol: registered.symbol,
      creator, market, verdict: 'verified', headline: `Verified: this is the official ${registered.symbol}.`, signals,
      holders: launchpad.holders,
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
    signals.push(...launchpadSignals);
    signals.push(marketSignal(spot));
    signals.push(DISCLAIMER);
    return {
      query, mode: 'denom', denom, onchainName: null, onchainSymbol: null, creator, market,
      verdict: 'unknown', headline: 'Not on the verified list and no readable metadata — unverified.', signals,
      holders: launchpad.holders,
    };
  }

  const name = meta.name || '';
  const symbol = meta.symbol || '';
  const symTight = normalizeTight(symbol);
  const nameTight = normalizeTight(name);

  let danger = false;
  let warn = false;
  let targetLabel: string | null = null; // the trusted thing being impersonated, for the headline

  // ── 3a/3b. Compare against the verified TOKEN registry ──────────────────────
  // For each verified token, measure how the candidate relates to it: an exact
  // symbol/name collision at a different denom (claiming to BE it), or a
  // near-miss by look-alike characters / digit swaps / one dropped-or-changed
  // character (XII vs XIII, 1NJ vs INJ, CULT vs CVLT). Matching a verified token
  // on BOTH symbol and name by a near-miss is strong evidence of deliberate
  // impersonation, so it escalates from a look-alike warning to a danger.
  const symLeet = symbol ? normalizeLeet(symbol) : '';
  let best:
    | { t: VerifiedToken; exactSym: boolean; exactName: boolean; symNear: boolean; nameNear: boolean; score: number }
    | null = null;

  for (const t of tokens) {
    if (t.denom === denom) continue;
    const tSym = normalizeTight(t.symbol);
    const tName = normalizeTight(t.name);

    const exactSym = !!symTight && symTight === tSym;
    const exactName = !exactSym && !!nameTight && nameTight === tName && tName.length >= 4;
    // Near-miss on symbol: same after digit/look-alike folding, or one edit apart
    // (gated on the longer of the two being ≥4 so 2–3 char tickers don't collide).
    const symNear =
      !exactSym && !!symbol &&
      (normalizeLeet(t.symbol) === symLeet ||
        (Math.max(symTight.length, tSym.length) >= 4 && editDistance(symTight, tSym) === 1));
    // Near-miss on name: one edit apart on names of real length (≥5) — a strong,
    // low-coincidence signal.
    const nameNear = !exactName && !!nameTight && tName.length >= 5 && editDistance(nameTight, tName) === 1;

    if (!exactSym && !exactName && !symNear && !nameNear) continue;

    const score = (exactSym ? 8 : 0) + (exactName ? 6 : 0) + (symNear ? 3 : 0) + (nameNear ? 3 : 0);
    if (!best || score > best.score) best = { t, exactSym, exactName, symNear, nameNear, score };
  }

  if (best) {
    const { t, exactSym, exactName, symNear, nameNear } = best;
    targetLabel = t.symbol;
    const realLink = { label: `Open the real ${t.symbol} on Choice`, url: choiceTokenUrl(t.denom) };
    if (exactSym) {
      danger = true;
      signals.push({
        level: 'danger',
        title: `Impersonates the verified token ${t.symbol}`,
        detail: `This token advertises the symbol “${symbol}”, which belongs to the verified ${t.name} (${t.symbol}). This denom is not that token — the real ${t.symbol} is ${t.denom}.`,
        link: realLink,
      });
    } else if (exactName) {
      danger = true;
      signals.push({
        level: 'danger',
        title: `Impersonates the verified token ${t.symbol}`,
        detail: `This token’s name “${name}” matches the verified ${t.name} (${t.symbol}) at a different denom. The real one is ${t.denom}.`,
        link: realLink,
      });
    } else if (symNear && nameNear) {
      danger = true;
      const homoglyph = usesConfusables(symbol) || usesConfusables(name);
      signals.push({
        level: 'danger',
        title: `Near-identical to verified token ${t.symbol}`,
        detail: `Both the symbol “${symbol}” and name “${name}” are one character away from the verified ${t.name} (${t.symbol})${homoglyph ? ' and use look-alike characters' : ''} — a classic impersonation pattern. The real ${t.symbol} is ${t.denom}.`,
        link: realLink,
      });
    } else {
      warn = true;
      const field = symNear ? `symbol “${symbol}”` : `name “${name}”`;
      const trick = usesConfusables(symbol) || usesConfusables(name)
        ? 'uses look-alike characters'
        : 'is a near-identical spelling';
      signals.push({
        level: 'warn',
        title: `Look-alike of verified token ${t.symbol}`,
        detail: `Its ${field} closely resembles the verified ${t.name} (${t.symbol}) — it ${trick}. The real ${t.symbol} is ${t.denom}.`,
        link: realLink,
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

    targetLabel = proj.name;
    if (official) {
      danger = true;
      signals.push({
        level: 'danger',
        title: `Impersonates ${proj.name}`,
        detail: `This token uses the identity of ${proj.name}, whose official token is ${official.symbol} (${official.denom}). This denom is not it.`,
        link: { label: `Open the real ${official.symbol} on Choice`, url: choiceTokenUrl(official.denom) },
      });
    } else {
      danger = true;
      const kind = proj.kind === 'nft-collection' ? 'NFT collection' : 'project';
      signals.push({
        level: 'danger',
        title: `Borrows the name of ${proj.name}`,
        detail: `This token advertises “${name || symbol}”, matching the well-known ${kind} ${proj.name}, which has no official token on Injective’s verified list. A token using its name is almost certainly not affiliated — verify directly with the project before buying.`,
        link: proj.contract
          ? proj.kind === 'nft-collection'
            ? { label: `View ${proj.name} on Talis`, url: talisCollectionUrl(proj.contract) }
            : { label: `${proj.name} on explorer`, url: explorerContract(proj.contract) }
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
  signals.push(...launchpadSignals);
  signals.push(marketSignal(spot));
  signals.push(DISCLAIMER);

  const verdict: Verdict = danger ? 'impersonation' : warn ? 'lookalike' : 'unverified';
  const headline = danger
    ? `Likely impersonation${targetLabel ? ` of ${targetLabel}` : ''} — this is not the real ${targetLabel ?? symbol ?? name}.`
    : warn
      ? `Look-alike of the verified ${targetLabel ?? 'token'} — check carefully.`
      : `Unverified token — no impersonation detected, but identity is unconfirmed.`;

  return { query, mode: 'denom', denom, onchainName: name, onchainSymbol: symbol, creator, market, verdict, headline, signals, holders: launchpad.holders };
}

// Whether a token has graduated to a real Injective spot market (Choice/Helix
// trade the same on-chain market). Presence + active status is a legitimacy
// signal; absence is neutral (may simply not have bonded yet).
function marketSignal(m: SpotMarket | null): Signal {
  if (m && m.status === 'active') {
    const url = choiceTradeUrl(m.marketId);
    return {
      level: 'ok',
      title: `Live market: ${m.ticker}`,
      detail: `This token has graduated to a real spot market on Injective’s exchange, trading as ${m.ticker}. Choice and Helix trade this same on-chain market.`,
      link: url ? { label: `Trade ${m.ticker} on Choice`, url } : undefined,
    };
  }
  if (m) {
    return {
      level: 'info',
      title: `Market ${m.ticker} is ${m.status || 'not active'}`,
      detail: `A spot market for this token exists (${m.marketId}) but is currently ${m.status || 'inactive'} — trading may be paused.`,
    };
  }
  return {
    level: 'info',
    title: 'No exchange market yet',
    detail:
      'No spot market for this token on Injective’s exchange. It has not graduated/bonded to a market (or trades only on the launchpad’s bonding curve) — expected for a brand-new token, but it also means there is no established market to compare against.',
  };
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

// ── Trippy launchpad rug-risk signals ─────────────────────────────────────
// For tokens minted by the launchpad, surface what its own contract exposes:
// how concentrated supply is in the launch wallet, whether more can still be
// minted, the dev's track record, and the token's stage/age. Honest signals,
// not a verdict — a launchpad token is not inherently a scam.
function ageLabel(registeredAt: number): string {
  if (!registeredAt) return 'recently';
  const s = Math.floor(Date.now() / 1000) - registeredAt;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  const d = Math.round(s / 86400);
  return d <= 1 ? 'about a day ago' : `${d} days ago`;
}

function pctText(n: number): string {
  return (n >= 1 ? n.toFixed(1) : n.toFixed(2)).replace(/\.?0+$/, '');
}

// Compact INJ amount: big numbers get thousands separators, small ones keep
// enough significant digits to not read as zero.
function fmtInj(n: number): string {
  if (n >= 1000) return Math.round(n).toLocaleString('en-US');
  if (n >= 1) return n.toFixed(2).replace(/\.?0+$/, '');
  if (n >= 0.0001) return n.toFixed(4).replace(/\.?0+$/, '');
  return n > 0 ? n.toExponential(1) : '0';
}

async function buildLaunchpadSignals(
  denom: string,
  creator: string | null,
): Promise<{ signals: Signal[]; holders: LaunchpadHolders | null }> {
  if (!isLaunchpadDenom(creator)) return { signals: [], holders: null };
  const info = await fetchLaunchInfo(denom);
  if (!info) return { signals: [], holders: null };
  // Budget the funding-graph sweep so the whole check stays inside maxDuration.
  const holders = await fetchLaunchpadHolders(denom, info.totalSupplyRaw, { clusterBudgetMs: 12_000 });

  const out: Signal[] = [];

  // Sanctioned / restricted wallet involved — the most authoritative red flag.
  // Injective's own OFAC + restricted list is EVM hex; the dev and holder
  // addresses are hex too, so we compare 0x-stripped and lowercased.
  if (holders) {
    const restricted = await getRestrictedWallets();
    const norm = (a: string) => a.replace(/^0x/, '').toLowerCase();
    const hits: string[] = [];
    if (holders.devCreator && restricted.has(norm(holders.devCreator))) hits.push('the token’s creator');
    if (holders.bubble.slice(0, 12).some((b) => restricted.has(norm(b.address)))) hits.push('a top holder');
    if (hits.length) {
      out.push({
        level: 'danger',
        title: 'Sanctioned / restricted wallet involved',
        detail: `${hits.join(' and ')} ${hits.length === 1 ? 'is' : 'are'} on Injective’s OFAC / restricted wallet list. Interacting with this token may be restricted — treat it as high-risk.`,
      });
    }
  }

  // The launchpad's own verdict — the strongest single signal when present.
  if (holders?.flagged) {
    out.push({
      level: 'danger',
      title: 'Flagged by the launchpad',
      detail: holders.impersonates
        ? `The Trippy launchpad has flagged this launch as impersonating ${holders.impersonates}. Treat it as a scam token unless the project itself says otherwise.`
        : 'The Trippy launchpad has flagged this launch (typically for impersonation or abuse). Treat it as high-risk.',
    });
  } else if (holders?.impersonates) {
    out.push({
      level: 'warn',
      title: `Launchpad notes a resemblance to ${holders.impersonates}`,
      detail: `The launchpad associates this launch with ${holders.impersonates}. It is not flagged outright, but verify it is the one you intend before buying.`,
    });
  }
  const onCurve = !info.graduated && info.status !== 'delivered';
  const stageWord = info.graduated ? 'graduated' : info.status === 'delivered' ? 'delivered' : 'on the curve';
  const stageDetail = info.graduated
    ? 'graduated to a live market'
    : info.status === 'delivered'
      ? 'completed its bonding curve (delivered), but is not on a live exchange market'
      : 'still on the bonding curve — not yet graduated';

  // Stage + age
  out.push({
    level: onCurve ? 'warn' : 'info',
    title: `Launchpad token — ${stageWord}`,
    detail: `Minted on the Trippy launchpad and ${stageDetail}. Launched ${ageLabel(info.registeredAt)}.${onCurve ? ' Early tokens sit on a bonding curve until they graduate to a real market.' : ''}`,
  });

  // Holders + concentration — real holders only (escrow/pools labeled & excluded).
  // Source is the launchpad's own backend (chain-level holder enumeration is off),
  // which labels protocol addresses so a curve escrow isn't mistaken for a whale.
  if (holders) {
    const p = holders.topRealPct;
    const lowTraction = holders.userHolders < 15;
    const level: SignalLevel = p >= 20 ? 'danger' : p >= 10 || lowTraction ? 'warn' : 'info';
    out.push({
      level,
      title: `${holders.userHolders} real holder${holders.userHolders === 1 ? '' : 's'}${p >= 10 ? ` · top holds ${pctText(p)}%` : ''}`,
      detail:
        `${holders.totalHolders} addresses hold this token; ${holders.userHolders} are real wallets (the rest are the bonding-curve escrow and pools). ` +
        (p >= 10
          ? `The largest real holder controls ${pctText(p)}% of supply and the top 10 hold ${pctText(holders.top10RealPct)}% — enough to move the price sharply on a sell. `
          : `The largest real holder controls ${pctText(p)}% — no single wallet dominates the float. `) +
        (onCurve ? `${pctText(holders.escrowPct)}% of supply is still unsold in the curve escrow${lowTraction ? ', and very few wallets hold it — little traction so far' : ''}.` : ''),
    });
  }

  // Sell-impact — how far a large holder can push the price on the bonding curve.
  // Exact math on the curve reserves (verified against real fills), so this is a
  // fact about current liquidity, not an estimate.
  if (holders?.sellImpact && holders.sellImpact.rows.length) {
    const si = holders.sellImpact;
    const headline = si.rows.find((r) => r.label.startsWith('Largest holder')) ?? si.rows[0];
    const all = si.rows.find((r) => r.label === 'All circulating');
    const impact = headline.priceImpactPct;
    const level: SignalLevel = impact >= 50 ? 'danger' : impact >= 20 ? 'warn' : 'info';
    out.push({
      level,
      title: `Sell impact — ${headline.label.toLowerCase()} moves price −${pctText(impact)}%`,
      detail:
        `On the bonding curve, ${headline.label.toLowerCase()} (${pctText(headline.pctCirculating)}% of circulating) would net about ${fmtInj(headline.injReceived)} INJ and push the price down ${pctText(impact)}%. ` +
        (all ? `Unwinding all circulating supply nets roughly ${fmtInj(all.injReceived)} INJ. ` : '') +
        'Curve liquidity is shallow early on, so a large holder can move the price sharply.',
    });
  }

  // Wallet connections — top holders that were first funded by the same wallet.
  // Honest framing: shared funding can be an insider/sybil cluster, or just a
  // common exchange withdrawal address. We state the fact and link the funder.
  if (holders && holders.clustersResolved && holders.clusters.length > 0) {
    const c = holders.clusters[0];
    const nConnected = holders.clusters.reduce(
      (s, cl) => s + cl.members.length + (cl.funderIsHolder ? 1 : 0), 0,
    );
    const groups = holders.clusters.length;
    const level: SignalLevel = holders.clusteredPct >= 20 || holders.largestClusterSize >= 4 ? 'warn' : 'info';
    out.push({
      level,
      title: `Connected wallets: ${nConnected} of the top holders in ${groups} cluster${groups === 1 ? '' : 's'}`,
      detail:
        `Among the top real holders, ${nConnected} trace back to a shared funding wallet across ${groups} group${groups === 1 ? '' : 's'} ` +
        `(largest: ${c.funderIsHolder ? c.members.length + 1 : c.members.length} wallets, ~${pctText(c.pct)}% of supply). ` +
        'Wallets funded from one source can be a single entity holding through many addresses (an insider/sybil cluster) — ' +
        'or simply people who withdrew from the same exchange. Shown as a signal, not a verdict; check the funder yourself.',
      link: { label: 'Funder on explorer', url: explorerAccount(c.funder) },
    });

    // Cross-token context: is this cluster's funder a repeat insider across other
    // launchpad tokens? Guarded lookup — a cold index is skipped, never blocks.
    const serial = await lookupSerialFunders(holders.clusters.map((cl) => cl.funder));
    const repeat = [...serial.values()].filter((s) => s.launchCount >= 2).sort((a, b) => b.launchCount - a.launchCount)[0];
    if (repeat) {
      const syms = repeat.tokens.map((t) => t.symbol || `#${t.onchainId}`).slice(0, 6).join(', ');
      out.push({
        level: repeat.launchCount >= 3 ? 'danger' : 'warn',
        title: `Repeat insider funder — active across ${repeat.launchCount} launchpad tokens`,
        detail:
          `A wallet that funded this token’s connected holders has also seeded the top holders of other Trippy-launchpad tokens (${syms}). ` +
          'A funder recurring across many launches points to a coordinated operator or market-maker fleet — strong context for the cluster above.',
        link: { label: 'See all launchpad insiders', url: '/insiders' },
      });
    }
  } else if (holders && holders.clustersResolved && holders.bubble.length >= 3) {
    out.push({
      level: 'ok',
      title: 'No wallet connections found',
      detail: 'The top real holders were each funded independently — no shared funding source that would suggest one entity holding through multiple wallets.',
    });
  }

  // Creator track record — dev reputation, never identity. How many tokens this
  // wallet has launched and how many reached a live market. Serial launches with
  // nothing graduating is a churn-and-dump pattern.
  if (holders?.devCreator) {
    const stats = await fetchCreatorStats(holders.devCreator);
    if (stats && stats.launched >= 1) {
      const others = stats.launched - 1; // this token is one of them
      const serial = stats.launched >= 5 && stats.graduated === 0;
      out.push({
        level: serial ? 'warn' : stats.launched >= 4 ? 'warn' : 'info',
        title: others <= 0
          ? 'Creator’s first launchpad token'
          : `Creator has launched ${stats.launched} launchpad tokens`,
        detail: others <= 0
          ? `This is the only token this wallet has launched on the Trippy launchpad${stats.graduated > 0 ? ', and it graduated to a live market' : ' — no track record yet, good or bad'}.`
          : `This wallet has launched ${stats.launched} tokens on the Trippy launchpad (including this one); ${stats.graduated} graduated to a live market. ` +
            (serial
              ? 'Many launches with none graduating is a churn-and-dump pattern — be cautious.'
              : stats.graduated > 0
                ? 'A creator with graduated tokens has some track record, though past launches are no guarantee.'
                : 'None have graduated yet.'),
      });
    }
  }

  // Mint authority
  out.push(
    info.adminRenounced
      ? {
          level: 'ok',
          title: 'Mint authority renounced',
          detail: 'The launch admin has been renounced — total supply is fixed and no more can be minted.',
        }
      : {
          level: 'warn',
          title: 'Mint authority not renounced',
          detail:
            'The launch contract can still mint additional supply, which would dilute existing holders. Supply is not fixed.',
        },
  );

  return { signals: out, holders };
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
      link: { label: `Open ${t.symbol} on Choice`, url: choiceTokenUrl(t.denom) },
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
      link: proj.contract
        ? proj.kind === 'nft-collection'
          ? { label: `View ${proj.name} on Talis`, url: talisCollectionUrl(proj.contract) }
          : { label: `${proj.name} on explorer`, url: explorerContract(proj.contract) }
        : undefined,
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
    market: null,
    verdict: matchingTokens.length ? 'verified' : found ? 'unverified' : 'unknown',
    holders: null,
    headline: found
      ? `Here is what “${query}” officially refers to on Injective.`
      : `No verified token or known project matches “${query}”. Paste the token’s denom to check a specific one.`,
    signals,
  };
}
