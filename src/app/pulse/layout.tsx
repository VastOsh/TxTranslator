import type { Metadata } from 'next';
import { lensMetadata } from '@/lib/seo';

export const metadata: Metadata = lensMetadata({
  title: 'Injective Pulse, the on-chain fact sheet',
  description:
    'The state of Injective on one screen: price, volume, INJ burn, staking, capital and network vitals, each read from the chain and ready to quote.',
  path: '/pulse',
});

export default function PulseLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
