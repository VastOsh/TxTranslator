import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Injective wallet intelligence',
  description:
    'Look up any Injective wallet: account age, first funder, launchpad history, risk flags and the on-chain seed graph of linked wallets behind one operator.',
  alternates: { canonical: '/wallet' },
  openGraph: {
    title: 'Injective wallet intelligence · Renzu',
    description:
      'Look up any Injective wallet: account age, first funder, launchpad history, risk flags and the on-chain seed graph of linked wallets behind one operator.',
    url: '/wallet',
  },
};

export default function WalletLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
