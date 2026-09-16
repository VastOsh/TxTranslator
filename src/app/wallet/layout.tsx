import type { Metadata } from 'next';
import { lensMetadata } from '@/lib/seo';

export const metadata: Metadata = lensMetadata({
  title: 'Injective wallet intelligence',
  description:
    'Look up any Injective wallet: account age, first funder, launchpad history, risk flags and the on-chain seed graph of linked wallets behind one operator.',
  path: '/wallet',
});

export default function WalletLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
