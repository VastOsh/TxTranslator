import { NextRequest, NextResponse } from 'next/server';
import { pollCandidates } from '@/lib/feed/watch';
import { decide, MAX_POSTS_PER_HOUR } from '@/lib/feed/thresholds';
import { formatPost } from '@/lib/feed/format';
import { publishToX, publishToDiscord, xConfigured, discordConfigured } from '@/lib/feed/publish';
import { createState } from '@/lib/feed/state';

// One tick: poll the chain for whale perp opens + liquidations since the
// last checkpoint, filter, format, publish. Fired by an external cron
// (e.g. cron-job.org every 3 min). See feed-mvp-plan.md.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  const secret = process.env.CRON_SECRET;

  // Live ticks always require the secret. Dry runs are read-only previews,
  // allowed without one only until CRON_SECRET is configured.
  if (secret) {
    if (req.headers.get('authorization') !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  } else if (!dry) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured — only ?dry=1 is available' },
      { status: 503 },
    );
  }

  const state = createState();
  const lastBlock = await state.getLastBlock().catch(() => 0);
  const { candidates, maxHeight, scanned } = await pollCandidates(lastBlock);

  const results: Array<Record<string, unknown>> = [];
  let published = 0;

  for (const c of candidates) {
    const decision = decide(c);
    const entry: Record<string, unknown> = {
      kind: c.kind,
      ticker: c.ticker,
      notionalUsd: Math.round(c.notionalUsd),
      leverage: c.leverage ? Number(c.leverage.toFixed(1)) : null,
      tier: decision.tier,
      reason: decision.reason,
      hash: `0x${c.hash}`,
    };

    if (decision.tier === 'skip') {
      results.push(entry);
      continue;
    }

    const text = formatPost(c, decision.tier);
    entry.post = text;

    if (dry) {
      entry.outcome = 'dry-run';
      results.push(entry);
      continue;
    }

    if (!state.persistent) {
      entry.outcome = 'blocked: no persistent state (configure Upstash) — refusing to publish';
      results.push(entry);
      continue;
    }
    if (!xConfigured() && !discordConfigured()) {
      entry.outcome = 'blocked: no publish channel configured';
      results.push(entry);
      continue;
    }

    // Atomic dedup before anything else — a concurrent tick loses this race
    const first = await state.tryMarkPosted(c.hash).catch(() => false);
    if (!first) {
      entry.outcome = 'skipped: already posted';
      results.push(entry);
      continue;
    }

    // Hourly cap; hero-tier events bypass it. The counter only advances for
    // posts that reached this point, so skips don't burn quota.
    if (decision.tier !== 'hero') {
      const count = await state.incrPostCount().catch(() => 1);
      if (count > MAX_POSTS_PER_HOUR) {
        entry.outcome = `skipped: hourly cap (${MAX_POSTS_PER_HOUR}) reached`;
        results.push(entry);
        continue;
      }
    }

    const outcomes = await Promise.all([
      xConfigured() ? publishToX(text) : Promise.resolve(null),
      discordConfigured() ? publishToDiscord(text) : Promise.resolve(null),
    ]);
    const sent = outcomes.filter((o) => o !== null);
    entry.outcome = sent.map(o => `${o.channel}: ${o.ok ? 'ok' : o.detail}`).join(' · ');
    if (sent.some(o => o.ok)) published++;
    results.push(entry);
  }

  // Advance the checkpoint even when nothing was posted
  if (!dry && state.persistent && maxHeight > lastBlock) {
    await state.setLastBlock(maxHeight).catch(() => { /* next tick re-scans */ });
  }

  return NextResponse.json({
    dryRun: dry,
    persistentState: state.persistent,
    channels: { x: xConfigured(), discord: discordConfigured() },
    checkpoint: { from: lastBlock, to: maxHeight },
    scanned,
    candidates: candidates.length,
    published,
    results,
  });
}
