import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Injective whale feed',
  description:
    'Notable Injective derivative events in real time: large perp opens, liquidations and closed-position PnL, in plain English. Also posted on X at @Renzuapp.',
  alternates: { canonical: '/feed' },
  openGraph: {
    title: 'Injective whale feed · Renzu',
    description:
      'Notable Injective derivative events in real time: large perp opens, liquidations and closed-position PnL, in plain English. Also posted on X at @Renzuapp.',
    url: '/feed',
  },
};

export default function FeedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
