# Talis profile-id proxy (Cloudflare Worker)

Resolves a wallet address → Talis profile id, used by the wallet NFT portfolio
so the "N owned" count can link to the holder's Talis profile (`/profile/<id>`).

Talis's GraphQL is behind Cloudflare and 403s Vercel's datacenter IPs, so the
app cannot call it directly. This Worker runs on Cloudflare's network, passes
that protection, sets the required `Origin`, and returns only `{ id }`. It is
gated by a shared bearer secret so it is not an open proxy.

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
