import type { FeedCandidate } from './watch';
import { TEST_MODE, type Tier } from './thresholds';

const SITE_URL = process.env.FEED_SITE_URL ?? 'https://txtranslator.vercel.app';

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return `$${Math.round(n)}`;
}

function fmtPrice(n: number): string {
  if (n >= 1000) return `$${Math.round(n).toLocaleString('en-US')}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toPrecision(3)}`;
}

function fmtQty(n: number): string {
  if (n >= 1000) return Math.round(n).toLocaleString('en-US');
  return n.toFixed(3).replace(/\.?0+$/, '');
}

// Deterministic "what it means" line — the fallback when the Groq call
// fails, stalls, or produces junk. Never blocks, never surprises.
function fallbackContextLine(c: FeedCandidate): string {
  if (c.kind === 'liquidation') {
    if (c.pnlUsd && c.pnlUsd < 0) {
      return `${fmtUsd(Math.abs(c.pnlUsd))} gone. This is why you set a stop-loss.`;
    }
    return 'This is why you set a stop-loss.';
  }
  if (c.kind === 'position_close') {
    const pnl = c.pnlUsd ?? 0;
    if (pnl > 0) {
      // Return on the position's entry value, when the numbers allow it
      const entryValue = c.notionalUsd - pnl;
      const pct = entryValue > 0 ? (pnl / entryValue) * 100 : null;
      return pct && pct >= 0.5
        ? `A ${pct.toFixed(pct >= 10 ? 0 : 1)}% move, captured. Profit is only real once you close.`
        : 'Profit is only real once you close. This one just did.';
    }
    return 'Cut, not liquidated — the difference is choosing your own exit.';
  }
  if (c.isTradFi) {
    if (c.leverage && c.leverage >= 2) {
      const pct = Math.round(100 / c.leverage);
      return `Real ${c.baseSymbol} exposure, on-chain, 24/7 — and a ${pct}% move against ends it.`;
    }
    return `That's real-world ${c.baseSymbol} exposure trading on-chain, around the clock.`;
  }
  if (c.leverage && c.leverage >= 2) {
    const pct = Math.round(100 / c.leverage);
    const move = c.direction === 'short' ? 'pump' : 'dip';
    const tail = c.leverage >= 10 ? ' Bold.' : '';
    return `A ${pct}% ${move} wipes the whole position.${tail}`;
  }
  if (c.marginUsd) {
    return `That's ${fmtUsd(c.marginUsd)} of real margin behind it.`;
  }
  return 'Decoded in plain English below.';
}

// ── Groq context line ──
// One short LLM call per post that actually publishes (≤ a handful per hour
// behind the caps), hard-capped so the tick never stalls on the AI.

const GROQ_TIMEOUT_MS = 5_000;

const CONTEXT_SYSTEM_PROMPT = `You write line 3 of a 4-line whale-alert post about a derivatives trade on Injective. Line 1 announces the trade, line 2 has the raw numbers, line 4 is a link — your line adds the ONE thing the numbers imply: the risk, the irony, or something a retail trader learns from it. Dry, sharp voice.

Rules:
- Maximum 120 characters. One line only.
- No emoji, no hashtags, no quotation marks around the output.
- Never restate numbers already given except to reframe them (e.g. what % move liquidates).
- No financial advice, no price predictions, never address the trader directly.
- Return ONLY the line, nothing else.`;

function contextFacts(c: FeedCandidate, tier: Tier): string {
  const event =
    c.kind === 'liquidation' ? 'position liquidated (forced close)'
    : c.kind === 'position_close' ? ((c.pnlUsd ?? 0) > 0 ? 'position closed voluntarily at a profit' : 'position closed voluntarily at a loss (trader cut it before liquidation)')
    : 'perp position opened';
  const lines = [
    `Event: ${event}${tier === 'hero' ? ' — exceptionally large' : ''}`,
    `Market: ${c.ticker}`,
    `Notional: $${Math.round(c.notionalUsd).toLocaleString('en-US')}`,
  ];
  if (c.direction) lines.push(`Side: ${c.direction}`);
  if (c.leverage) lines.push(`Leverage: ${c.leverage.toFixed(1)}x (a ${Math.round(100 / c.leverage)}% adverse move liquidates it)`);
  if (c.marginUsd) lines.push(`Margin: $${Math.round(c.marginUsd).toLocaleString('en-US')}`);
  if (c.price) lines.push(`Entry/exit price: $${c.price.toLocaleString('en-US')}`);
  if (c.pnlUsd && c.pnlUsd > 0) lines.push(`Realized profit: $${Math.round(c.pnlUsd).toLocaleString('en-US')}`);
  if (c.pnlUsd && c.pnlUsd < 0) lines.push(`Realized loss: $${Math.round(Math.abs(c.pnlUsd)).toLocaleString('en-US')}`);
  if (c.isTradFi) {
    lines.push('Angle: this is a tokenized stock/FX perpetual — real-world market exposure trading on-chain 24/7, including when the actual exchange is closed. Worth working in.');
  }
  return lines.join('\n');
}

export interface ContextLine {
  line: string;
  source: 'groq' | 'template';
}

