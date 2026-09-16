# Renzu · Every lens on Injective

> **Block explorers are built for machines. Renzu is built for humans.**

Renzu is an Injective intelligence hub. Paste anything on-chain, a transaction, a wallet, or a token, and Renzu brings it into focus through the right lens: a plain-English decode, a "who is this address" read, a token-safety check, verified on-chain volume, or a live whale feed. Every number is reconstructed from the chain and stated with its source, never estimated and never dressed up.

The name is the idea. *Renzu* is Japanese for **lens**: each tool is one lens on the same chain.

**Formerly TxTranslator.** What began as a single transaction decoder grew into a set of tools, so it moved under one roof. The decoder keeps the TxTranslator name and lives at `/tx`; nothing was removed, everything moved.

🏠 **Hub (live):** [renzu.xyz](https://renzu.xyz)
🔗 **Decoder:** [renzu.xyz/tx](https://renzu.xyz/tx)
🐋 **Renzu on X (whale feed):** [@Renzuapp](https://x.com/Renzuapp)

Current version: **v2.0.0**

---

## The problem

Every Injective user has a transaction history they cannot fully read.

Raw Cosmos messages (`MsgCreateDerivativeMarketOrder`, `MsgPrivilegedExecuteContract`, `MsgBatchUpdateOrders`) are unreadable to anyone who is not a protocol engineer. Block explorers show you *what was signed*. They never tell you *what it means*, what it cost, or what to do next.

And the questions do not stop at a single transaction. Is this token the real one or an impostor? Who funded this wallet? What is Injective's actual trading volume, when most trackers miss the perps entirely? Renzu is a financial intelligence layer on top of the Injective SDK that answers those questions honestly.

---

## The lenses

Renzu groups its tools by what you are trying to do. The front door is one universal bar: paste anything on-chain and Renzu routes it to the right lens (a hash to the decoder, an address to Wallet Intelligence, a token or denom to the safety check).

### Understand: make sense of what just happened

| Lens | Route | What it does |
|---|---|---|
| **TxTranslator** *(flagship)* | `/tx` | Any Injective transaction decoded into plain English. Every message, transfer and fee, in the order they happened, enriched with USD values and AI expert insight. |
| **Perp PnL** | `/pnl` | A per-wallet derivatives track record built from the chain's own per-fill PnL and fee fields: realized PnL, fees, volume, win rate, average win/loss, hold time, plus live open positions and unrealized PnL. |

### Detect: see risk and intent before it costs you

| Lens | Route | What it does |
|---|---|---|
| **Token Safety** | `/token` | Impersonation checks against Injective's verified-token registry, launchpad rug signals, holder bubble maps, sell-impact on the bonding curve, creator track record, and wallet-funding clusters for any denom. |
| **Wallet Intelligence** | `/wallet` | Who is behind an address: account age, lifetime transaction count, the wallet that first funded it (Cosmos and EVM), launchpad track record, NFT portfolio, and live risk flags. |
| **Insiders** | `/insiders` | A cross-token map of serial funders that quietly seed the same wallets across launchpad tokens, surfaced before a launch rather than after. Rebuilt hourly. |

### Markets: real numbers, reconstructed from the chain

| Lens | Route | What it does |
|---|---|---|
| **Volume** | `/stats` | Verified spot and perp volume, rebuilt trade by trade, plus the INJ burn auction. Interactive chart, per-dApp breakdown, custom date ranges, on-chain and key-metrics panels. |
| **Whale Feed** | `/feed` | Large positions, liquidations and closes the moment they settle, each decoded on-site and mirrored to X. |
| **Smart Money** | `/leaderboard` | The most profitable perp traders, ranked by realized net PnL from the chain's own per-fill numbers, subaccounts summed, over 7d/30d. Each row opens the full round-trip breakdown. |
| **Perp Markets** | `/perps` | Funding rate and annualized pace, open interest, long/short skew, mark price and max leverage across every active perpetual. Funding live, OI/skew from a recent snapshot. |

### Ecosystem: everything else worth watching

| Lens | Route | What it does |
|---|---|---|
| **dApp Directory** | `/dapps` | Every recognised protocol on Injective, each with lifetime on-chain executions, contract count, first-seen and last-active dates pulled live from wasm state, and the official site link. |
| **Community BuyBack** | `/buyback` | Follow each INJ buyback round, with honest deposit timing, whitelist signals, and a clear read on where flows land. |

---

## Flagship: the TxTranslator decoder

### Before / after

| Raw explorer output | Renzu |
|---|---|
| `MsgExecuteContract` (Helix Router) | **Swapped 50 USDT to 10.52 INJ** · Slippage: 0.08% (elite fill). Your INJ can earn staking yield or be deployed into a Mito vault. |
| `MsgCreateDerivativeMarketOrder` | **Long AAPL/USDT Perp, 5x leverage** · A 1% underlying move is 5% PnL on margin. Margin locked: 42 USDT. Set a stop-loss: oracle liquidation is instant. |
| `MsgUndelegate` | **Unbonding 100 INJ from Zellic** · Locked until Jun 15. At $12/INJ, about $10.27 in foregone yield. Consider a liquid-staking route next time. |
| `MsgVote YES #421` | **Voted YES on "Migrate USDT Margin Markets"** · If you hold open USDT-margined positions, they will be force-closed at settlement. Close them before the deadline. |
| `MsgMultiSend` (12 outputs) | **Batch payment to 12 recipients, 1,200 INJ total** · All 12 transfers are atomic: they all succeed or all revert. Pattern looks like a distribution, not a P2P send. |
| `MsgExecuteContract` (Neptune Finance) | **Supplied 500 USDT to Neptune Finance** · You received nUSDT receipt tokens. Variable yield adjusts with pool utilization. |

### Protocol coverage

| Protocol / type | What gets decoded |
|---|---|
| **Helix spot** | Market and limit orders, VIP fee tier analysis (Default to VIP5), slippage classification |
| **Helix perpetuals** | Tokenized stocks (SpaceX, AAPL, TSLA, MSFT, GOOGL, AMZN, NVDA, META), leverage, margin, fill status |
| **Mito Finance** | Vault deposits, LP tokens, privileged contract interactions |
| **Hydro Protocol** | hINJ liquid staking |
| **DojoSwap** | AMM swaps and LP staking |
| **Neptune Finance** | Lending and borrowing with nToken receipt tracking |
| **Black Panther** | Algorithmic trading vaults on the Helix orderbook |
| **Choice Exchange** | AMM DEX and multi-path swap aggregator |
| **Talis Protocol** | NFT buy, list, mint, transfer, offer, cancel-listing, with per-NFT price breakdown, seller amounts, and Blue Chip Collection badges verified by contract address |
| **Staking** | Delegate, undelegate, redelegate with live validator voting power, commission, effective APR |
| **Unbonding** | Exact release date from chain events, days-left countdown, missed-yield estimate in USD |
| **Governance** | Vote, propose, deposit with live tally, proposal title and summary, voting deadline |
| **Bank transfers** | Single sends and MultiSend (atomic batch payments and airdrops) |
| **Injective Hub BuyBack** | Resolves as protocol "Injective Hub"; explains the permanent burn mechanism and slot rules |
| **Authz** | `MsgGrant` and `MsgRevoke` with human-readable permission labels; `MsgAuthzExec` inner messages unwrapped and decoded in full |

### AI insight engine

- Runs on **Groq** (`openai/gpt-oss-120b`, accessed through the OpenAI SDK), the tier that keeps token amounts and USD values accurate.
- Structured prompt engineering: the model receives pre-computed, chain-verified numbers, so amounts are never hallucinated.
- Outputs three typed fields: `action` (what happened), `impact` (balance change plus USD), `details` (expert bullets with actionable context), with domain-specific rules per transaction type.
- Robust multi-strategy JSON parser: brace-counting extraction, literal-newline repair, then a greedy field-by-field fallback, so common LLM formatting failures never surface to the user.
- Server-side response cache (Next.js `unstable_cache`, 1-hour TTL): repeated lookups of the same hash skip the model call entirely.

### Sharing

Every decode pushes a `/tx/[hash]` URL to the browser: share it and recipients land on the fully decoded view instantly. Each transaction page also generates a **dynamic OG image card** via `next/og` (Satori, server-side JSX to PNG, no external service), so a shared link unfurls as a branded visual card on X and Discord.

---

## The whale feed

Renzu watches **every active Injective derivative market** in real time and posts notable events on-site at `/feed` and out to [@Renzuapp](https://x.com/Renzuapp) and Discord.

- **Large perp opens** with entry price, margin, leverage, and an AI context line.
- **Liquidations**: forced closes with size and direction.
- **Closed-position PnL**: realized wins and losses above a profit/loss floor.

How it stays high-signal:

- **Self-calibrating thresholds.** Static USD floors (calibrated on real trade samples) plus hero tiers, plus a rolling 24h p85 dynamic bar stored in Upstash Redis, so a busy day raises the posting floor and a quiet day lowers it. Heroes bypass the bar.
- **Per-subaccount cooldown.** A single bot account cannot flood the feed.
- **TradFi-aware.** Tokenized stocks, FX pairs and metals get lower floors and an off-hours risk angle.
- **RFQ coverage.** Contract-routed orders (Helix `accept_quote`) carry a zero order hash and no subaccount reference, so the feed regroups them per block, subaccount, market and direction, and resolves the tx hash via the trader's bech32 address.
- **Cost-bounded publishing.** X posts are link-free (links only in hero replies), with a daily post budget and an hourly rate cap, since X is pay-per-use.

The on-site feed replays the last few days from a Redis event ring (double-pruned by age and count, with a TTL self-destruct), so it stays live without re-scanning the chain. Each context line is generated by Groq from chain-verified numbers, with a hand-written template fallback so the feed never blocks on the model. Driven by an external cron hitting `/api/feed/tick`.

---

## The Volume lens

There is no public per-market volume feed on Injective any more, and most trackers only capture Helix spot volume and miss the perps, which are the overwhelming majority of activity. Renzu rebuilds the real figure the only honest way: summing the taker-side notional of every matched trade, counted once, with decimal scaling verified to the cent against each market's minimum notional.

- **Interactive area chart** drawn in the browser from verified on-chain numbers: crosshair and tooltip, Total or Perp/Spot split, Daily or Cumulative, preset windows plus a custom date range.
- **Per-dApp breakdown** by fee-recipient wallet: named front-ends (Helix leads), unlabelled market-maker wallets grouped honestly as one "Automated MM" bucket, and unidentified relayers shown by address and marked unverified rather than guessed.
- **INJ burn auction**: cumulative INJ burned and the latest round.
- **Onchain Metrics** panel: block height and measured block time, lifetime transaction count, staking APR (with the block-time correction the Hub applies), inflation, bonded ratio, community pool, EVM gas price.
- **Key Metrics** panel: INJ price and market cap on the honest circulating supply (about 122.8M INJ, not the stale 100M figure), 24h/7d/30d volume, on-chain stablecoin market cap, and net 24h bridged inflow from a daily on-chain supply snapshot.

Volume is served from a daily aggregate stored in Vercel Blob, so every timeframe is instant and nothing re-scans the chain on load. Refreshed by a daily cron at `/api/cron/stats`.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Server Components) |
| Runtime | React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| Hub visuals | OGL (WebGL Ferrofluid hero), Lenis (smooth scroll), custom lens cursor |
| Fonts | Inter, IBM Plex Sans, JetBrains Mono, Bricolage Grotesque |
| AI inference | Groq (`openai/gpt-oss-120b`) via the OpenAI SDK |
| OG images | `next/og` (Satori: server-side JSX to PNG) |
| On-chain data | Injective LCD REST (4 endpoints, failover), Injective indexer, EVM RPC, explorer index |
| Price data | CoinGecko |
| Injective SDK | `@injectivelabs/sdk-ts` |
| Feed state | Upstash Redis (REST): dedup, cooldowns, rolling notionals window, on-site event ring |
| Volume storage | Vercel Blob (private) |
| Edge assets | Cloudflare Worker (Talis profile proxy and IPFS thumbnail edge cache) |
| Feed publishing | X API v2 (OAuth 1.0a), Discord webhooks |
| Deployment | Vercel |

---

## Architecture

```
External cron (whale feed)                External cron (daily)
        │                                         │
        ▼                                         ▼
/api/feed/tick  (bearer CRON_SECRET)      /api/cron/stats  (bearer CRON_SECRET)
   ├─ indexer: taker trades since checkpoint    ├─ rebuild spot+perp volume trade by trade
   ├─ aggregate fills (RFQ zero-hash grouping)  ├─ INJ burn + bridged-supply snapshot
   ├─ thresholds: floors + rolling p85 (Redis)  └─ write daily aggregate → Vercel Blob
   ├─ dedup / cooldown / hourly + daily caps           │
   ├─ Groq context line (template fallback)            ▼
   ├─ publish: X (+ hero decode reply) · Discord   /api/stats, /api/summary → Volume lens
   └─ record event → Redis ring → /feed replay

Hub (/)  ── universal lens bar ──►  routes by input shape
   tx hash → /tx      address → /wallet      token/denom → /token

User input: tx hash  OR  inj1… / 0x… address
        │
        ▼
/api/translate (POST)  ·  /api/wallet (GET)
        ├─ server cache (unstable_cache, 1h): hit returns immediately
        ├─ fetchTransaction() → Injective LCD (4 endpoints, failover)
        ├─ normalizeTransaction() → typed NormalizedTransaction
        │    └─ protocol detection: message types + contract addresses + fee heuristics
        ├─ parallel enrichment: CoinGecko USD · validator APR · gov tally
        ├─ structured prompt (chain-verified numbers)
        ├─ Groq / gpt-oss-120b → raw JSON
        │    └─ multi-strategy parser → { action, impact, details }
        ▼
UI: protocol badge · AI bullets · validator card · USD values · price chart
    · /tx/[hash] URL pushed (shareable, OG image auto-generated) · recent history
```

---

## Setup

### Prerequisites

- Node.js 20+
- A [Groq API key](https://console.groq.com) (free tier works) for the decoder and feed context lines

### Install

```bash
git clone https://github.com/VastOsh/TxTranslator
cd TxTranslator
npm install
```

### Environment

Copy the example and fill in what you need:

```bash
cp .env.example .env.local
```

Only `GROQ_API_KEY` is required to run the decoder and the read-only lenses locally. The rest enable specific lenses or the publishing pipelines; the app degrades gracefully when any is absent.

| Variable | Needed for | Notes |
|---|---|---|
| `GROQ_API_KEY` | Decoder, whale-feed context | Required. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Whale feed state | Without both, the feed falls back to a non-persistent memory store that refuses live publishing. |
| `CRON_SECRET` | `/api/feed/tick` and `/api/cron/stats` | Shared bearer secret; both are triggered by external cron. |
| `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` | Feed publishing to X | OAuth 1.0a app credentials. |
| `X_MAX_POSTS_PER_DAY` | Feed cost control | Daily X post budget (defaults to 10). |
| `DISCORD_WEBHOOK_URL` | Feed publishing to Discord | Main feed channel. |
| `DISCORD_ALERT_WEBHOOK_URL` | Feed error alerts | X-outage notices, rate-limited. |
| `FEED_SITE_URL` | Feed hero replies | Base URL used for decode links. |
| `FEED_TEST_MODE` | Testing only | `1` drops floors 500x and relaxes caps; posts get a `[TEST]` prefix. |
| `BLOB_READ_WRITE_TOKEN` | Volume lens storage | Vercel Blob token for the daily volume aggregate. |
| `TALIS_PROXY_URL`, `TALIS_PROXY_SECRET` | Wallet NFT portfolio | Cloudflare Worker for Talis profile lookups and edge-cached thumbnails; optional (public IPFS gateways are the fallback and rate-limit hard). |
| `OWNER_PASSPHRASE` | Private owner-only buyback page | Gate for `/me/buyback`. |

### Run

```bash
npm run dev
# → http://localhost:3000
```

---

## Project layout

```
src/
  app/
    page.tsx            Renzu hub (universal lens bar, lens grid, live news)
    tx/                 TxTranslator decoder + /tx/[hash] pages
    wallet/             Wallet Intelligence + NFT portfolio + footprint
    token/              Token Safety check
    insiders/           Launchpad insiders map
    stats/              Volume lens
    feed/               On-site whale feed
    dapps/              dApp directory
    buyback/            Community BuyBack checker
    pnl/                Perp PnL
    api/                route handlers (translate, wallet, feed/tick, cron/stats, …)
  lib/
    normalizer.ts       raw tx → typed NormalizedTransaction
    injective.ts        LCD/indexer client with failover
    prices.ts           CoinGecko price feed
    feed/               watch, thresholds, state, events, format (whale feed engine)
    stats/  token/  wallet/  buyback/  portfolio/  dapps/  pnl/  auth/
    address.ts          bech32 inj1 ⇄ hex conversion
  data/
    changelog.ts        in-app changelog (source of the "What's new" panel)
cloudflare/
    talis-profile-proxy Worker for profile lookups and IPFS thumbnail caching
```

---

## Honesty principles

Renzu shows numbers it can stand behind, and says so plainly:

- **Verified, not estimated.** Volume is summed from matched trades; stablecoin market cap is read from the bank module; bridged inflow is the day-over-day change in real on-chain supply. Rows that would need per-protocol adapters (TVL, RWAs) are left out rather than guessed.
- **Signals, not verdicts.** A shared funding source, a serial launcher, a concentrated holder: each is surfaced with its caveat (it can also be a shared exchange), never as a safety score.
- **Behaviour, not identity.** Injective wallets are pseudonymous. Renzu describes what a wallet has done, never who it is.
- **Coverage is stated.** The wallet NFT scan says how many collections it checked; the dApp figures name their source. What is unknown is marked unknown.

---

## License

MIT
