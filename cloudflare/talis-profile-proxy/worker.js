// Talis profile-id proxy + IPFS image/metadata cache — Cloudflare Worker
//
// Three routes:
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
//   GET /json/<cid>/<path>       (public, JSON only)
//     The same edge cache for NFT *metadata* documents. Resolving a thumbnail
//     needs the token's metadata JSON before its image URL is even known, and
//     fetching that from Vercel is the slow leg: the public gateways rate-limit
//     Vercel's shared egress IPs, so ~90-99% of those fetches time out and the
//     token renders with no image at all. Cloudflare's egress is not throttled
//     that way, and metadata is as immutable as the image, so the first lookup
//     of a token fills the edge for every visitor after it. The body must parse
//     as JSON and is re-serialised before it is served, so this route can only
//     ever emit JSON — it can't be turned into a general-purpose proxy either.
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
const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // don't cache absurdly large files
const MAX_JSON_BYTES = 1024 * 1024; // metadata docs are a few KB; pure headroom
// A gateway that hangs must never hold up the walk — that is exactly the failure
// this Worker exists to absorb. Cap every attempt and move on to the next one.
const GATEWAY_TIMEOUT_MS = 8_000;

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

// ── Shared edge-cached IPFS fetch ────────────────────────────────────────────

// Defence-in-depth headers for untrusted third-party content served from our own
// origin: never sniff a different type, render inline only, sandbox with no
// privileges. (Doesn't affect <img> rendering — thumbnails still display.)
function immutableHeaders(contentType, disposition) {
  return {
    'Content-Type': contentType,
    // Immutable content — cache hard at the edge and in the browser.
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `inline; filename="${disposition}"`,
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'X-Ipfs-Cache': 'MISS',
  };
}

/**
 * Walk the gateways for `rest`, handing each successful response to `accept`.
 * `accept` returns a finished Response to serve, or null to reject this gateway
 * and try the next — so content validation stays with the route that knows what
 * it is willing to serve, while the timeout/failover logic lives here.
 */
async function walkGateways(rest, accept) {
  for (const gw of IPFS_GATEWAYS) {
    let res;
    try {
      res = await fetch(gw + rest, {
        headers: { 'User-Agent': UA },
        redirect: 'follow',
        signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
      });
    } catch {
      continue; // timed out or refused — next gateway
    }
    if (!res || !res.ok) continue;
    let out = null;
    try {
      out = await accept(res);
    } catch {
      continue; // malformed body — next gateway
    }
    if (out) return out;
  }
  return null;
}

/** Cache-first wrapper shared by the /ipfs/ and /json/ routes. */
async function serveCached(request, url, ctx, prefix, accept) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ error: 'method not allowed' }, 405);
  }

  // pathname is "/<prefix>/<cid>/<optional subpath>"; validate the CID segment.
  const rest = url.pathname.slice(prefix.length);
  const cid = rest.split('/')[0];
  if (!cid || !CID_RE.test(cid)) return json({ error: 'invalid cid' }, 400);

  const cache = caches.default;
  const cacheKey = new Request(url.toString(), { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const out = await walkGateways(rest, accept);
  if (!out) return json({ error: 'not found' }, 502);

  // Store at the edge without blocking the response.
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(cache.put(cacheKey, out.clone()));
  else await cache.put(cacheKey, out.clone());
  return out;
}

// ── IPFS image cache route ───────────────────────────────────────────────────
function handleIpfs(request, url, ctx) {
  return serveCached(request, url, ctx, '/ipfs/', async res => {
    // Require a genuine raster image content-type from upstream — don't trust the
    // URL extension. Never serve SVG: it can carry <script> that would execute on
    // this origin if the URL were opened directly. (SVG NFTs still show via the
    // app's direct-gateway fallback, rendered in an <img> where script can't run.)
    const ct = (res.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
    if (!ct.startsWith('image/') || ct === 'image/svg+xml' || ct.includes('svg')) return null;

    const len = Number(res.headers.get('content-length') || '0');
    if (len && len > MAX_IMAGE_BYTES) return null;

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_IMAGE_BYTES) return null;

    return new Response(buf, { status: 200, headers: immutableHeaders(ct, 'image') });
  });
}

// ── IPFS metadata-JSON cache route ───────────────────────────────────────────
function handleJson(request, url, ctx) {
  return serveCached(request, url, ctx, '/json/', async res => {
    const len = Number(res.headers.get('content-length') || '0');
    if (len && len > MAX_JSON_BYTES) return null;

    // Don't trust the upstream content-type — gateways serve .json as anything
    // from application/json to text/plain to application/octet-stream. Parsing
    // is the real check, and re-serialising what parsed guarantees this route
    // can only ever emit JSON, never smuggled HTML or script.
    const text = await res.text();
    if (text.length > MAX_JSON_BYTES) return null;
    const parsed = JSON.parse(text); // throws ⇒ walkGateways tries the next one
    if (parsed === null || typeof parsed !== 'object') return null;

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: immutableHeaders('application/json', 'metadata.json'),
    });
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/ipfs/')) return handleIpfs(request, url, ctx);
    if (url.pathname.startsWith('/json/')) return handleJson(request, url, ctx);
    return handleProfile(request, env);
  },
};
