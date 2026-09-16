import type { Metadata } from 'next';
import { lensMetadata } from '@/lib/seo';

export const metadata: Metadata = lensMetadata({
  title: 'Injective smart money positions',
  description:
    'The live open perp positions of the top Injective traders, aggregated into net long and short exposure per market from the on-chain order book.',
  path: '/smart-positions',
});

export default function SmartPositionsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
