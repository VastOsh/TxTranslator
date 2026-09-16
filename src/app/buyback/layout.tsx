import type { Metadata } from 'next';
import { lensMetadata } from '@/lib/seo';

export const metadata: Metadata = lensMetadata({
  title: 'Injective Community BuyBack tracker',
  description:
    'Track the Injective Community BuyBack: round timing, deposits and honest on-chain signals, with no inflated or invented numbers.',
  path: '/buyback',
});

export default function BuybackLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
