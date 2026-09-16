import { NextRequest, NextResponse } from 'next/server';
import { createState } from '@/lib/feed/state';
import { EVENTS_MAX } from '@/lib/feed/thresholds';

// Public read model for /feed: the whale events the publisher has already
// posted, newest first. Pure Redis read, no chain access — fast enough that
// the page can poll it. The tick that writes these runs every few minutes,
// so a 30s edge cache costs nothing in freshness and absorbs a busy page.
export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 60;

export async function GET(req: NextRequest) {
  const raw = parseInt(req.nextUrl.searchParams.get('limit') ?? '', 10);
  const limit = Number.isFinite(raw)
    ? Math.min(Math.max(raw, 1), EVENTS_MAX)
    : DEFAULT_LIMIT;

  const state = createState();
  try {
    const events = await state.recentEvents(limit);
    return NextResponse.json(
      // `persistent` false means Upstash isn't configured, so the feed can
      // only ever be this instance's memory — the page says so rather than
      // rendering an empty list as "quiet right now".
      { events, persistent: state.persistent },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error.';
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
