import type { Metadata } from 'next';
import { lensMetadata } from '@/lib/seo';

export const metadata: Metadata = lensMetadata({
  title: 'Injective smart money leaderboard',
  description:
    'The most profitable Injective perp traders, ranked by realized net PnL and volume from on-chain fills. Each trader links to a full PnL breakdown.',
  path: '/leaderboard',
});

export default function LeaderboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
