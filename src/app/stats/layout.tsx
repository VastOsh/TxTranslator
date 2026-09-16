import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Injective volume and INJ burn',
  description:
    'Verified on-chain Injective spot and perp volume with daily and cumulative charts, a per-dApp breakdown, and the INJ burn auction totals.',
  alternates: { canonical: '/stats' },
  openGraph: {
    title: 'Injective volume and INJ burn · Renzu',
    description:
      'Verified on-chain Injective spot and perp volume with daily and cumulative charts, a per-dApp breakdown, and the INJ burn auction totals.',
    url: '/stats',
  },
};

export default function StatsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
