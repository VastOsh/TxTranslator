# Talis profile-id proxy + IPFS image/metadata cache (Cloudflare Worker)

Three routes, all used by the wallet NFT portfolio:

- `GET /?address=inj1...` (Bearer `PROXY_SECRET`) → resolves a wallet address to
  its Talis profile id, so the "N owned" count can link to the holder's Talis
  profile (`/profile/<id>`). Talis's GraphQL is behind Cloudflare and 403s
  Vercel's datacenter IPs, so the app can't call it directly; this Worker runs
  on Cloudflare's network, passes that protection, sets the required `Origin`,
  and returns only `{ id }`. Gated by a shared bearer secret so it isn't an open
  proxy.

- `GET /ipfs/<cid>/<path>` (public, images only) → fetches the CID from a public
  IPFS gateway once and caches the bytes at Cloudflare's edge. NFT content is
  immutable, so it's cached effectively forever: after the first fetch, every
  thumbnail load — for any visitor, globally — is instant and immune to the
  public gateways' rate limits and outages. Only image responses are served, so
  it can't be used as a general-purpose open proxy. No auth (browsers load it as
  an `<img>` src). The app points image URLs at this route automatically when
  `TALIS_PROXY_URL` is set, and falls back to direct gateways if it ever fails.

- `GET /json/<cid>/<path>` (public, JSON only) → the same edge cache for NFT
  **metadata** documents, and the single biggest win in thumbnail latency.
  Resolving a thumbnail needs the token's metadata JSON before its image URL is
  even known, and fetching that from Vercel is the slow leg: the public gateways
  rate-limit Vercel's shared egress IPs, so most of those fetches time out and
  the token renders with no image at all (measured: 1 of 130 tokens resolving on
  a large collection, and 0 of 71 on a cold full-portfolio scan). Cloudflare's
  egress isn't throttled that way, and metadata is as immutable as the image, so
  one lookup fills the edge for every visitor after it. The body must parse as
  JSON and is re-serialised before being served, so this route can only ever emit
  JSON — never smuggled HTML or script.

Both cache routes cap each gateway attempt (8s) and fail over to the next, so one
hanging gateway can't stall a request.

## Deploy

1. Install Wrangler and log in to your Cloudflare account:
   ```
   npm i -g wrangler
   wrangler login
   ```
2. From this folder, set the shared secret (pick a long random string):
   ```
   wrangler secret put PROXY_SECRET
   ```
3. Deploy:
   ```
   wrangler deploy
   ```
   Wrangler prints the Worker URL, e.g. `https://talis-profile-proxy.<subdomain>.workers.dev`.

(Or paste `worker.js` into a new Worker in the Cloudflare dashboard, and add
`PROXY_SECRET` under Settings → Variables → Secrets.)

## Wire into the app

Set these in Vercel (Project → Settings → Environment Variables), Production +
Preview:

| Name                | Value                                              |
| ------------------- | -------------------------------------------------- |
| `TALIS_PROXY_URL`   | the Worker URL from `wrangler deploy`              |
| `TALIS_PROXY_SECRET`| the same value you set for `PROXY_SECRET`          |

If these are unset the app skips the lookup and "N owned" falls back to the
collection page — so nothing breaks without the Worker.

## Verify

```
curl -s -H "Authorization: Bearer <PROXY_SECRET>" \
  "https://talis-profile-proxy.<subdomain>.workers.dev/?address=inj1hgcvgnmlhxc92w4n579z6fcl68sewfvv2044qy"
# => {"id":"64c15bf99e838383303415c6"}
```

If `id` comes back non-null, the Worker's egress passes Talis's Cloudflare and
the profile links will work. If it is null with an `upstreamStatus` of 403, even
Cloudflare Worker egress is being blocked and we fall back to the collection link.

Then verify the image cache route (no auth needed):

```
curl -s -D - -o /dev/null \
  "https://talis-profile-proxy.<subdomain>.workers.dev/ipfs/QmaCdDbXfeKg7Nrz6oKVdRwLvgx4xThZYD5cAJ8PqbHhKT/3358.png"
# => HTTP 200, content-type: image/png, x-ipfs-cache: MISS (then HIT on a 2nd call)
```

After `wrangler deploy`, no Vercel change is needed for images — the app already
builds `/ipfs/` URLs from `TALIS_PROXY_URL`.
