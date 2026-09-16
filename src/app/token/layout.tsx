import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Injective token safety checker',
  description:
    'Check any Injective token for impersonation, launchpad rug signals, holder bubble maps, creator track record and wallet-funding clusters.',
  alternates: { canonical: '/token' },
  openGraph: {
    title: 'Injective token safety checker · Renzu',
    description:
      'Check any Injective token for impersonation, launchpad rug signals, holder bubble maps, creator track record and wallet-funding clusters.',
    url: '/token',
  },
};

export default function TokenLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
