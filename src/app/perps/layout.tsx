import type { Metadata } from 'next';
import { lensMetadata } from '@/lib/seo';

export const metadata: Metadata = lensMetadata({
  title: 'Injective perp funding and open interest',
  description:
    'Live funding rates, open interest, long and short skew, mark price and max leverage across every active Injective perpetual market.',
  path: '/perps',
});

export default function PerpsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