export async function generateContextLine(c: FeedCandidate, tier: Tier): Promise<ContextLine> {
  const fallback = fallbackContextLine(c);
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { line: fallback, source: 'template' };

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // Groq retired the Llama models; gpt-oss-120b replaces it. It's a
        // reasoning model whose reasoning tokens count toward max_tokens, so we
        // cap reasoning to 'low' and lift the budget enough to fit a one-liner.
        model: 'openai/gpt-oss-120b',
        reasoning_effort: 'low',
        max_tokens: 160,
        temperature: 0.8,
        messages: [
          { role: 'system', content: CONTEXT_SYSTEM_PROMPT },
          { role: 'user', content: contextFacts(c, tier) },
        ],
      }),
      signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
    });
    if (!res.ok) return { line: fallback, source: 'template' };
    const data = await res.json();
    const raw: string = data?.choices?.[0]?.message?.content ?? '';
    const line = raw
      .split('\n')
      .map((s: string) => s.trim())
      .filter(Boolean)[0]
      ?.replace(/^["'`]+|["'`]+$/g, '') ?? '';
    if (line.length < 10 || line.length > 160) return { line: fallback, source: 'template' };
    return { line, source: 'groq' };
  } catch {
    return { line: fallback, source: 'template' };
  }
}

// Four lines: hook / numbers / context / link. `context` comes from
// generateContextLine(); omitted → deterministic template.
interface PostLines {
  hook: string;
  numbers: string;
  context: string;
  link: string;
}

function buildLines(c: FeedCandidate, tier: Tier, context?: string | null): PostLines {
  const url = `${SITE_URL}/tx/0x${c.hash}`;
  const base = c.baseSymbol;
  // Cashtag in the hook so X indexes the post for the asset ($INJ etc.).
  // Kept to the hook only — one cashtag per post; the size line stays a plain unit.
  const tag = `$${base}`;
  const prefix = TEST_MODE ? '[TEST] ' : '';
  const ctx = context ?? fallbackContextLine(c);

  if (c.kind === 'liquidation') {
    const emoji = tier === 'hero' ? '🚨💀' : '💀';
    const side = c.direction ? ` ${c.direction}` : '';
    return {
      hook: `${prefix}${emoji} Rekt. A ${fmtUsd(c.notionalUsd)} ${tag}${side} just got liquidated on Injective.`,
      numbers: `Size ${fmtQty(c.quantity ?? 0)} ${base} · forced out at ${fmtPrice(c.price ?? 0)}.`,
      context: ctx,
      link: `Full breakdown 👉 ${url}`,
    };
  }

  if (c.kind === 'position_close') {
    const pnl = c.pnlUsd ?? 0;
    const win = pnl > 0;
    const emoji = tier === 'hero' ? (win ? '🚨💰' : '🚨🩸') : (win ? '💰' : '🩸');
    const side = c.direction ? ` ${c.direction}` : '';
    const result = win
      ? `banking +${fmtUsd(pnl)} profit`
      : `eating a ${fmtUsd(Math.abs(pnl))} loss`;
    return {
      hook: `${prefix}${emoji} Someone just closed a ${fmtUsd(c.notionalUsd)}${c.isTradFi ? ` tokenized ${tag}` : ` ${tag}`}${side} on Injective, ${result}.`,
      numbers: `Size ${fmtQty(c.quantity ?? 0)} ${base} · exit at ${fmtPrice(c.price ?? 0)}.`,
      context: ctx,
      link: `Full breakdown 👉 ${url}`,
    };
  }

  const emoji = tier === 'hero' ? '🚨🐋' : '🐋';
  const side = c.direction === 'short' ? 'Short' : 'Long';
  const lev = c.leverage ? `, ${c.leverage.toFixed(c.leverage >= 10 ? 0 : 1).replace(/\.0$/, '')}x` : '';
  const hook = c.isTradFi
    ? `${prefix}${emoji} Someone just opened a ${fmtUsd(c.notionalUsd)} tokenized ${tag} position on Injective. ${side}${lev}.`
    : `${prefix}${emoji} Someone just opened a ${fmtUsd(c.notionalUsd)} ${tag} perp on Injective. ${side}${lev}.`;
  return {
    hook,
    numbers: `Entry ${fmtPrice(c.price ?? 0)} · margin ${fmtUsd(c.marginUsd ?? 0)} ${c.quoteSymbol}.`,
    context: ctx,
    link: `Decoded 👉 ${url}`,
  };
}

/** Full 4-line post — Discord (no length constraint that matters). */
export function formatPost(c: FeedCandidate, tier: Tier, context?: string | null): string {
  const l = buildLines(c, tier, context);
  return [l.hook, l.numbers, l.context, l.link].join('\n');
}

export interface XPost {
  /** Link-free main tweet — X buries link posts and bills them 13× more. */
  main: string;
  /** The decode link, posted as a reply (hero tier only — cost control). */
  linkReply: string;
}

const X_MAX_CHARS = 275; // headroom under the hard 280

/** X variant: link goes in a reply, main text trimmed to fit 280. */
export function formatPostForX(c: FeedCandidate, tier: Tier, context?: string | null): XPost {
  const l = buildLines(c, tier, context);
  let main = [l.hook, l.numbers, l.context].join('\n');
  if (main.length > X_MAX_CHARS) {
    // The context line is the flexible one — trim it before dropping it
    const fixed = l.hook.length + l.numbers.length + 2;
    const room = X_MAX_CHARS - fixed;
    main = room >= 20
      ? [l.hook, l.numbers, `${l.context.slice(0, room - 1)}…`].join('\n')
      : [l.hook, l.numbers].join('\n');
  }
  return { main, linkReply: l.link };
}
