import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Injective perp funding and open interest',
  description:
    'Live funding rates, open interest, long and short skew, mark price and max leverage across every active Injective perpetual market.',
  alternates: { canonical: '/perps' },
  openGraph: {
    title: 'Injective perp funding and open interest · Renzu',
    description:
      'Live funding rates, open interest, long and short skew, mark price and max leverage across every active Injective perpetual market.',
    url: '/perps',
  },
};

export default function PerpsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
