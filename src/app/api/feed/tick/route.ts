import { NextRequest, NextResponse } from 'next/server';
import { pollCandidates, resolveTxHash } from '@/lib/feed/watch';
import {
  decide,
  percentile,
  MAX_POSTS_PER_HOUR,
  SUBACCOUNT_COOLDOWN_S,
  DYNAMIC_MIN_NOTIONAL_USD,
  DYNAMIC_MIN_SAMPLES,
  DYNAMIC_PERCENTILE,
  X_MAX_POSTS_PER_DAY,
} from '@/lib/feed/thresholds';
import { formatPost, formatPostForX, generateContextLine } from '@/lib/feed/format';
import { publishToX, publishToDiscord, xConfigured, discordConfigured } from '@/lib/feed/publish';
import { createState } from '@/lib/feed/state';

// One tick: pull executed derivative trades from the indexer since the last
// checkpoint, aggregate per aggressing order, filter, resolve the tx hash,
// format, publish. Fired by an external cron (e.g. cron-job.org every 3-5
// min). See feed-mvp-plan.md.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  const force = req.nextUrl.searchParams.get('force') === '1';
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

  // ?force=1 — one-shot publisher test, triggered manually. Takes the
  // largest fresh candidate regardless of thresholds/caps (dedup stays so
  // repeat calls pick a new order), publishes exactly one post as hero so
  // the X link-reply path is exercised too, and returns the API verdicts.
  // Posts are always [TEST]-prefixed, even outside FEED_TEST_MODE — this
  // path must never produce a real-looking whale alert for a $3 order.
  if (force && !dry) {
    if (!state.persistent) {
      return NextResponse.json({ error: 'force needs persistent state (Upstash)' }, { status: 503 });
    }
    if (!xConfigured() && !discordConfigured()) {
      return NextResponse.json({ error: 'no publish channel configured' }, { status: 503 });
    }
    for (const c of candidates) {
      const txHash = await resolveTxHash(c).catch(() => null);
      if (!txHash) continue;
      c.hash = txHash;
      const first = await state.tryMarkPosted(c.orderHash).catch(() => false);
      if (!first) continue;

      const ctx = await generateContextLine(c, 'hero');
      const withTestTag = (t: string) => {
        const tagged = t.startsWith('[TEST]') ? t : `[TEST] ${t}`;
        return tagged.length > 279 ? `${tagged.slice(0, 278)}…` : tagged;
      };
      const text = withTestTag(formatPost(c, 'hero', ctx.line));
      const xPost = formatPostForX(c, 'hero', ctx.line);
      const outcomes = await Promise.all([
        xConfigured() ? publishToX(withTestTag(xPost.main), xPost.linkReply) : Promise.resolve(null),
        discordConfigured() ? publishToDiscord(text) : Promise.resolve(null),
      ]);
      return NextResponse.json({
        forced: true,
        ticker: c.ticker,
        notionalUsd: Math.round(c.notionalUsd),
        hash: `0x${txHash}`,
        post: text,
        contextSource: ctx.source,
        outcomes: outcomes.filter((o) => o !== null),
      });
    }
    return NextResponse.json(
      { forced: true, error: 'no publishable candidate this tick (all unresolvable or already posted) — try again in a minute' },
      { status: 404 },
    );
  }

  // Feed this tick's non-dust notionals into the 24h rolling window and set
  // the dynamic bar at its p85 — busy day raises it, quiet day lowers it.
  // Dry runs read the window without writing to it.
  const windowEntries = dry
    ? []
    : candidates
        .filter((c) => c.kind === 'perp_open' && c.notionalUsd >= DYNAMIC_MIN_NOTIONAL_USD)
        .map((c) => ({ executedAt: c.executedAt, orderHash: c.orderHash, notionalUsd: c.notionalUsd }));
  let dynamicBar: number | null = null;
  if (state.persistent) {
    const window = await state.recordNotionals(windowEntries).catch(() => [] as number[]);
    if (window.length >= DYNAMIC_MIN_SAMPLES) {
      dynamicBar = percentile(window, DYNAMIC_PERCENTILE);
    }
  }

  const results: Array<Record<string, unknown>> = [];
  let published = 0;

  for (const c of candidates) {
    const decision = decide(c, dynamicBar);
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

    if (dry) {
      const ctx = await generateContextLine(c, decision.tier);
      entry.post = formatPost(c, decision.tier, ctx.line);
      const xPreview = formatPostForX(c, decision.tier, ctx.line);
      entry.xPost = xPreview.main + (decision.tier === 'hero' ? `\n↳ reply: ${xPreview.linkReply}` : '');
      entry.contextSource = ctx.source;
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

    // Only posts that cleared every gate pay for a Groq call; the template
    // fallback inside generateContextLine means this can never stall a tick.
    const ctx = await generateContextLine(c, decision.tier);
    const text = formatPost(c, decision.tier, ctx.line);
    entry.post = text;
    entry.contextSource = ctx.source;

    // X is pay-per-use — a daily budget gates it independently of Discord,
    // and heroes don't bypass it. The link goes in a reply, hero tier only
    // (link posts bill at $0.20 vs $0.015 plain).
    let xAllowed = false;
    if (xConfigured()) {
      const xCount = await state.incrXPostCount().catch(() => Number.MAX_SAFE_INTEGER);
      xAllowed = xCount <= X_MAX_POSTS_PER_DAY;
    }
    const xPost = formatPostForX(c, decision.tier, ctx.line);

    const outcomes = await Promise.all([
      xConfigured()
        ? xAllowed
          ? publishToX(xPost.main, decision.tier === 'hero' ? xPost.linkReply : null)
          : Promise.resolve({ channel: 'x' as const, ok: false, detail: `skipped: X daily budget (${X_MAX_POSTS_PER_DAY}) reached` })
        : Promise.resolve(null),
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

  const xPostedToday = xConfigured() ? await state.getXPostCount().catch(() => -1) : 0;

  return NextResponse.json({
    dryRun: dry,
    persistentState: state.persistent,
    channels: { x: xConfigured(), discord: discordConfigured() },
    xPostedToday,
    checkpoint: { from: checkpoint, to: maxTimestamp },
    dynamicBar: dynamicBar != null ? Math.round(dynamicBar) : null,
    scanned,
    candidates: candidates.length,
    published,
    results,
  });
}
