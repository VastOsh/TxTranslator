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
    id: 'zellic-shutdown',
    type: 'warning',
    text: 'Zellic validator is shutting down. Redelegate to keep earning staking rewards.',
    link: 'https://injhub.com/stake/',
    linkText: 'Redelegate on Injective Hub ↗',
  },
];
