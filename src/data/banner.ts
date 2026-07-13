export interface BannerItem {
  id: string;
  type: 'critical' | 'warning' | 'info';
  text: string;
  link?: string;
  linkText?: string;
}

// Manual overrides — for events the chain doesn't announce on-chain (validator news,
// frontend outages, social alerts, etc.). Remove entries once the event is over.
export const MANUAL_BANNER_ITEMS: BannerItem[] = [
  {
    id: 'whale-feed-live',
    type: 'info',
    text: 'NEW — the Tx·Translator whale feed is live: large perp opens, liquidations, and closed PnL on Injective, posted in plain English.',
    link: 'https://x.com/TxTranslator',
    linkText: 'Follow @TxTranslator ↗',
  },
  {
    id: 'zellic-shutdown',
    type: 'warning',
    text: 'Zellic validator is shutting down. Redelegate to keep earning staking rewards.',
    link: 'https://injhub.com/stake/',
    linkText: 'Redelegate on Injective Hub ↗',
  },
  {
    id: 'vulcan-upgrade',
    type: 'info',
    text: 'Injective Vulcan (v1.20.0) upgrade complete — modernized oracles, stablecoin support, tokenized RWAs, and reduced transaction costs.',
    link: 'https://hub.injective.network/governance/650',
    linkText: 'View proposal ↗',
  },
];
