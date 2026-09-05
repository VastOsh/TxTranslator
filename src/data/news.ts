// Renzu news feed — the hub's "what's new and worth sharing" surface.
// Curated for people who make content about Injective (ambassadors, writers):
// each item is a real shipped thing, plus an `angle` line, a ready hook they can
// build a post around. Keep it honest, keep it current, newest first.

export type NewsKind = 'Launch' | 'New lens' | 'Data' | 'Update' | 'On X';

export interface NewsItem {
  id: string;
  kind: NewsKind;
  accent: string;      // Renzu brand token (hex)
  date: string;        // YYYY-MM-DD
  title: string;
  blurb: string;
  angle?: string;      // a ready content hook for creators
  href: string;
  external?: boolean;
  cta?: string;        // link label (defaults to "Open lens")
}

const TEAL = '#35C9BE';
const VIOLET = '#9B8CFF';
const AMBER = '#F0B24A';
const ROSE = '#E77BA6';

export const NEWS: NewsItem[] = [
  {
    id: 'inj-supply-myth',
    kind: 'Data',
    accent: TEAL,
    date: '2026-09-06',
    title: 'INJ has no 100M max supply',
    blurb:
      'A myth repeated even by long-time community members: INJ is not capped at 100M. Genesis was 100M, but supply is dynamic. Staking inflation mints new INJ, the weekly burn auction destroys it, and the total floats with no hard cap. The Renzu home page now shows the live figure straight from the chain.',
    angle:
      'The on-chain total is already ~122M, not 100M. Screenshot the live number and correct the "max supply" myth.',
    href: '/stats',
    cta: 'See the number',
  },
  {
    id: 'volume-full-year',
    kind: 'Data',
    accent: AMBER,
    date: '2026-09-05',
    title: 'A full year of volume, attributed by front-end',
    blurb:
      'The Volume lens now breaks down a full year of verified spot and perp volume by the dApp behind each trade. Injective is one shared order book, so trades are attributed by fee recipient. Helix, automated market-makers, Choice, Mito and direct flow each get their own line.',
    angle:
      'Most raw CLOB volume is automated market-making. Helix is the clear #1 retail venue. Good thread material.',
    href: '/stats',
    cta: 'Open the Volume lens',
  },
  {
    id: 'renzu-launch',
    kind: 'Launch',
    accent: VIOLET,
    date: '2026-09-03',
    title: 'TxTranslator is now Renzu',
    blurb:
      'The transaction decoder grew into a set of tools, so it gets a home that reflects that. Renzu is an Injective intelligence hub: paste anything on-chain and it routes you to the right lens. Renzu is Japanese for lens, each tool brings one part of Injective into focus. TxTranslator keeps its name and lives at /tx.',
    angle:
      'One paste bar for the whole chain: a hash, an address, or a token, and Renzu picks the lens. Easy to demo on video.',
    href: '/',
    cta: 'Explore the hub',
  },
  {
    id: 'wallet-insiders',
    kind: 'New lens',
    accent: VIOLET,
    date: '2026-08-30',
    title: 'Wallet Intelligence and Insiders',
    blurb:
      'Wallet Intelligence answers "who is behind this address": wallet age, first funder across Cosmos and EVM, launchpad track record, holdings and live risk flags. Insiders tracks serial funders that quietly seed the same wallets across tokens, surfaced before a launch instead of after.',
    angle:
      'Run any address before you ape. Show the funding graph catching a serial funder ahead of a launch.',
    href: '/wallet',
    cta: 'Open Wallet Intelligence',
  },
  {
    id: 'token-safety',
    kind: 'New lens',
    accent: ROSE,
    date: '2026-08-27',
    title: 'Token Safety, six signals on any denom',
    blurb:
      'Impersonation checks, launchpad rug signals, holder bubble maps, creator track record and wallet-funding graphs for any Injective token. It flags tokens that imitate a real project by name or branding, and surfaces the connections between a token, its creator and its funders.',
    angle:
      'Paste a fresh launchpad token and let the bubble map and impersonation check speak for themselves.',
    href: '/token',
    cta: 'Open Token Safety',
  },
  {
    id: 'community-buyback',
    kind: 'Update',
    accent: AMBER,
    date: '2026-08-27',
    title: 'Community BuyBack, honestly tracked',
    blurb:
      'Follow each INJ community buyback round with clear deposit timing and an honest read on where the flows land. No invented percentages, just the signals that are real and the timing that matters.',
    angle:
      'Explain how a buyback round actually works, round by round, with the deposit timing laid out.',
    href: '/buyback',
    cta: 'Open BuyBack',
  },
  {
    id: 'whale-feed',
    kind: 'On X',
    accent: TEAL,
    date: '2026-07-11',
    title: 'Whale Feed, live on X',
    blurb:
      'Large trades and transfers on Injective, streamed and auto-posted to X the moment they settle, each with an AI-written context line. The fastest way to catch a big move without watching the chain yourself.',
    angle:
      'Quote-tweet the biggest print of the day with your own take. The feed does the sourcing for you.',
    href: 'https://x.com/TxTranslator',
    external: true,
    cta: 'Follow on X',
  },
];
