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

interface TweetResult {
  ok: boolean;
  id?: string;
  detail: string;
}

async function postTweet(
  creds: NonNullable<ReturnType<typeof xCredentials>>,
  text: string,
  replyToId?: string,
): Promise<TweetResult> {
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
      body: JSON.stringify(
        replyToId ? { text, reply: { in_reply_to_tweet_id: replyToId } } : { text },
      ),
    });
    const body = await res.json().catch(() => null);
    if (res.ok && body?.data?.id) {
      return { ok: true, id: body.data.id, detail: `tweet ${body.data.id}` };
    }
    return {
      ok: false,
      detail: `HTTP ${res.status}: ${JSON.stringify(body?.errors ?? body?.detail ?? body).slice(0, 300)}`,
    };
  } catch (err) {
    return { ok: false, detail: `request failed: ${(err as Error).message}` };
  }
}

/**
 * Post the main tweet, then optionally the link as a reply. X deprioritizes
 * link posts in the algorithm AND bills them at $0.20 vs $0.015 plain
 * (pay-per-use, 2026) — so the main tweet never carries the URL and the
 * reply is reserved for hero-tier events. A failed link reply doesn't fail
 * the publish; the main tweet is the product.
 */
export async function publishToX(main: string, linkReply?: string | null): Promise<PublishResult> {
  const creds = xCredentials();
  if (!creds) return { channel: 'x', ok: false, detail: 'not configured' };

  const first = await postTweet(creds, main);
  if (!first.ok) return { channel: 'x', ok: false, detail: first.detail };
  if (!linkReply) return { channel: 'x', ok: true, detail: first.detail };

  const second = await postTweet(creds, linkReply, first.id);
  return {
    channel: 'x',
    ok: true,
    detail: second.ok
      ? `${first.detail} + link reply ${second.id}`
      : `${first.detail} (link reply failed: ${second.detail})`,
  };
}

// ── Discord webhook ──

export function discordConfigured(): boolean {
  return Boolean(process.env.DISCORD_WEBHOOK_URL);
}

/**
 * Ops alert — an X publish failed and the feed is (partly) down. Goes to a
 * dedicated DISCORD_ALERT_WEBHOOK_URL when set, otherwise falls back to the
 * main feed webhook so the alert is never lost. Never throws; best-effort.
 */
export async function sendDiscordAlert(text: string): Promise<boolean> {
  const webhook = process.env.DISCORD_ALERT_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return false;
  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text, allowed_mentions: { parse: [] } }),
    });
    return res.ok;
  } catch {
    return false;
  }
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
