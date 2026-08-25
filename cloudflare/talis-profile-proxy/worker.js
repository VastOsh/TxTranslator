// Talis profile-id proxy + IPFS image cache — Cloudflare Worker
//
// Two routes:
//
//   GET /?address=inj1...        (Bearer PROXY_SECRET required)
//     Resolves a wallet address to its Talis profile id. Talis's GraphQL
//     (injective.talis.art/api/graphql) enforces an Origin allowlist and sits
//     behind Cloudflare bot protection that 403s datacenter IPs like Vercel's.
//     This Worker runs on Cloudflare's own network, so its egress passes; it
//     sets the required Origin and returns only { id }.
//
//   GET /ipfs/<cid>/<path>       (public, images only)
//     Fetches the CID from a public IPFS gateway ONCE and caches the bytes at
//     Cloudflare's edge (NFT content is immutable, so cache effectively
//     forever). Repeat loads for any visitor are then instant and immune to the
//     public gateways' rate limits / outages. Only image responses are served,
//     so this can't be used as a general-purpose open proxy.
//
// Secrets / config (set via `wrangler secret put` or the dashboard):
//   PROXY_SECRET  — the bearer token the profile route requires.

const ADDR_RE = /^inj1[a-z0-9]{38}$/;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// Direct IPFS gateways tried in order on a cache miss.
const IPFS_GATEWAYS = [
  'https://ipfs.filebase.io/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://dweb.link/ipfs/',
  'https://ipfs.io/ipfs/',
];
// First path segment must look like an IPFS CID (v0 Qm..., or v1 baf...).
const CID_RE = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$/;
const IMG_EXT_TYPE = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
};
const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // don't cache absurdly large files

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// Constant-time-ish string compare so the secret check does not leak length/prefix.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── Profile route ────────────────────────────────────────────────────────────
async function handleProfile(request, env) {
  const auth = request.headers.get('authorization') || '';
  const expected = env.PROXY_SECRET ? `Bearer ${env.PROXY_SECRET}` : '';
  if (!expected || !safeEqual(auth, expected)) return json({ error: 'unauthorized' }, 401);

  const address = new URL(request.url).searchParams.get('address') || '';
  if (!ADDR_RE.test(address)) return json({ error: 'invalid address' }, 400);

  try {
    const res = await fetch('https://injective.talis.art/api/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://injective.talis.art',
        Referer: 'https://injective.talis.art/',
        'User-Agent': UA,
      },
      body: JSON.stringify({
        query: 'query($i:UserInput!){user(input:$i){id}}',
        variables: { i: { filter: { walletAddress: address } } },
      }),
    });
    if (!res.ok) return json({ id: null, upstreamStatus: res.status });
    const body = await res.json().catch(() => null);
    const id = body?.data?.user?.id;
    return json({ id: typeof id === 'string' && id ? id : null });
  } catch (err) {
    return json({ id: null, error: String(err && err.message ? err.message : err) });
  }
}

// ── IPFS image cache route ───────────────────────────────────────────────────
async function handleIpfs(request, url, ctx) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ error: 'method not allowed' }, 405);
  }

  // pathname is "/ipfs/<cid>/<optional subpath>"; validate the CID segment.
  const rest = url.pathname.slice('/ipfs/'.length);
  const cid = rest.split('/')[0];
  if (!cid || !CID_RE.test(cid)) return json({ error: 'invalid cid' }, 400);

  const cache = caches.default;
  const cacheKey = new Request(url.toString(), { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const ext = (rest.split('.').pop() || '').toLowerCase();
  const extType = IMG_EXT_TYPE[ext];

  for (const gw of IPFS_GATEWAYS) {
    let res;
    try {
      res = await fetch(gw + rest, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    } catch {
      continue;
    }
    if (!res || !res.ok) continue;

    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const isImage = ct.startsWith('image/') || !!extType;
    if (!isImage) continue; // only ever serve images (skips gateway HTML/redirect pages)

    const len = Number(res.headers.get('content-length') || '0');
    if (len && len > MAX_IMAGE_BYTES) continue;

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_IMAGE_BYTES) continue;

    const type = ct.startsWith('image/') ? ct : extType || 'application/octet-stream';
    const out = new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': type,
        // Immutable content — cache hard at the edge and in the browser.
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
        // These bytes are untrusted third-party NFT media served on the Worker's
        // own origin. An SVG can carry <script>; if someone opened the URL
        // directly the browser would treat it as a document and could run it.
        // Neutralise that: never sniff a different type, render inline only, and
        // sandbox with no privileges so any embedded script/resource is inert.
        // (These don't affect <img> rendering — thumbnails still display.)
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline; filename="image"',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        'X-Ipfs-Cache': 'MISS',
      },
    });
    // Store at the edge without blocking the response.
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(cache.put(cacheKey, out.clone()));
    else await cache.put(cacheKey, out.clone());
    return out;
  }

  return json({ error: 'not found' }, 502);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/ipfs/')) return handleIpfs(request, url, ctx);
    return handleProfile(request, env);
  },
};
