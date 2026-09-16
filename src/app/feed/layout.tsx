import type { Metadata } from 'next';
import { lensMetadata } from '@/lib/seo';

export const metadata: Metadata = lensMetadata({
  title: 'Injective whale feed',
  description:
    'Notable Injective derivative events in real time: large perp opens, liquidations and closed-position PnL, in plain English. Also posted on X at @Renzuapp.',
  path: '/feed',
});

export default function FeedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
