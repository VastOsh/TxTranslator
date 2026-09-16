import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Injective insider and serial-funder tracker',
  description:
    'Track serial funders on Injective: wallets that seeded many token launches, and the funding clusters behind new tokens, read from the on-chain graph.',
  alternates: { canonical: '/insiders' },
  openGraph: {
    title: 'Injective insider and serial-funder tracker · Renzu',
    description:
      'Track serial funders on Injective: wallets that seeded many token launches, and the funding clusters behind new tokens, read from the on-chain graph.',
    url: '/insiders',
  },
};

export default function InsidersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
