import { NextRequest, NextResponse } from 'next/server';
import { checkPassphrase, isConfigured, issueToken, OWNER_COOKIE, OWNER_COOKIE_MAX_AGE } from '@/lib/auth/owner';

// Uses node:crypto — keep this off the edge runtime.
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: 'Owner access is not configured on the server.' },
      { status: 503 },
    );
  }

  let passphrase = '';
  try {
    const body = await request.json();
    passphrase = typeof body?.passphrase === 'string' ? body.passphrase : '';
  } catch {
    passphrase = '';
  }

  if (!checkPassphrase(passphrase)) {
    return NextResponse.json({ error: 'Incorrect passphrase.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(OWNER_COOKIE, issueToken(), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: OWNER_COOKIE_MAX_AGE,
  });
  return res;
}
