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
  const lines = [
    `Event: ${c.kind === 'liquidation' ? 'position liquidated (forced close)' : 'perp position opened'}${tier === 'hero' ? ' — exceptionally large' : ''}`,
    `Market: ${c.ticker}`,
    `Notional: $${Math.round(c.notionalUsd).toLocaleString('en-US')}`,
  ];
  if (c.direction) lines.push(`Side: ${c.direction}`);
  if (c.leverage) lines.push(`Leverage: ${c.leverage.toFixed(1)}x (a ${Math.round(100 / c.leverage)}% adverse move liquidates it)`);
  if (c.marginUsd) lines.push(`Margin: $${Math.round(c.marginUsd).toLocaleString('en-US')}`);
  if (c.price) lines.push(`Entry/exit price: $${c.price.toLocaleString('en-US')}`);
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
        model: 'llama-3.3-70b-versatile',
        max_tokens: 80,
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

// Four lines: hook / numbers / context / link. Keep it comfortably under
// X's 280-char limit (URL counts as 23 via t.co). `context` comes from
// generateContextLine(); omitted → deterministic template.
export function formatPost(c: FeedCandidate, tier: Tier, context?: string | null): string {
  const url = `${SITE_URL}/tx/0x${c.hash}`;
  const base = c.baseSymbol;
  const prefix = TEST_MODE ? '[TEST] ' : '';
  const ctx = context ?? fallbackContextLine(c);

  if (c.kind === 'liquidation') {
    const emoji = tier === 'hero' ? '🚨💀' : '💀';
    const side = c.direction ? ` ${c.direction}` : '';
    const lines = [
      `${prefix}${emoji} Rekt. A ${fmtUsd(c.notionalUsd)} ${base}${side} just got liquidated on Injective.`,
      `Size ${fmtQty(c.quantity ?? 0)} ${base} · forced out at ${fmtPrice(c.price ?? 0)}.`,
      ctx,
      `Full breakdown 👉 ${url}`,
    ];
    return lines.join('\n');
  }

  const emoji = tier === 'hero' ? '🚨🐋' : '🐋';
  const side = c.direction === 'short' ? 'Short' : 'Long';
  const lev = c.leverage ? `, ${c.leverage.toFixed(c.leverage >= 10 ? 0 : 1).replace(/\.0$/, '')}x` : '';
  const hook = c.isTradFi
    ? `${prefix}${emoji} Someone just opened a ${fmtUsd(c.notionalUsd)} tokenized ${base} position on Injective. ${side}${lev}.`
    : `${prefix}${emoji} Someone just opened a ${fmtUsd(c.notionalUsd)} ${base} perp on Injective. ${side}${lev}.`;
  const lines = [
    hook,
    `Entry ${fmtPrice(c.price ?? 0)} · margin ${fmtUsd(c.marginUsd ?? 0)} ${c.quoteSymbol}.`,
    ctx,
    `Decoded 👉 ${url}`,
  ];
  return lines.join('\n');
}
