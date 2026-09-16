import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Injective Pulse, the on-chain fact sheet',
  description:
    'The state of Injective on one screen: price, volume, INJ burn, staking, capital and network vitals, each read from the chain and ready to quote.',
  alternates: { canonical: '/pulse' },
  openGraph: {
    title: 'Injective Pulse, the on-chain fact sheet · Renzu',
    description:
      'The state of Injective on one screen: price, volume, INJ burn, staking, capital and network vitals, each read from the chain and ready to quote.',
    url: '/pulse',
  },
};

export default function PulseLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
