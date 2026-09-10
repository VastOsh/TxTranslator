import type { FeedCandidate, FeedEventKind } from './watch';
import type { Tier } from './thresholds';

// ── The durable record behind the on-site whale feed ──────────────────────
// Publishing is fire-and-forget: once a tick has posted to X and Discord the
// event is gone from our side, and the only archive is a Twitter timeline we
// don't own. A FeedEvent is the same candidate the publisher acted on, frozen
// with the context line that shipped with it, so /feed can replay the last few
// days without re-scanning the chain.
//
// Deliberately not a FeedCandidate: subaccountId and blockHeight are internal
// plumbing the page never shows, and every stored byte is a Redis byte. It is
// also written and read as JSON in an external store, so parseFeedEvent()
// treats anything coming back as untrusted — a shape change here must never
// throw on rows written by the previous deploy.

/** A published whale event, as /feed stores and replays it. */
export interface FeedEvent {
  kind: FeedEventKind;
  /** Dedup key of the aggressing order — also the stable id for a row. */
  orderHash: string;
  /** Tx hash, lowercase hex without `0x`. Links to /tx/0x<hash>. */
  hash: string;
  executedAt: number; // ms
  ticker: string;
  baseSymbol: string;
  quoteSymbol: string;
  direction: 'long' | 'short' | null;
  notionalUsd: number;
  marginUsd: number | null;
  leverage: number | null;
  price: number | null;
  quantity: number | null;
  pnlUsd: number | null;
  isTradFi: boolean;
  /** 'skip' never reaches storage — only published events are recorded. */
  tier: PublishedTier;
  /** The one-line take that shipped with the post (Groq or template). */
  context: string;
}

export type PublishedTier = Exclude<Tier, 'skip'>;

/** USD amounts are rounded on the way in; sub-dollar precision is noise here. */
function roundUsd(n: number | null): number | null {
  return n == null ? null : Math.round(n);
}

export function toFeedEvent(c: FeedCandidate, tier: PublishedTier, context: string): FeedEvent {
  return {
    kind: c.kind,
    orderHash: c.orderHash,
    hash: c.hash,
    executedAt: c.executedAt,
    ticker: c.ticker,
    baseSymbol: c.baseSymbol,
    quoteSymbol: c.quoteSymbol,
    direction: c.direction,
    notionalUsd: Math.round(c.notionalUsd),
    marginUsd: roundUsd(c.marginUsd),
    // Prices can be well under $1 (and quantities well over a million), so
    // these keep their precision where the USD figures don't.
    leverage: c.leverage,
    price: c.price,
    quantity: c.quantity,
    pnlUsd: roundUsd(c.pnlUsd),
    isTradFi: c.isTradFi,
    tier,
    context,
  };
}

const KINDS: FeedEventKind[] = ['perp_open', 'liquidation', 'position_close'];

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * Parse one stored row back into a FeedEvent, or null if it is malformed or
 * was written by an older shape. Rows come from Redis, so nothing here may
 * assume the payload is one we wrote.
 */
export function parseFeedEvent(raw: string): FeedEvent | null {
  let p: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    p = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  const kind = str(p.kind) as FeedEventKind;
  const executedAt = num(p.executedAt);
  const notionalUsd = num(p.notionalUsd);
  // Without these a row can't be rendered or ordered at all.
  if (!KINDS.includes(kind) || executedAt == null || notionalUsd == null) return null;
  if (!str(p.orderHash) || !str(p.ticker)) return null;

  const direction = p.direction === 'long' || p.direction === 'short' ? p.direction : null;

  return {
    kind,
    orderHash: str(p.orderHash),
    hash: str(p.hash),
    executedAt,
    ticker: str(p.ticker),
    baseSymbol: str(p.baseSymbol),
    quoteSymbol: str(p.quoteSymbol),
    direction,
    notionalUsd,
    marginUsd: num(p.marginUsd),
    leverage: num(p.leverage),
    price: num(p.price),
    quantity: num(p.quantity),
    pnlUsd: num(p.pnlUsd),
    isTradFi: p.isTradFi === true,
    tier: p.tier === 'hero' ? 'hero' : 'notable',
    context: str(p.context),
  };
}
