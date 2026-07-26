export type EntryType = 'critical' | 'fix' | 'improvement' | 'feature';

export interface ChangelogEntry {
  type: EntryType;
  text: string;
}

export interface ChangelogVersion {
  version: string;
  date: string;
  entries: ChangelogEntry[];
}

export const CURRENT_VERSION = 'v1.8.0';

// Entries within each version are ordered: critical → fix → improvement → feature
export const CHANGELOG: ChangelogVersion[] = [
  {
    version: 'v1.8.0',
    date: '2026-07-26',
    entries: [
      {
        type: 'feature',
        text: 'New Community BuyBack checker at /buyback — enter any wallet to see whether it is whitelisted for the current round (can still commit / already deposited / not whitelisted), plus its full history: rounds whitelisted vs committed, total INJ committed, reward baskets earned (valued where a price exists), and claim status. Read straight from the buyback contract on chain, so being "found" in a round is exactly its whitelist status. A round\'s whitelist lands on chain about a day before it opens, so the checker also flags an upcoming round before deposits start. Reachable from a button on the landing page next to the dApp directory',
      },
      {
        type: 'feature',
        text: 'BuyBack checker shows whitelist signals — before an official whitelist is published, it surfaces the honest factors that correlate with selection: your measured selection rate across past rounds, active staking, and on-chain activity. No fabricated percentage — the whitelist is chosen off-chain with a randomized element, so your own track record is shown as the best available guide',
      },
    ],
  },
  {
    version: 'v1.7.2',
    date: '2026-07-26',
    entries: [
      {
        type: 'fix',
        text: 'Fixed the footer overflowing on mobile — its links sat on one non-wrapping row that forced a sideways scroll on narrow screens; the footer now wraps and centres, and was trimmed to the essentials (Made by S!G, Whale feed, Contact)',
      },
      {
        type: 'improvement',
        text: 'Made the dApp directory easier to find — it is now a button on the landing page under the search box, in place of the old footer link',
      },
    ],
  },
  {
    version: 'v1.7.1',
    date: '2026-07-26',
    entries: [
      {
        type: 'fix',
        text: 'Fixed token-factory amounts rendering as raw atomic numbers — an unknown token-factory denom fell back to 6 decimals, so a large SHROOM airdrop showed -2436555991094542150.677 instead of -2436555.991; factory/ denoms now default to 18 decimals (the Injective convention), with the rare exception still pinned explicitly',
      },
      {
        type: 'fix',
        text: 'Fixed large transactions failing to decode with a 400 "reduce the length" error — a 1,000-recipient MsgMultiSend airdrop overflowed the model context by stringifying its full raw content and re-listing every recipient; the prompt now caps raw message content and the recipient listing while keeping aggregated totals and counts exact',
      },
      {
        type: 'improvement',
        text: 'Polished the result card for extreme values — the hero amount is now width-capped so a very long token symbol can no longer squeeze and clip the transaction title next to it',
      },
    ],
  },
  {
    version: 'v1.7.0',
    date: '2026-07-25',
    entries: [
      {
        type: 'feature',
        text: 'Wallet on-chain footprint — the wallet scan now leads with a footprint card showing what an address actually spent to use the chain: real gas paid in INJ, the transactions it personally paid for, average fee, gas burned on failed transactions, and feegrant-covered txs where someone else footed the bill. Fees are attributed strictly to the fee payer, so a wallet that merely appears in other people\'s transactions is no longer credited with their gas',
      },
      {
        type: 'feature',
        text: 'See which dApps a wallet uses and what it did there — the footprint lists every recognised protocol the wallet interacted with, most-used first; click one to expand the exact on-chain actions it called (claim_reward, swap_min_output, withdraw_collateral, …) with per-method counts, then click an action to drill into its most-recent transactions, each linking straight into the decoder for the full plain-English breakdown',
      },
      {
        type: 'feature',
        text: 'New dApp directory at /dapps — browse the Injective protocols Tx·Translator recognises, each with a card showing lifetime on-chain executions, contract count, and first-seen / last-active dates pulled live from wasm chain state, alongside the context the decoder uses; linked from the footer',
      },
      {
        type: 'feature',
        text: 'New Perp PnL page at /pnl — a per-wallet derivatives track record built from the chain\'s own per-fill PnL and fee fields: realized PnL, fees, volume, win rate, average win/loss and hold time, plus live open positions and unrealized PnL, exact for the fetched window with no cost-basis guesswork',
      },
      {
        type: 'improvement',
        text: 'Named many more contracts — a series of on-chain sweeps across active wallets grew the protocol registry substantially (adding Hydro, Choice, SPACE ID, SGT, HyperNinja, Skip and more, each verified by its on-chain deployer/init before inclusion), so far fewer contract calls now show up as "unknown" in the footprint',
      },
      {
        type: 'improvement',
        text: 'Faster repeat wallet lookups — footprint scans are now cached briefly per address, so refreshing a wallet or revisiting it returns instantly instead of re-running a multi-page indexer scan',
      },
      {
        type: 'fix',
        text: 'Fixed the whale-feed cron intermittently reporting "failed (output too large)" — busy ticks returned an oversized diagnostic body that exceeded the cron runner\'s per-run storage cap despite a healthy 200 response; live ticks now return only counts and the events that actually posted',
      },
      {
        type: 'fix',
        text: 'Replaced five invalid (fabricated) contract addresses in the protocol registry — three Mito and two Hydro entries were not valid bech32 and could never match on chain, silently disabling Mito vault and some Hydro labelling; all now point to live, verified contracts',
      },
    ],
  },
  {
    version: 'v1.6.1',
    date: '2026-07-13',
    entries: [
      {
        type: 'fix',
        text: 'Fixed the whale feed double-posting RFQ trades — each RFQ fill also emits a synthetic mirror trade (the contract moving the position between its internal subaccounts) that carries the same size under a different subaccount and dedup key, so it slipped past every gate and posted as a second, opposite-direction whale; synthetic execution rows are now excluded, only the real taker order posts',
      },
    ],
  },
  {
    version: 'v1.6.0',
    date: '2026-07-13',
    entries: [
      {
        type: 'feature',
        text: 'Whale feed is live — Tx·Translator now watches every Injective derivative market in real time and posts large perp opens, liquidations, and closed-position PnL to X (@TxTranslator) and Discord in plain English; hero-tier events (e.g. $150k+ opens) include a reply with the decoded transaction link',
      },
      {
        type: 'feature',
        text: 'Feed thresholds are self-calibrating — a rolling 24h p85 dynamic bar adapts the posting floor to market activity, with per-subaccount cooldowns so a single bot can\'t flood the feed, and lower floors for tokenized stock / FX / metals markets where whale-size notionals run smaller',
      },
      {
        type: 'feature',
        text: 'Each feed post carries an AI-generated context line (Groq · Llama 3.3 70B) — leverage risk framing, realized-PnL angles, and TradFi off-hours notes — with a hand-written template fallback so posts never block on the model',
      },
      {
        type: 'fix',
        text: 'Fixed RFQ / contract-routed orders (Helix accept_quote flow) being invisible to the feed — these trades carry an all-zero order hash and were merging into one global aggregate; they are now grouped per block, subaccount, market, and direction, and their transaction hash resolves via the trader\'s inj1… address',
      },
    ],
  },
  {
    version: 'v1.5.0',
    date: '2026-07-01',
    entries: [
      {
        type: 'improvement',
        text: 'Full visual redesign aligned to the Injective brand — replaced the neon/cyberpunk theme with the official Injective palette (#4B39F8 brand purple, #F4F1E9 warm cream, #0B182B deep navy) plus refined white accents; removed every glow, scanline, dot-grid, and pulse animation for a calmer, product-grade surface that matches injective.com',
      },
      {
        type: 'improvement',
        text: 'Swapped the Rajdhani display font for Inter across the entire UI and the social share (OG) cards — retuned letter-spacing throughout for the new typeface so headings stay crisp and legible on both the live site and Twitter/Discord link previews',
      },
      {
        type: 'improvement',
        text: 'INJ / USDT price chart is now natively integrated instead of looking like a bolted-on external widget — its background matches the page (#0B182B), grid lines use a subtle brand-purple tint, and the TradingView top toolbar and bottom date-range bar are hidden for a clean candlestick view',
      },
      {
        type: 'improvement',
        text: 'Unified accent colors across every surface — decode cards, badges, buttons, headers, and the transaction-detail page now all draw from the shared design tokens; eliminated the last stray cyan borders and the leftover "AI" glyph from the previous theme',
      },
    ],
  },
  {
    version: 'v1.4.7',
    date: '2026-06-14',
    entries: [
      {
        type: 'critical',
        text: 'Fixed v2 exchange messages (MsgCreateSpotMarketOrder, MsgCreateDerivativeLimitOrder, MsgBatchUpdateOrders, etc.) not resolving protocol or action label — all modern Helix trades were showing protocol "Unknown" and a raw type fragment instead of "Spot Swap" / "Market Derivatives Trade" / etc.; added the full v2 type set to MESSAGE_TYPE_PROTOCOLS and ACTION_LABELS',
      },
      {
        type: 'fix',
        text: 'Fixed v2 MsgDeposit and MsgWithdraw not producing token movement entries — deposits into and withdrawals from a Helix subaccount via the v2 module were silently ignored by the asset extractor, causing the AI to report no funds moved when they clearly did',
      },
      {
        type: 'fix',
        text: 'Fixed AI response truncation on complex transactions — raised Groq max_tokens from 512 to 1024; governance votes with live tally data, multi-NFT sales, and perpetual trades with margin details were routinely hitting the limit and producing incomplete JSON that the repair pipeline had to patch',
      },
      {
        type: 'fix',
        text: 'Fixed unbonding missed-yield warning always using a hardcoded 15% APY — the warning line now reads the live network APR fetched from the chain and uses it for the USD calculation; the label and figure now reflect the actual current rate',
      },
      {
        type: 'fix',
        text: 'Fixed governance banner silently skipping proposals about market liquidations and closures — CRITICAL_RE now matches "liquidat" and "close" keywords in addition to the existing settle/delist/halt/emergency/critical set',
      },
      {
        type: 'fix',
        text: 'Fixed missing action labels for cosmos distribution and authz message types — MsgWithdrawDelegatorReward, MsgWithdrawValidatorCommission, MsgSetWithdrawAddress, MsgCancelUnbondingDelegation, MsgExec, MsgGrant, and MsgRevoke were falling through to the raw type fragment (e.g. "WithdrawDelegatorReward") in the wallet history panel; now display as "Claim Staking Rewards", "Authorized Action", etc.',
      },
      {
        type: 'improvement',
        text: 'LCD endpoint failover is now parallel instead of sequential — all four endpoints (Polkachu, InjectiveLabs, publicnode, lcd.injective.network) race simultaneously via Promise.any(); worst-case latency drops from ~40s (4 × 10s timeouts) to ~10s when one or more endpoints are blocked or slow',
      },
    ],
  },
  {
    version: 'v1.4.6',
    date: '2026-06-05',
    entries: [
      {
        type: 'feature',
        text: 'Added live news ticker — automatically surfaces Injective chain upgrade schedules and impactful governance proposals (settlement, delist, halt, migration) by polling the on-chain LCD at page load; scrolls right-to-left continuously, pauses on hover, and falls back to a manual override file for off-chain events like validator shutdowns',
      },
      {
        type: 'fix',
        text: 'Fixed ticker scroll starting from the middle of the screen — animation now measures the container width at runtime and starts the content just off the right edge, with a dynamic gap that guarantees the content always exits left before the seamless loop restarts',
      },
      {
        type: 'fix',
        text: 'Fixed AI response failing to parse when the LLM emits literal newlines inside JSON string values — a repair pass now escapes raw \\n/\\r characters before JSON.parse; previously caused "Translation unavailable" for any transaction where the model broke a string across lines',
      },
      {
        type: 'fix',
        text: 'Further hardened AI response parsing — switched from a greedy regex to brace-counting extraction (prevents over-capture when trailing text contains braces), added a greedy field-by-field fallback that tolerates unescaped inner quotes, and busted a stale 1-hour server cache that was serving old parse failures after the fix was deployed',
      },
    ],
  },
  {
    version: 'v1.4.5',
    date: '2026-06-03',
    entries: [
      {
        type: 'fix',
        text: 'Fixed redelegate AI insight failing to parse — the LLM occasionally closed a JSON string with a single quote instead of a double quote, causing "Translation unavailable"; a repair pass now corrects this before falling back to the error state',
      },
      {
        type: 'fix',
        text: 'Fixed redelegate action showing the auto-claimed reward amount (e.g. 0.179 INJ) instead of the actual principal — the redelegate amount is now extracted from the message and passed explicitly to the AI; the token movements line (which shows only rewards) is no longer used for the action or impact',
      },
      {
        type: 'fix',
        text: 'Redelegate messages now resolve validator names for both source and destination — the AI sees "Zellic" and "Injective Foundation 2" instead of raw inj1… addresses, producing a correctly labelled action sentence',
      },
      {
        type: 'fix',
        text: 'Fixed logo not clickable after decoding — clicking "TX · TRANSLATOR" in the header now resets the page to its initial state; previously the logo was an inert div with no handler on the home page',
      },
    ],
  },
  {
    version: 'v1.4.4',
    date: '2026-06-03',
    entries: [
      {
        type: 'fix',
        text: 'Fixed BUYBACK amount hallucination — the AI was reading the raw funds string (e.g. 43000000000000000000inj) from message content and misinterpreting the 18 decimal places as 0.043 INJ instead of 43 INJ; now explicitly guarded to always use the Token movements line',
      },
      {
        type: 'feature',
        text: 'Added Injective Community BuyBack support — transactions to the INJ BuyBack contract (inj10n78w…) now resolve as protocol "Injective Hub" with a dedicated BUYBACK category; AI Insight explains the permanent burn mechanism, historically 20%+ APY on committed INJ, and slot eligibility rules',
      },
    ],
  },
  {
    version: 'v1.4.3',
    date: '2026-06-02',
    entries: [
      {
        type: 'fix',
        text: 'Fixed MultiSend recipient perspective — viewers who received funds in a batch transfer were incorrectly shown the sender\'s view ("You distributed 500 INJ"); the AI now identifies the viewer\'s received amount and writes from the recipient\'s point of view',
      },
      {
        type: 'fix',
        text: 'Removed llama-3.1-8b-instant fallback model that was hitting Groq\'s 6000 TPM rate limit on large payloads (e.g. 18-recipient MultiSends); all transactions now route through llama-3.3-70b-versatile',
      },
    ],
  },
  {
    version: 'v1.4.2',
    date: '2026-06-02',
    entries: [
      {
        type: 'fix',
        text: 'Fixed MsgBeginRedelegate showing the auto-claimed reward amount (e.g. 0.179 INJ) instead of the actual redelegated amount — the primary asset now correctly reflects the full stake being moved between validators',
      },
    ],
  },
  {
    version: 'v1.4.1',
    date: '2026-06-02',
    entries: [
      {
        type: 'improvement',
        text: 'Added dismissible amber info banner at the top of the page to surface important Injective network news — currently warning delegators that Zellic validator is shutting down and linking to Injective Hub for redelegation',
      },
    ],
  },
  {
    version: 'v1.4.0',
    date: '2026-06-01',
    entries: [
      {
        type: 'critical',
        text: 'Injective v2 exchange messages (MsgCreateSpotMarketOrder, MsgCreateDerivativeLimitOrder, etc.) now correctly populate trade data — previously returned empty insights for all native v2 trades',
      },
      {
        type: 'critical',
        text: 'Fixed TLS certificate bypass missing from governance, validator, and NFT collection queries — these calls were silently failing on Windows, leaving AI with no proposal title, validator name, or collection info',
      },
      {
        type: 'fix',
        text: 'MsgBatchUpdateOrders containing only derivative orders now routes to the derivative trade parser instead of returning null trade data',
      },
      {
        type: 'improvement',
        text: 'Live validator info and network APR are now fetched for UNSTAKE and REDELEGATE transactions, giving the AI accurate validator name, voting power, and commission data for those flows',
      },
      {
        type: 'fix',
        text: 'Sellers in Talis buy transactions can now view their own perspective: a "Seller in this tx?" strip shows detected seller addresses — clicking one re-decodes the transaction from that wallet\'s point of view (sellers never sign the buy tx, so they could not reach it via wallet scan)',
      },
    ],
  },
  {
    version: 'v1.3.1',
    date: '2026-06-01',
    entries: [
      {
        type: 'fix',
        text: 'Fixed missing "Decode another transaction" button after using the client-side decoder',
      },
      {
        type: 'fix',
        text: 'Fixed Talis multi-seller transactions — seller perspective and per-item amounts now display correctly when multiple sellers are involved in one tx',
      },
      {
        type: 'fix',
        text: 'Fixed seller wallet context not passed to the translate API when decoding from the wallet transaction list',
      },
      {
        type: 'fix',
        text: 'Fixed AI bullet text overflow clipping on narrow screens',
      },
      {
        type: 'improvement',
        text: 'Added 1-hour server-side response cache (Next.js unstable_cache) to reduce Groq API usage on repeated lookups of the same transaction',
      },
      {
        type: 'improvement',
        text: 'Added Blue Chip Collection badge for Premier Ninja, MASKED, Pedro, Cult of Anons, and Injective Quants NFT collections',
      },
      {
        type: 'improvement',
        text: 'Improved NFT collection name detection — now reliably resolves collection names from CW721 contract_info for multi-item Talis buys',
      },
      {
        type: 'fix',
        text: 'Fixed hero headline text overflow on small viewports',
      },
    ],
  },
  {
    version: 'v1.3.0',
    date: '2026-05-31',
    entries: [
      {
        type: 'feature',
        text: 'Added Talis Protocol support: buy, list, mint, transfer, offer, and cancel-listing transactions now render with per-NFT price breakdown, seller received amounts, and platform context',
      },
      {
        type: 'fix',
        text: 'Fixed staking message amount display — raw atomic units (e.g. 16000000000000000 = 0.016 INJ) were being passed to the AI instead of the human-readable amount from token movements',
      },
    ],
  },
  {
    version: 'v1.2.0',
    date: '2026-05-30',
    entries: [
      {
        type: 'fix',
        text: 'Fixed Choice Exchange (Terraswap-fork AMM) swap parsing — offer/return amounts, slippage, and fee now extract correctly from wasm events',
      },
      {
        type: 'improvement',
        text: 'Reduced AI model costs — routing lighter transaction categories (DEPOSIT, WITHDRAW, CONTRACT, OTHER) to the smaller llama-3.1-8b-instant model',
      },
    ],
  },
  {
    version: 'v1.1.0',
    date: '2026-05-29',
    entries: [
      {
        type: 'feature',
        text: 'Added Vercel Web Analytics for usage tracking',
      },
      {
        type: 'improvement',
        text: 'OG share card now pre-warms the image cache on click so the X/Twitter bot always gets a rendered image without cold-start delays',
      },
    ],
  },
  {
    version: 'v1.0.0',
    date: '2026-05-27',
    entries: [
      {
        type: 'feature',
        text: 'Initial release — paste any Injective tx hash or wallet address to get an AI-powered plain-English breakdown with trade data, staking context, governance insights, and NFT details',
      },
      {
        type: 'feature',
        text: 'Helix spot and derivative trade analysis: execution price, slippage, fee tier, and VIP savings hints',
      },
      {
        type: 'feature',
        text: 'Governance vote analysis with live proposal tally, status, and settlement warnings',
      },
      {
        type: 'feature',
        text: 'Staking delegation analysis with live validator voting power, commission, and effective APR',
      },
      {
        type: 'feature',
        text: 'Wallet scanner — paste an inj1… address to list recent transactions with one-click decode',
      },
    ],
  },
];
