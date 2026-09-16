import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Injective smart money leaderboard',
  description:
    'The most profitable Injective perp traders, ranked by realized net PnL and volume from on-chain fills. Each trader links to a full PnL breakdown.',
  alternates: { canonical: '/leaderboard' },
  openGraph: {
    title: 'Injective smart money leaderboard · Renzu',
    description:
      'The most profitable Injective perp traders, ranked by realized net PnL and volume from on-chain fills. Each trader links to a full PnL breakdown.',
    url: '/leaderboard',
  },
};

export default function LeaderboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
