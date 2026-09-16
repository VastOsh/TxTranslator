import type { Metadata } from 'next';
import { lensMetadata } from '@/lib/seo';

export const metadata: Metadata = lensMetadata({
  title: 'Injective insider and serial-funder tracker',
  description:
    'Track serial funders on Injective: wallets that seeded many token launches, and the funding clusters behind new tokens, read from the on-chain graph.',
  path: '/insiders',
});

export default function InsidersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
