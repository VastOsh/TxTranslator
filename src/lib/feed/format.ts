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

// Deterministic "what it means" line — M2 swaps this for a Groq call with
// this exact output as the fallback.
function contextLine(c: FeedCandidate): string {
  if (c.kind === 'liquidation') {
    return 'This is why you set a stop-loss.';
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

// Four lines: hook / numbers / context / link. Keep it comfortably under
// X's 280-char limit (URL counts as 23 via t.co).
export function formatPost(c: FeedCandidate, tier: Tier): string {
  const url = `${SITE_URL}/tx/0x${c.hash}`;
  const base = c.baseSymbol;
  const prefix = TEST_MODE ? '[TEST] ' : '';

  if (c.kind === 'liquidation') {
    const emoji = tier === 'hero' ? '🚨💀' : '💀';
    const side = c.direction ? ` ${c.direction}` : '';
    const lines = [
      `${prefix}${emoji} Rekt. A ${fmtUsd(c.notionalUsd)} ${base}${side} just got liquidated on Injective.`,
      `Size ${fmtQty(c.quantity ?? 0)} ${base} · forced out at ${fmtPrice(c.price ?? 0)}.`,
      contextLine(c),
      `Full breakdown 👉 ${url}`,
    ];
    return lines.join('\n');
  }

  const emoji = tier === 'hero' ? '🚨🐋' : '🐋';
  const side = c.direction === 'short' ? 'Short' : 'Long';
  const lev = c.leverage ? `, ${c.leverage.toFixed(c.leverage >= 10 ? 0 : 1).replace(/\.0$/, '')}x` : '';
  const lines = [
    `${prefix}${emoji} Someone just opened a ${fmtUsd(c.notionalUsd)} ${base} perp on Injective. ${side}${lev}.`,
    `Entry ${fmtPrice(c.price ?? 0)} · margin ${fmtUsd(c.marginUsd ?? 0)} ${c.quoteSymbol}.`,
    contextLine(c),
    `Decoded 👉 ${url}`,
  ];
  return lines.join('\n');
}
