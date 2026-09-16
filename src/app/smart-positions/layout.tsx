import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Injective smart money positions',
  description:
    'The live open perp positions of the top Injective traders, aggregated into net long and short exposure per market from the on-chain order book.',
  alternates: { canonical: '/smart-positions' },
  openGraph: {
    title: 'Injective smart money positions · Renzu',
    description:
      'The live open perp positions of the top Injective traders, aggregated into net long and short exposure per market from the on-chain order book.',
    url: '/smart-positions',
  },
};

export default function SmartPositionsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
