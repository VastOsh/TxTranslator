import { NextRequest, NextResponse } from 'next/server';
import { OWNER_COOKIE, verifyToken } from '@/lib/auth/owner';
import { discoverRounds, getUserRoundStatus } from '@/lib/buyback/rounds';
import { fetchDepositTimes } from '@/lib/buyback/deposits';

export const runtime = 'nodejs';
export const maxDuration = 30;

const ADDR_RE = /^inj1[a-z0-9]{38}$/;

// Classify a single wallet against the latest round: did it get in (and when),
// was it whitelisted but shut out, or not whitelisted at all.
export async function POST(request: NextRequest) {
  const token = request.cookies.get(OWNER_COOKIE)?.value;
  if (!verifyToken(token)) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }

  let address = '';
  try {
    const body = await request.json();
    address = typeof body?.address === 'string' ? body.address.trim() : '';
  } catch {
    address = '';
  }
  if (!ADDR_RE.test(address)) {
    return NextResponse.json({ error: 'Invalid Injective address.' }, { status: 400 });
  }

  try {
    const rounds = await discoverRounds();
    if (!rounds.length) return NextResponse.json({ error: 'No rounds found.' }, { status: 404 });
    const round = rounds[rounds.length - 1];

    const { status, depositInj } = await getUserRoundStatus(address, round.id);

    let depositTime: number | null = null;
    let secondsAfterOpen: number | null = null;
    if (status === 'in') {
      const times = await fetchDepositTimes(address, [
        { id: round.id, startDate: round.startDate, endDate: round.endDate },
      ]);
      const t = times.get(round.id);
      if (t) {
        depositTime = t.timestamp;
        secondsAfterOpen = Math.max(0, Math.round(t.timestamp - round.startDate));
      }
    }

    return NextResponse.json({
      result: { roundId: round.id, status, depositInj, depositTime, secondsAfterOpen },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
