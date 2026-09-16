import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Injective Community BuyBack tracker',
  description:
    'Track the Injective Community BuyBack: round timing, deposits and honest on-chain signals, with no inflated or invented numbers.',
  alternates: { canonical: '/buyback' },
  openGraph: {
    title: 'Injective Community BuyBack tracker · Renzu',
    description:
      'Track the Injective Community BuyBack: round timing, deposits and honest on-chain signals, with no inflated or invented numbers.',
    url: '/buyback',
  },
};

export default function BuybackLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
