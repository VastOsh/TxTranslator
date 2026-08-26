import { NextRequest, NextResponse } from 'next/server';
import { OWNER_COOKIE, verifyToken } from '@/lib/auth/owner';

export const runtime = 'nodejs';

// Lets the client decide whether to show the passphrase form or the tool,
// without ever exposing the secret. Only reports a boolean.
export async function GET(request: NextRequest) {
  const token = request.cookies.get(OWNER_COOKIE)?.value;
  return NextResponse.json({ authed: verifyToken(token) });
}
