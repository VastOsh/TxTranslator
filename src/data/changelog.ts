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

export const CURRENT_VERSION = 'v1.4.0';

// Entries within each version are ordered: critical → fix → improvement → feature
export const CHANGELOG: ChangelogVersion[] = [
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
