import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Injective transaction decoder',
  description:
    'Paste any Injective transaction hash and read it in plain English: every message, transfer and fee in order, enriched with USD values and expert insight.',
  alternates: { canonical: '/tx' },
  openGraph: {
    title: 'Injective transaction decoder · Renzu',
    description:
      'Paste any Injective transaction hash and read it in plain English: every message, transfer and fee in order, enriched with USD values and expert insight.',
    url: '/tx',
  },
};

export default function TxLensLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
