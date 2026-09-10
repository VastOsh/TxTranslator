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
  X_ERROR_ALERT_COOLDOWN_S,
  EVENTS_MAX,
} from '@/lib/feed/thresholds';
import { formatPost, formatPostForX, generateContextLine, fallbackContextLine } from '@/lib/feed/format';
import { publishToX, publishToDiscord, sendDiscordAlert, xConfigured, discordConfigured } from '@/lib/feed/publish';
import { createState, type FeedState } from '@/lib/feed/state';
import { toFeedEvent, type FeedEvent } from '@/lib/feed/events';

// One tick: pull executed derivative trades from the indexer since the last
// checkpoint, aggregate per aggressing order, filter, resolve the tx hash,
// format, publish. Fired by an external cron (e.g. cron-job.org every 3-5
// min). See feed-mvp-plan.md.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  const force = req.nextUrl.searchParams.get('force') === '1';
  const backfill = req.nextUrl.searchParams.get('backfill') === '1';
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

  // ?backfill=1 — one-shot fill of /feed, for a fresh deploy or after the
  // event ring has expired. Walks back over recent history, applies the same
  // decide() the live tick does, and records what would have posted WITHOUT
  // posting any of it: these are hours-old events and tweeting them now would
  // announce them as breaking news. Add ?dry=1 to preview the scan and write
  // nothing.
  if (backfill) {
    return backfillEvents(state, dry);
  }

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

    // Record it for /feed regardless of what the channels did. The site isn't
    // pay-per-post, so it has no reason to inherit X's daily budget — on a busy
    // day the on-site feed is the complete one and X is the excerpt. Recorded
    // after the outcomes so a slow webhook doesn't delay the post itself, and
    // swallowed so a Redis blip can't fail a tick that already published.
    await state.recordEvents([toFeedEvent(c, decision.tier, ctx.line)]).catch(() => {});

    // Surface a genuine X publish failure — a real attempt that failed (e.g.
    // the X-portal monthly spend-cap 403), not the intentional daily-budget
    // skip. Record it for observability and fire a throttled Discord alert so
    // the feed can't go dark on X for days unnoticed. A later success clears it.
    const xOutcome = outcomes[0];
    if (xConfigured() && xAllowed && xOutcome && !xOutcome.ok) {
      await state.recordXError(xOutcome.detail).catch(() => {});
      if (await state.shouldAlertXError(X_ERROR_ALERT_COOLDOWN_S).catch(() => false)) {
        await sendDiscordAlert(
          `⚠️ Whale feed: X post failed — ${xOutcome.detail}. X posting is paused until this clears; Discord is unaffected.`,
        );
      }
    } else if (xConfigured() && xAllowed && xOutcome?.ok) {
      await state.clearXError().catch(() => {});
    }

    results.push(entry);
  }

  // Advance the checkpoint even when nothing was posted
  if (!dry && state.persistent && maxTimestamp > checkpoint) {
    await state.setCheckpoint(maxTimestamp).catch(() => { /* next tick re-scans */ });
  }

  const xPostedToday = xConfigured() ? await state.getXPostCount().catch(() => -1) : 0;
  const xLastError = xConfigured() ? await state.getXError().catch(() => null) : null;

  // A live tick is read by an external cron service (cron-job.org) that caps
  // how much response body it stores per run — a busy tick's full `results`
  // (one entry per scanned candidate) blows past that cap and gets flagged
  // "failed: output too large" even though the tick returned 200. So the live
  // response carries only what's worth reading when a run does fail: the counts
  // and the handful of non-skip entries. Dry runs keep the full dump for
  // manual inspection.
  const skipped = results.filter((r) => r.tier === 'skip').length;
  const acted = results.filter((r) => r.tier !== 'skip');

  return NextResponse.json({
    dryRun: dry,
    persistentState: state.persistent,
    channels: { x: xConfigured(), discord: discordConfigured() },
    xPostedToday,
    xLastError,
    checkpoint: { from: checkpoint, to: maxTimestamp },
    dynamicBar: dynamicBar != null ? Math.round(dynamicBar) : null,
    scanned,
    candidates: candidates.length,
    published,
    ...(dry ? { results } : { skipped, results: acted }),
  });
}

// ── /feed backfill ──────────────────────────────────────────────────────
// The event ring only fills as the publisher ticks, so a fresh deploy shows
// an empty page for as long as it takes the market to produce a whale. This
// walks recent history once and seeds it.
//
// Nothing here publishes. These events are hours old — posting them now would
// announce old news as if it had just happened — so each one instead *claims*
// its dedup key on the way in, which stops a later live tick from doing that
// on our behalf. The cost is that a backfill run suppresses the tweet for any
// event recent enough that the live tick hadn't reached it yet; that is the
// right trade for a deliberate one-shot repair.

