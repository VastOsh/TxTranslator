// Talis profile-id proxy — Cloudflare Worker
//
// Talis's GraphQL (injective.talis.art/api/graphql) maps a wallet address to a
// Talis profile id, but it (a) enforces an Origin allowlist and (b) sits behind
// Cloudflare bot protection that 403s datacenter IPs like Vercel's. This Worker
// runs on Cloudflare's own network, so its egress passes that protection; it
// sets the required Origin and returns only the profile id.
//
// It is gated by a shared secret so it is not an open proxy, and it returns
// nothing but { id } — no other user fields.
//
// Secrets / config (set via `wrangler secret put` or the dashboard):
//   PROXY_SECRET  — the bearer token the caller (our server) must present.

const ADDR_RE = /^inj1[a-z0-9]{38}$/;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

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

export default {
  async fetch(request, env) {
    if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);

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
  },
};
