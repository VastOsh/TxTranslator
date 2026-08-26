import crypto from 'node:crypto';

// ── Owner-only access gate ──────────────────────────────────────────────
// A single-secret passphrase gate for private routes (e.g. /me/*). The whole
// app is public, so "private to me" means one shared secret held server-side
// as an env var and never shipped to the client. On a correct passphrase we
// mint a signed, expiring session token and store it in an httpOnly cookie;
// every protected request re-verifies that token. There is no user database —
// this guards a personal tool for one operator, not a multi-user system.
//
// The passphrase doubles as the HMAC signing key, so rotating OWNER_PASSPHRASE
// in the environment instantly invalidates every outstanding session.

export const OWNER_COOKIE = 'tx_owner';
export const OWNER_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, in seconds

function signingKey(): string | null {
  const p = process.env.OWNER_PASSPHRASE;
  return p && p.length > 0 ? p : null;
}

function hmac(message: string, key: string): string {
  return crypto.createHmac('sha256', key).update(message).digest('base64url');
}

/** Length-safe constant-time string compare (avoids leaking via timing). */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** True only when OWNER_PASSPHRASE is set — otherwise the gate stays closed. */
export function isConfigured(): boolean {
  return signingKey() !== null;
}

/** Constant-time check of a submitted passphrase against OWNER_PASSPHRASE. */
export function checkPassphrase(input: string): boolean {
  const key = signingKey();
  if (!key) return false;
  return safeEqual(input, key);
}

/** Mint a signed `<expiry>.<hmac>` session token for the owner cookie. */
export function issueToken(): string {
  const key = signingKey();
  if (!key) throw new Error('OWNER_PASSPHRASE is not configured');
  const payload = String(Date.now() + OWNER_COOKIE_MAX_AGE * 1000);
  return `${payload}.${hmac(payload, key)}`;
}

/** Verify a session token's signature and that it has not expired. */
export function verifyToken(token: string | undefined | null): boolean {
  const key = signingKey();
  if (!key || !token) return false;
  const dot = token.indexOf('.');
  if (dot < 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!safeEqual(sig, hmac(payload, key))) return false;
  const exp = Number(payload);
  return Number.isFinite(exp) && Date.now() < exp;
}
