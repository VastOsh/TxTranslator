# Tx·Translator — Injective Transaction Decoder

> **Block explorers are built for machines. Tx·Translator is built for humans.**

Paste any Injective transaction hash or wallet address and get a plain-English breakdown of what happened, what it cost, and what to do next — enriched with live on-chain data and AI-generated strategic insight.

**Built for the Injective Solo AI Builder Sprint · May 2026**
🔗 **Live:** [txtranslator.vercel.app](https://txtranslator.vercel.app)

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
| **Authz** | MsgGrant and MsgRevoke with human-readable permission labels |

---

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
User input: tx hash  OR  inj1… wallet address
        │
        ▼
API route: /api/translate  (POST)  ·  /api/wallet  (GET)
        │
        ├─ fetchTransaction() → Injective LCD (4 endpoints, failover)
        │
        ├─ normalizeTransaction() → typed NormalizedTransaction
        │    └─ protocol detection: message types + contract addresses + fee address heuristics
        │       (Helix / Mito / Hydro / DojoSwap / Neptune / Black Panther / Choice / Paradyze / …)
        │
        ├─ Parallel enrichment
        │    ├─ CoinGecko prices → USD values on all token amounts
        │    ├─ Validator live info + network APR  (staking txs)
        │    └─ Governance proposal details + tally  (gov txs)
        │
        ├─ Structured prompt built with chain-verified numbers
        │
        └─ Groq / Llama 3.3 70B → { action, impact, details }
                │
                ▼
        UI renders:
          · Protocol badge + swap visual / unbonding countdown / gov tally
          · AI insight bullets with expert context
          · Validator card with live APR
          · Token amounts with USD values
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
