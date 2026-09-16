import type { Metadata } from 'next';
import { lensMetadata } from '@/lib/seo';

export const metadata: Metadata = lensMetadata({
  title: 'Injective volume and INJ burn',
  description:
    'Verified on-chain Injective spot and perp volume with daily and cumulative charts, a per-dApp breakdown, and the INJ burn auction totals.',
  path: '/stats',
});

export default function StatsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