const BACKFILL_LOOKBACK_MS = 24 * 3600 * 1000;
// Measured against the live indexer: at 1000 rows a request, 40 markets reach
// back 0.2h, 8 markets 2.1h, 1 market 4.7h — the busiest markets are both the
// shallowest and the ones whales actually trade on. Eight markets a call is
// the knee: ~2h a page across 36 parallel calls, so six pages covers the
// lookback on most chunks and the walk stops early on the quiet ones.
const BACKFILL_PAGES = 6;
const BACKFILL_MARKETS_PER_CALL = 8;
const BACKFILL_LIMIT = 1000;
// Leaves the rest of maxDuration for resolving one tx hash per recorded event.
const BACKFILL_SCAN_BUDGET_MS = 35_000;
// Each recorded event costs one explorer call to resolve its tx hash, so this
// is what keeps the run inside maxDuration.
const BACKFILL_MAX_EVENTS = 40;
// Calibration found a single account behind 67 of 68 large opens in a 24h
// sample. Without a per-account cap the page would be that one bot, twice.
const BACKFILL_PER_SUBACCOUNT = 3;

async function backfillEvents(state: FeedState, dry: boolean) {
  // A dry backfill is a read-only preview of the same scan, so it needs no
  // store; a real one has nowhere to put the events without Upstash.
  if (!dry && !state.persistent) {
    return NextResponse.json(
      { error: 'backfill needs persistent state (Upstash)' },
      { status: 503 },
    );
  }

  const since = Date.now() - BACKFILL_LOOKBACK_MS;
  const { candidates, scanned } = await pollCandidates(since, {
    pages: BACKFILL_PAGES,
    limit: BACKFILL_LIMIT,
    marketsPerCall: BACKFILL_MARKETS_PER_CALL,
    deadline: Date.now() + BACKFILL_SCAN_BUDGET_MS,
  });

  // The same bar the live feed applies, but computed from this scan's own
  // sample: a backfill must not write into the rolling 24h window the live
  // tick reads, and reading that window would bias it toward whatever the
  // ticks happened to see.
  const window = candidates
    .filter((c) => c.kind === 'perp_open' && c.notionalUsd >= DYNAMIC_MIN_NOTIONAL_USD)
    .map((c) => c.notionalUsd)
    .sort((a, b) => a - b);
  const dynamicBar =
    window.length >= DYNAMIC_MIN_SAMPLES ? percentile(window, DYNAMIC_PERCENTILE) : null;

  // Whatever is already in the ring stays there — re-recording it would just
  // rewrite the same row. This is the ring's own dedup, deliberately separate
  // from the posted-key dedup: on the first run after this feature ships the
  // last 48h of posted keys all exist while the ring is still empty, and
  // keying off those would skip exactly the events worth seeding.
  const existing = new Set((await state.recentEvents(EVENTS_MAX)).map((e) => e.orderHash));

  // pollCandidates sorts by size; the ring wants the most recent, so that the
  // event cap trims history rather than the small end of a busy day.
  const ordered = [...candidates].sort((a, b) => b.executedAt - a.executedAt);

  const perSubaccount = new Map<string, number>();
  const events: FeedEvent[] = [];
  let belowBar = 0;
  let alreadyKnown = 0;
  let rationed = 0;
  let unresolved = 0;

  for (const c of ordered) {
    if (events.length >= BACKFILL_MAX_EVENTS) break;

    const decision = decide(c, dynamicBar);
    if (decision.tier === 'skip') {
      belowBar++;
      continue;
    }
    if (existing.has(c.orderHash)) {
      alreadyKnown++;
      continue;
    }
    const seen = perSubaccount.get(c.subaccountId) ?? 0;
    if (seen >= BACKFILL_PER_SUBACCOUNT) {
      rationed++;
      continue;
    }

    const txHash = await resolveTxHash(c).catch(() => null);
    if (!txHash) {
      unresolved++;
      continue;
    }
    c.hash = txHash;

    // Claim the key so no later tick can publish this as breaking news.
    if (!dry) await state.tryMarkPosted(c.orderHash).catch(() => {});

    perSubaccount.set(c.subaccountId, seen + 1);
    // Template context, not Groq: filling a page in one request is not worth
    // an LLM call per historical event, and the deterministic line is the
    // same one the live feed falls back to anyway.
    events.push(toFeedEvent(c, decision.tier, fallbackContextLine(c)));
  }

  if (!dry) await state.recordEvents(events);

  // How far back the scan actually got. The indexer caps paging at 1000 rows
  // per chunk, so on a busy chain the walk runs out of rows long before it
  // runs out of lookback — without this an operator can't tell a genuinely
  // quiet day from a window that only reached back twenty minutes.
  const oldest = ordered.length > 0 ? ordered[ordered.length - 1].executedAt : null;

  return NextResponse.json({
    backfill: true,
    dryRun: dry,
    lookbackHours: BACKFILL_LOOKBACK_MS / 3600_000,
    reached: oldest
      ? { oldest: new Date(oldest).toISOString(), hours: Number(((Date.now() - oldest) / 3600_000).toFixed(2)) }
      : null,
    // Deep walks prefilter as they fetch, so this counts candidate-shaped
    // rows, not every row the indexer returned the way a live tick's
    // `scanned` does.
    rowsWalked: scanned,
    candidates: candidates.length,
    dynamicBar: dynamicBar != null ? Math.round(dynamicBar) : null,
    recorded: events.length,
    skipped: { belowBar, alreadyKnown, rationed, unresolved },
    ringSize: (await state.recentEvents(EVENTS_MAX)).length,
    sample: events.slice(0, 5).map((e) => ({
      kind: e.kind,
      ticker: e.ticker,
      notionalUsd: e.notionalUsd,
      tier: e.tier,
      at: new Date(e.executedAt).toISOString(),
    })),
  });
}
