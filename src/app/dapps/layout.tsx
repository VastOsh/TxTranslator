import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Injective dApp directory',
  description:
    'The dApps and protocols building on Injective, with on-chain context for each. Explore the ecosystem lens by lens on Renzu.',
  alternates: { canonical: '/dapps' },
  openGraph: {
    title: 'Injective dApp directory · Renzu',
    description:
      'The dApps and protocols building on Injective, with on-chain context for each. Explore the ecosystem lens by lens on Renzu.',
    url: '/dapps',
  },
};

export default function DappsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
