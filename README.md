# Tx·Translator — Injective Transaction Decoder

> **Block explorers are built for machines. Tx·Translator is built for humans.**

Paste any Injective transaction hash or wallet address and get a plain-English breakdown of what happened, what it cost, and what to do next — enriched with live on-chain data and AI-generated strategic insight.

**Built for the Injective Solo AI Builder Sprint · May 2026**
🔗 **Live:** [txtranslator.vercel.app](https://txtranslator.vercel.app)
🐋 **Whale feed:** [x.com/TxTranslator](https://x.com/TxTranslator)

---

## The Problem

Every Injective user has a transaction history they can't fully read.

Raw Cosmos messages — `MsgCreateDerivativeMarketOrder`, `MsgPrivilegedExecuteContract`, `MsgBatchUpdateOrders` — are unreadable to anyone who isn't a protocol engineer. Block explorers show you *what was signed*. They never tell you *what it means*.

Tx·Translator adds a **financial intelligence layer on top of the Injective SDK**: it decodes any mainnet transaction into plain English, enriched with live on-chain context, USD values, and AI-generated expert insight — in under two seconds.

---

## Before / After

| Raw Explorer Output | Tx·Translator |
|---|---|
| `MsgExecuteContract` (Helix Router) | **Swapped 50 USDT → 10.52 INJ** · Slippage: 0.08% (elite fill). Your INJ can earn ~15% APY staking or be deployed into a Mito vault. |
| `MsgCreateDerivativeMarketOrder` | **Long AAPL/USDT Perp · 5× leverage** · 1% underlying move = 5% PnL on margin. Margin locked: 42 USDT. Set a stop-loss — oracle liquidation is instant. |
| `MsgUndelegate` | **Unbonding 100 INJ from Zellic** · ⏳ Locked until Jun 15. At $12/INJ, ~$10.27 in foregone yield. Consider Hydro Protocol's hINJ next time. |
| `MsgVote YES #421` | **Voted YES on "Migrate USDT Margin Markets"** · ⚠ If you hold open USDT-margined positions, they will be force-closed at settlement. Close them before the deadline. |
| `MsgMultiSend` (12 outputs) | **Batch payment to 12 recipients · 1,200 INJ total** · All 12 transfers are atomic — they all succeed or all revert. Pattern looks like a distribution, not a P2P send. |
| `MsgExecuteContract` (Neptune Finance) | **Supplied 500 USDT to Neptune Finance** · You received nUSDT receipt tokens. Variable yield adjusts with pool utilization — check the dashboard for current APY. |

---

## Features

### Protocol coverage

| Protocol / Type | What gets decoded |
|---|---|
| **Helix spot trades** | Market & limit orders, VIP fee tier analysis (Default → VIP5), slippage classification |
| **Helix perpetuals** | Tokenized stocks (SpaceX, AAPL, TSLA, MSFT, GOOGL, AMZN, NVDA, META), leverage, margin, fill status |
| **Mito Finance** | Vault deposits, LP tokens, privileged contract interactions |
| **Hydro Protocol** | hINJ liquid staking |
| **DojoSwap** | AMM swaps, LP staking across DOJO-INJ / SUSHI-DOJO / DOJO-dINJ pairs |
| **Neptune Finance** | Lending/borrowing with nToken receipt tracking (nINJ, nUSDT, nUSDC, nWETH, nATOM, nSOL, nTIA, nAUSD) |
| **Black Panther** | Algorithmic trading vaults (grid, market-making, trend-following) on Helix orderbook |
| **Choice Exchange** | AMM DEX and multi-path swap aggregator with DAG-based routing |
| **Paradyze** | AI-powered trading terminal — detected by fee address heuristic |
| **Staking** | Delegate / Undelegate / Redelegate with live validator voting power, commission, effective APR |
| **Unbonding** | Exact release date from chain events, days-left countdown, missed yield estimate in USD |
| **IBC Transfers** | Cross-chain bridge with source/destination chain context |
| **Governance** | Vote / Propose / Deposit with live tally, proposal title/summary, voting deadline |
| **Bank transfers** | Single sends and MultiSend (atomic batch payments / airdrops) |
| **Talis Protocol** | NFT buy, list, mint, transfer, offer, and cancel-listing with per-NFT price breakdown, seller received amounts, and Blue Chip Collection badge (Premier Ninja, MASKED, Pedro, Cult of Anons, Injective Quants) |
| **Injective Hub BuyBack** | Transactions to the INJ BuyBack contract resolve as protocol "Injective Hub"; AI explains the permanent burn mechanism, historical APY, and slot eligibility rules |
| **Authz grants** | MsgGrant and MsgRevoke with human-readable permission labels |
| **MsgAuthzExec** | Bot and portfolio manager transactions — inner messages unwrapped and decoded in full; trade data, staking, governance and all enrichment work exactly as for direct txs; AI identifies the authorized agent |

---

### Whale feed — live on X and Discord 🐋
Tx·Translator watches **every active Injective derivative market** in real time and posts notable events in plain English to [@TxTranslator](https://x.com/TxTranslator) and Discord:

- **Large perp opens** — "Someone just opened a $324.4k INJ perp on Injective. Long, 20×." with entry price, margin, and an AI context line
- **Liquidations** — forced closes with size and direction
- **Closed-position PnL** — realized wins and losses above a profit/loss floor

How it stays high-signal:
- **Self-calibrating thresholds** — a rolling 24-hour p85 dynamic bar (Upstash Redis sorted set) adapts the posting floor to market activity; static floors were calibrated on 190k+ real trades
- **Hero tier** — exceptionally large events (e.g. $150k+ opens) get a 🚨 post plus a reply linking the fully decoded transaction page
- **Per-subaccount cooldown** — a single bot account can't flood the feed
- **TradFi-aware** — tokenized stocks (via the sedafast oracle), FX pairs, and metals get lower floors and an off-hours risk angle in the copy
- **RFQ coverage** — contract-routed orders (Helix `accept_quote`) carry a zero order hash and no subaccount reference in the tx; the feed regroups them per block/subaccount/market/direction and resolves the tx hash via the trader's bech32 address
- **Cost-bounded publishing** — X posts are link-free (links only in hero replies), with a daily post budget and hourly rate cap

Each post's context line is generated by Groq (Llama 3.3 70B) from chain-verified numbers, with a template fallback so the feed never blocks on the model. Driven by a 5-minute external cron hitting `/api/feed/tick`.

### Live news ticker
A scrolling banner at the top of the page auto-fetches critical on-chain events from the Injective LCD every 5 minutes:
- **Chain upgrade schedule** — detects pending software upgrade plans and estimates the ETA from current block height
- **High-impact governance proposals** — surfaces only voting-period proposals matching keywords like `settlement`, `delist`, `halt`, `emergency`, `upgrade`, `migration` (routine proposals are filtered out)
- **Manual override layer** — `src/data/banner.ts` lets maintainers pin off-chain events (e.g. validator shutdowns, frontend incidents) that the chain doesn't announce on-chain

Critical items render with a red tint; warnings amber. The ticker scrolls right-to-left, pauses on hover, and can be dismissed.

### INJ price chart
A live mini price chart for INJ/USD is displayed below every decoded transaction, giving traders instant market context without leaving the page.

### Wallet address scan
Paste any `inj1…` address to decode the **last 10 transactions** from that wallet — no hash needed. Ideal for reviewing a wallet's recent on-chain activity at a glance.

### Shareable decoded transaction pages
Every decode pushes a `/tx/[hash]` URL to the browser. Share it — recipients land on the fully decoded view instantly, no re-paste required.

Each transaction page generates a **dynamic OG image card** via Next.js `ImageResponse` (free, zero external services). When shared on X or Discord, the link unfurls as a branded visual card showing the transaction type, token amounts, protocol, and status in the app's dark-cyan aesthetic.

### Two share modes on X
Every decoded transaction has two share buttons:

- **Share** — pre-filled tweet with the full AI-generated narrative + the tx link
- **Card** — minimal tweet with `?url=` so X attaches the OG image card as the primary visual

Both are one click, zero friction.

### USD values on token amounts
Every token amount is enriched with a live USD value via the CoinGecko price feed. "100 INJ" shows as "100 INJ (~$1,240 USD)" rather than leaving users to calculate wallet impact themselves.

### Recent history
The last 5 decoded transactions are persisted in `localStorage` and shown on the homepage. Resume without losing context.

### AI insight engine
- Powered by **Groq** running **Llama 3.3 70B** — sub-second inference
- Structured prompt engineering: AI receives pre-computed, chain-verified numbers — no hallucinated amounts
- Outputs three typed fields: `action` (what happened), `impact` (wallet balance change + USD), `details` (expert bullets with actionable context)
- Domain-specific prompt rules per tx type (21+ categories) enforce consistent, accurate output
- Robust multi-strategy JSON parser: brace-counting extraction → literal newline repair → greedy field-by-field fallback — handles all common LLM formatting failures without surfacing errors to the user
- Server-side response cache (Next.js `unstable_cache`, 1-hour TTL) — repeated lookups of the same hash skip the AI call entirely

### Live on-chain enrichment
- Injective mainnet via 4 LCD endpoints with automatic failover
- Live validator stats: voting power %, commission rate, bonded tokens, effective delegator APR
- Governance proposal details and current vote tally
- INJ/USD price from CoinGecko
- Unbonding release date calculated from raw chain events (not estimated)

---

## Demo

🔗 [txtranslator.vercel.app](https://txtranslator.vercel.app)

**Try these:**
- Paste a Helix spot or perp trade hash
- Paste a stake / unstake / redelegate hash
- Paste any governance vote hash
- Paste an `inj1…` wallet address to scan recent activity
- Share a decoded tx — see the image card unfurl on X
- Follow [@TxTranslator](https://x.com/TxTranslator) for live whale activity

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Server Components) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| AI inference | Groq API — Llama 3.3 70B |
| OG image generation | `next/og` · Satori (server-side JSX → PNG, free) |
| On-chain data | Injective LCD REST · Injective indexer |
| Price data | CoinGecko API |
| Injective SDK | `@injectivelabs/sdk-ts` |
| Feed state | Upstash Redis (REST) — dedup, cooldowns, rolling notionals window |
| Feed publishing | X API v2 (OAuth 1.0a) · Discord webhooks |
| Deployment | Vercel |

---

## Setup

### Prerequisites
- Node.js 20+
- A [Groq API key](https://console.groq.com) (free tier works)

### Install

```bash
git clone https://github.com/VastOsh/TxTranslator
cd TxTranslator
npm install
```

### Environment

```bash
cp .env.example .env.local
# Fill in your GROQ_API_KEY
```

### Run

```bash
npm run dev
# → http://localhost:3000
```

---

## Architecture

```
Cron (every 5 min)
        │
        ▼
/api/feed/tick  (GET, bearer-secret protected)
        ├─ Injective indexer: taker trades across all derivative markets since checkpoint
        ├─ Aggregate fills per order (RFQ zero-hash orders per block+subaccount+market+direction)
        ├─ Thresholds: static floors + rolling 24h p85 dynamic bar (Redis)
        ├─ Dedup / subaccount cooldown / hourly cap / daily X budget (Redis)
        ├─ Groq context line (template fallback) → format for X + Discord
        └─ Publish: X main post (+ decode-link reply on hero tier) · Discord webhook

Page load
        │
        ├─ /api/news  (GET, cached 5 min)
        │    ├─ Injective LCD: /cosmos/upgrade/v1beta1/current_plan
        │    ├─ Injective LCD: /cosmos/gov/v1/proposals (voting period, keyword filter)
        │    └─ src/data/banner.ts (manual overrides: validator news, incidents)
        │         → NewsTicker renders scrolling right-to-left banner
        │
User input: tx hash  OR  inj1… wallet address
        │
        ▼
API route: /api/translate  (POST)  ·  /api/wallet  (GET)
        │
        ├─ Server-side cache (Next.js unstable_cache, 1h TTL) — cache hit returns immediately
        │
        ├─ fetchTransaction() → Injective LCD (4 endpoints, failover)
        │
        ├─ normalizeTransaction() → typed NormalizedTransaction
        │    └─ protocol detection: message types + contract addresses + fee address heuristics
        │       (Helix / Mito / Hydro / DojoSwap / Neptune / Black Panther / Choice / Paradyze /
        │        Talis / Injective Hub BuyBack / …)
        │
        ├─ Parallel enrichment
        │    ├─ CoinGecko prices → USD values on all token amounts
        │    ├─ Validator live info + network APR  (staking txs)
        │    └─ Governance proposal details + tally  (gov txs)
        │
        ├─ Structured prompt built with chain-verified numbers
        │
        ├─ Groq / Llama 3.3 70B → raw JSON text
        │    └─ Multi-strategy parser: brace-count → newline repair → greedy field fallback
        │         → { action, impact, details }
        │
        ▼
UI renders:
  · Protocol badge + swap visual / unbonding countdown / gov tally / NFT breakdown
  · AI insight bullets with expert context
  · Validator card with live APR
  · Token amounts with USD values
  · INJ/USD price chart
  · /tx/[hash] URL pushed to browser (shareable, OG image auto-generated)
  · Recent history saved to localStorage
```

---

## Hackathon category

**Consumer AI app — DeFi copilot / financial intelligence**

Tx·Translator makes Injective's most complex financial primitives legible to every user — from first-time delegators to active perpetuals traders. Every decode teaches something actionable: fee optimization, yield opportunities, governance risk, liquidation awareness.

---

## License

MIT
