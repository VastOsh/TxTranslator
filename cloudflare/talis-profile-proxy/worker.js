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
//   GET /tokens?owner=<profileId>  (Bearer PROXY_SECRET required)
//     Every NFT Talis's own index attributes to a wallet, with its title and
//     media URI. Talis caps a page at 20, so this walks the pages here — on
//     Cloudflare's network, next to Talis — and returns one merged list, rather
//     than making Vercel pay ~60 round trips.
//
//     IMPORTANT: this index is NOT authoritative for ownership. Measured against
//     the chain it over-reports: for one wallet it claimed 1168 tokens where
//     owner_of() confirms 883, including tokens now owned by someone else. So
//     the app uses it ONLY to look up title/media for tokens the on-chain scan
//     has already proven the wallet owns — never to decide what is owned.
//
// Secrets / config (set via `wrangler secret put` or the dashboard):
//   PROXY_SECRET  — the bearer token the profile route requires.

const ADDR_RE = /^inj1[a-z0-9]{38}$/;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// Direct IPFS gateways tried in order on a cache miss.
//
// Ordered by what actually answers, measured from this Worker (2026-09-01). The
// previous list — filebase, pinata, dweb.link, ipfs.io — is now dead for our
// CIDs: Protocol Labs' gateways (ipfs.io, dweb.link, w3s.link, nftstorage.link)
// blanket-403 datacenter traffic in ~20-50ms, pinata 429s, filebase 504s. That
// is not a rate-limit we can wait out, and it is why NFT thumbnails stopped
// resolving altogether rather than merely being slow. Re-check this list if
// images regress again; gateway availability is volatile.
const IPFS_GATEWAYS = [
  'https://snapshot.4everland.link/ipfs/', // only one that served every test CID
  'https://gateway.ipfsscan.io/ipfs/',
  'https://ipfs.raribleuserdata.com/ipfs/',
  'https://4everland.io/ipfs/',
  'https://ipfs.filebase.io/ipfs/', // flaky, kept as a last resort
];
// First path segment must look like an IPFS CID (v0 Qm..., or v1 baf...).
const CID_RE = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$/;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // don't cache absurdly large files
const MAX_JSON_BYTES = 1024 * 1024; // metadata docs are a few KB; pure headroom
// Talis hard-caps a page at 20 regardless of the limit asked for, so a 1000-token
// wallet is 50 upstream calls. This account is on the Workers free plan, whose
// 50-subrequest-per-request ceiling is real and was measured: a 120-page walk
// returns HTTP 500 from the runtime, a 40-page one succeeds. Hence 40 (800
// tokens), which leaves headroom and covers all but whale wallets; beyond that
// the response is marked truncated and the caller falls back to per-token IPFS
// resolution. Raising this meaningfully needs the paid Workers plan (1000).
const TALIS_PAGE = 20;
const TALIS_MAX_PAGES = 40;
const TALIS_CONCURRENCY = 6;
const MONGO_ID_RE = /^[0-9a-f]{24}$/;
// A gateway that hangs must never hold up the walk — that is exactly the failure
// this Worker exists to absorb. Cap every attempt and move on to the next one.
// The surviving gateways answer in 2-12s (they are slower than the ones that
// died), so this is sized to tolerate that rather than cut off a good response.
const GATEWAY_TIMEOUT_MS = 12_000;

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

// ── Talis wallet-token index route ───────────────────────────────────────────

async function talisGraphql(query, variables) {
  const res = await fetch('https://injective.talis.art/api/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://injective.talis.art',
      Referer: 'https://injective.talis.art/',
      'User-Agent': UA,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) return null;
  return await res.json().catch(() => null);
}

const TOKENS_QUERY = `query($i:TokensInput!){tokens(input:$i){count tokens{token_id title media minter{id}}}}`;

async function talisPage(owner, offset) {
  const body = await talisGraphql(TOKENS_QUERY, {
    i: { filter: { owner }, limit: TALIS_PAGE, offset },
  });
  const t = body?.data?.tokens;
  if (!t) return null;
  return { count: Number(t.count) || 0, tokens: Array.isArray(t.tokens) ? t.tokens : [] };
}

/**
 * Every token Talis attributes to `owner`, merged across its 20-per-page API.
 *
 * Ownership here is Talis's view, which lags the chain — callers must treat this
 * as a title/media lookup for tokens they have already verified on-chain, never
 * as the list of what a wallet owns (see the route notes at the top of the file).
 */
async function handleTokens(request, url, env, ctx) {
  const auth = request.headers.get('authorization') || '';
  const expected = env.PROXY_SECRET ? `Bearer ${env.PROXY_SECRET}` : '';
  if (!expected || !safeEqual(auth, expected)) return json({ error: 'unauthorized' }, 401);

  const owner = url.searchParams.get('owner') || '';
  if (!MONGO_ID_RE.test(owner)) return json({ error: 'invalid owner id' }, 400);

  // Ownership changes when the wallet trades, so this is cached briefly rather
  // than immutably — long enough that the portfolio scan and the per-collection
  // expander that follows it share one walk.
  const cache = caches.default;
  const cacheKey = new Request(url.toString(), { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const first = await talisPage(owner, 0);
  if (!first) return json({ error: 'upstream failed' }, 502);

  const pages = Math.min(Math.ceil(first.count / TALIS_PAGE), TALIS_MAX_PAGES);
  const tokens = [...first.tokens];
  let next = 1;
  await Promise.all(
    Array.from({ length: Math.min(TALIS_CONCURRENCY, Math.max(pages - 1, 0)) }, async () => {
      while (next < pages) {
        const page = next++;
        const got = await talisPage(owner, page * TALIS_PAGE);
        if (got) tokens.push(...got.tokens);
      }
    }),
  );

  const out = new Response(
    JSON.stringify({
      count: first.count,
      // True when the wallet holds more than the page cap can walk; callers fall
      // back to per-token IPFS resolution for whatever is missing.
      truncated: first.count > pages * TALIS_PAGE,
      tokens: tokens.map(t => ({
        token_id: String(t.token_id),
        title: t.title ?? null,
        media: t.media ?? null,
        minter: t.minter?.id ?? null,
      })),
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(cache.put(cacheKey, out.clone()));
  else await cache.put(cacheKey, out.clone());
  return out;
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
    if (url.pathname === '/tokens') return handleTokens(request, url, env, ctx);
    return handleProfile(request, env);
  },
};
