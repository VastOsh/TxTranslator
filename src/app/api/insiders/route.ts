import { NextResponse } from 'next/server';
import { getSerialFunders } from '@/lib/token/insiders';

// Heavy cross-launch scan behind an hourly cache; give the cold build headroom.
export const maxDuration = 60;

export async function GET() {
  try {
    const funders = await getSerialFunders();
    return NextResponse.json({ funders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
