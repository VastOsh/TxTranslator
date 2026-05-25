# Tx·Translator — Injective Transaction Decoder

> Injective TX Translator turns cryptic blockchain logs into human-readable, actionable insights.
> While standard block explorers are built for machines, TX Translator is built for humans.

**Built for the Injective Solo AI Builder Sprint · May 2026** · [txtranslator.vercel.app](https://txtranslator.vercel.app)

---

## The Problem

Most users never understand what their on-chain transactions actually did. Raw Cosmos messages — `MsgCreateDerivativeMarketOrder`, `MsgPrivilegedExecuteContract` — mean nothing to the average person. Block explorers show you *what* was signed. They never tell you *what it means*.

**Tx·Translator adds a financial intelligence layer on top of the Injective SDK** — decoding any mainnet transaction into plain English, enriched with live on-chain context and AI-generated strategic insight.

---

## Before / After

| Raw Explorer Output | Tx·Translator: Human Layer | AI Strategic Insight |
|---|---|---|
| `MsgExecuteContract` (Helix Router) | USDT → INJ Swap | Slippage: 0.08% (elite fill). Your INJ can earn ~15% APY staking or be deployed into a Mito vault. |
| `MsgCreateDerivativeMarketOrder` | Long AAPL/USDT Perp · 5× leverage | 1% underlying move = 5% PnL on margin. Margin locked: 42 USDT. Set a stop-loss — oracle liquidation is instant. |
| `MsgUndelegate` | Unbonding 100 INJ from Zellic | ⏳ Locked until June 15. At $12/INJ, ~$10.27 in foregone yield. Consider Hydro Protocol's hINJ next time. |
| `MsgVote` (option: YES, prop #421) | Voted YES on "Migrate USDT margin markets" | ⚠ If you hold open USDT-margined positions, they will be force-closed at settlement. Close them before the deadline. |
| `MsgMultiSend` (12 outputs) | Batch payment to 12 recipients | All 12 transfers are atomic — they all succeed or all revert. Pattern looks like a distribution, not a P2P send. |

---

## Why Injective?

Injective is the premier blockchain for finance, generating uniquely complex DeFi logs: native orderbook swaps, perpetual derivative positions, tokenized stock trading, multi-send airdrops, liquid staking, and cross-chain IBC flows. Standard Cosmos explorers fail to capture the financial intent behind these actions.

TX Translator bridges this gap by combining the **Injective SDK**, **live on-chain data**, and **LLM inference** into a single, human-readable interface — purpose-built for the Injective ecosystem.

---

## Features

### Supported transaction types

| Type | Details |
|------|---------|
| **Helix spot trades** | Market & limit orders with live VIP fee tier analysis (Default → VIP5) and slippage classification |
| **Helix perpetuals** | Tokenized stocks (SpaceX, AAPL, TSLA, MSFT, GOOGL, AMZN, NVDA, META) with leverage, margin, fill status |
| **Staking** | Delegate / Undelegate / Redelegate with live validator voting power, commission, and effective APR |
| **Unbonding** | Exact release date from chain events, days remaining countdown, missed yield estimate in USD |
| **Mito Finance** | Vault deposits, LP tokens, privileged contract interactions |
| **Hydro Protocol** | hINJ liquid staking |
| **IBC Transfers** | Cross-chain bridge with source/destination chain context |
| **Governance** | Vote / Propose / Deposit with live tally, proposal title/summary, voting deadline, InjHub tracking link |
| **Bank transfers** | Single sends and multi-sends (atomic batch payments / airdrops) |
| **Authz** | MsgGrant and MsgRevoke with human-readable permission labels |

### Share on X
Every decoded transaction has a one-click **Share on X** button that pre-fills a tweet with the plain-English action and wallet impact — built-in organic distribution for the Injective ecosystem.

### AI insight engine
- Powered by **Groq** running **Llama-3.3-70b-versatile** (sub-second inference)
- Structured prompt engineering: AI receives pre-computed, verified numbers from the chain — no hallucinated amounts
- Outputs three fields: `action` (what happened), `impact` (wallet change), `details` (expert bullets)

### Live on-chain data
- Fetches transactions from Injective mainnet via multiple LCD endpoints with automatic failover
- Falls back to the Injective on-chain indexer (full history, no tx-index pruning)
- Live validator stats: voting power %, commission rate, bonded tokens, status
- Live network APR → per-validator effective delegator APR
- Governance proposal details and current vote tally
- INJ/USD price from CoinGecko for USD-denominated impact

---

## Demo

Live: [txtranslator.vercel.app](https://txtranslator.vercel.app)

Example transactions to try:
- A Helix spot swap
- A stake/unstake to any validator
- Any governance vote

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| AI inference | Groq API (Llama-3.3-70b-versatile) |
| On-chain data | Injective LCD REST + Injective indexer |
| Price data | CoinGecko API |
| Injective SDK | `@injectivelabs/sdk-ts` |

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

## How it works

```
User pastes tx hash
        ↓
API route fetches raw tx from Injective mainnet (4 endpoints with failover)
        ↓
Normalizer parses messages → typed NormalizedTransaction
        ↓
Category detection (TRADE / STAKE / VOTE / SEND / …)
        ↓
Parallel enrichment:
  · INJ price (CoinGecko)
  · Validator live info + network APR  (staking txs)
  · Governance proposal details + tally  (gov txs)
        ↓
Structured prompt built with verified on-chain numbers
        ↓
Groq/Llama-3.3-70b generates {action, impact, details}
        ↓
Response includes typed metadata (tradeData, unbondingData, governanceData, …)
        ↓
UI renders protocol badge, swap visual / unbonding countdown / gov tally,
AI insight bullets, validator avatar, token icons
```

---

## Hackathon category

**Consumer AI app — finance copilot / spending insights**

Every Injective user has a transaction history they can't fully read. TX Translator makes that history legible — and teaches users something actionable with every decode.

---

## License

MIT
