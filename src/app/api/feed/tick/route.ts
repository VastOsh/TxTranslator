import { NextRequest, NextResponse } from 'next/server';
import { pollCandidates, resolveTxHash } from '@/lib/feed/watch';
import { decide, MAX_POSTS_PER_HOUR, SUBACCOUNT_COOLDOWN_S } from '@/lib/feed/thresholds';
import { formatPost } from '@/lib/feed/format';
import { publishToX, publishToDiscord, xConfigured, discordConfigured } from '@/lib/feed/publish';
import { createState } from '@/lib/feed/state';

// One tick: pull executed derivative trades from the indexer since the last
// checkpoint, aggregate per aggressing order, filter, resolve the tx hash,
// format, publish. Fired by an external cron (e.g. cron-job.org every 3-5
// min). See feed-mvp-plan.md.
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
  const checkpoint = await state.getCheckpoint().catch(() => 0);
  const { candidates, maxTimestamp, scanned } = await pollCandidates(checkpoint);

  const results: Array<Record<string, unknown>> = [];
  let published = 0;

  for (const c of candidates) {
    const decision = decide(c);
    const entry: Record<string, unknown> = {
      kind: c.kind,
      ticker: c.ticker,
      notionalUsd: Math.round(c.notionalUsd),
      leverage: c.leverage ? Number(c.leverage.toFixed(1)) : null,
      pnlUsd: c.pnlUsd ? Math.round(c.pnlUsd) : null,
      tier: decision.tier,
      reason: decision.reason,
      orderHash: c.orderHash,
    };

    if (decision.tier === 'skip') {
      results.push(entry);
      continue;
    }

    if (!dry && !state.persistent) {
      entry.outcome = 'blocked: no persistent state (configure Upstash) — refusing to publish';
      results.push(entry);
      continue;
    }
    if (!dry && !xConfigured() && !discordConfigured()) {
      entry.outcome = 'blocked: no publish channel configured';
      results.push(entry);
      continue;
    }

    // One explorer call per whale — only for candidates that will post
    const txHash = await resolveTxHash(c).catch(() => null);
    if (!txHash) {
      entry.outcome = 'skipped: could not resolve tx hash';
      results.push(entry);
      continue;
    }
    c.hash = txHash;
    entry.hash = `0x${txHash}`;

    const text = formatPost(c, decision.tier);
    entry.post = text;

    if (dry) {
      entry.outcome = 'dry-run';
      results.push(entry);
      continue;
    }

    // Atomic dedup before anything else — a concurrent tick loses this race
    const first = await state.tryMarkPosted(c.orderHash).catch(() => false);
    if (!first) {
      entry.outcome = 'skipped: already posted';
      results.push(entry);
      continue;
    }

    // One post per subaccount per window, heroes included — a single bot
    // burst (dozens of $25k+ orders in hours) must not monopolize the feed.
    const offCooldown = await state.trySubaccountCooldown(c.subaccountId, SUBACCOUNT_COOLDOWN_S).catch(() => true);
    if (!offCooldown) {
      entry.outcome = 'skipped: subaccount on cooldown';
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
  if (!dry && state.persistent && maxTimestamp > checkpoint) {
    await state.setCheckpoint(maxTimestamp).catch(() => { /* next tick re-scans */ });
  }

  return NextResponse.json({
    dryRun: dry,
    persistentState: state.persistent,
    channels: { x: xConfigured(), discord: discordConfigured() },
    checkpoint: { from: checkpoint, to: maxTimestamp },
    scanned,
    candidates: candidates.length,
    published,
    results,
  });
}
