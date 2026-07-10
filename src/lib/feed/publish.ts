import { createHmac, randomBytes } from 'node:crypto';

export interface PublishResult {
  channel: 'x' | 'discord';
  ok: boolean;
  detail: string;
}

// ── X (Twitter) API v2, OAuth 1.0a user context ──
// Hand-rolled signing to avoid a dependency; only oauth_* params enter the
// signature because the body is JSON (per RFC 5849 §3.4.1.3.1).

function pctEnc(s: string): string {
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    c => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

function xCredentials() {
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_SECRET;
  if (!apiKey || !apiSecret || !accessToken || !accessSecret) return null;
  return { apiKey, apiSecret, accessToken, accessSecret };
}

export function xConfigured(): boolean {
  return xCredentials() !== null;
}

export async function publishToX(text: string): Promise<PublishResult> {
  const creds = xCredentials();
  if (!creds) return { channel: 'x', ok: false, detail: 'not configured' };

  const url = 'https://api.x.com/2/tweets';
  const oauth: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: creds.accessToken,
    oauth_version: '1.0',
  };

  const paramString = Object.keys(oauth)
    .sort()
    .map(k => `${pctEnc(k)}=${pctEnc(oauth[k])}`)
    .join('&');
  const baseString = `POST&${pctEnc(url)}&${pctEnc(paramString)}`;
  const signingKey = `${pctEnc(creds.apiSecret)}&${pctEnc(creds.accessSecret)}`;
  oauth.oauth_signature = createHmac('sha1', signingKey).update(baseString).digest('base64');

  const authHeader = 'OAuth ' + Object.keys(oauth)
    .sort()
    .map(k => `${pctEnc(k)}="${pctEnc(oauth[k])}"`)
    .join(', ');

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });
    const body = await res.json().catch(() => null);
    if (res.ok && body?.data?.id) {
      return { channel: 'x', ok: true, detail: `tweet ${body.data.id}` };
    }
    return {
      channel: 'x',
      ok: false,
      detail: `HTTP ${res.status}: ${JSON.stringify(body?.errors ?? body?.detail ?? body).slice(0, 300)}`,
    };
  } catch (err) {
    return { channel: 'x', ok: false, detail: `request failed: ${(err as Error).message}` };
  }
}

// ── Discord webhook ──

export function discordConfigured(): boolean {
  return Boolean(process.env.DISCORD_WEBHOOK_URL);
}

export async function publishToDiscord(text: string): Promise<PublishResult> {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return { channel: 'discord', ok: false, detail: 'not configured' };

  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: text,
        allowed_mentions: { parse: [] },
      }),
    });
    if (res.ok) return { channel: 'discord', ok: true, detail: 'sent' };
    const body = await res.text().catch(() => '');
    return { channel: 'discord', ok: false, detail: `HTTP ${res.status}: ${body.slice(0, 200)}` };
  } catch (err) {
    return { channel: 'discord', ok: false, detail: `request failed: ${(err as Error).message}` };
  }
}
