# Tx·Translator — Injective Transaction Decoder

> Paste any Injective transaction hash. Get a plain-English breakdown of exactly what happened, powered by AI and live on-chain data.

**Built for the Injective Solo AI Builder Sprint · May 2026**

---

## What it does

Most users never understand what their on-chain transactions actually did. Raw Cosmos messages — `MsgCreateDerivativeMarketOrder`, `MsgPrivilegedExecuteContract` — mean nothing to the average person.

**Tx·Translator** decodes any Injective mainnet transaction and explains it in plain English:

- What action was taken ("You swapped 100 USDT for 22.1 INJ on Helix")
- What changed in your wallet ("−100 USDT, +22.1 INJ (~$96.14 USD)")
- Expert insight you couldn't derive yourself (VIP fee tier, unbonding countdown, validator concentration risk, governance vote weight)

The AI doesn't just re-describe the raw fields — it contextualises the transaction within the Injective ecosystem and surfaces actionable next steps.

---

## Features

### Supported transaction types

| Type | Details |
|------|---------|
| **Helix spot trades** | Market & limit orders with live fee VIP tier analysis (Default → VIP5) |
| **Helix perpetuals** | Tokenized stocks (SpaceX, AAPL, TSLA, MSFT, GOOGL, AMZN, NVDA, META) with leverage, margin & fill status |
| **Staking** | Delegate / Undelegate / Redelegate with live validator voting power, commission, and effective APR |
| **Unbonding** | Exact release date from chain events, days remaining countdown, missed yield estimate |
| **Mito Finance** | Vault deposits, LP tokens, privileged contract interactions |
| **Hydro Protocol** | hINJ liquid staking |
| **IBC Transfers** | Cross-chain bridge with source/destination chain context |
| **Governance** | Vote / Propose / Deposit with live tally, proposal title/summary, voting deadline, and InjHub tracking link |
| **Bank transfers** | Single sends and multi-sends (atomic batch payments / airdrops) |
| **Authz** | MsgGrant and MsgRevoke with human-readable permission labels |

### AI insight engine
- Powered by **Groq** running **Llama-3.3-70b-versatile** (sub-second inference)
- Structured prompt engineering: AI receives pre-computed, verified numbers from the chain — no hallucinated amounts
- Outputs three fields: `action` (what happened), `impact` (wallet change), `details` (expert bullets)

### Live on-chain data
- Fetches transactions from Injective mainnet via multiple LCD endpoints with automatic failover
- Falls back to the Injective on-chain indexer (full history, no tx-index pruning)
- Fetches live validator stats: voting power %, commission rate, bonded tokens, status
- Fetches live network APR and computes per-validator effective delegator APR
- Fetches governance proposal details and current vote tally
- Fetches INJ/USD price from CoinGecko for USD-denominated impact

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
git clone https://github.com/your-username/tx-translator
cd tx-translator
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

Tx·Translator solves a real user problem: on-chain activity is opaque to most people. Every Injective user has a transaction history they can't fully read. This tool makes that history legible — and teaches users something actionable with every decode.

---

## License

MIT
