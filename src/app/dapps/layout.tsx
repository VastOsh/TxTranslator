import type { Metadata } from 'next';
import { lensMetadata } from '@/lib/seo';

export const metadata: Metadata = lensMetadata({
  title: 'Injective dApp directory',
  description:
    'The dApps and protocols building on Injective, with on-chain context for each. Explore the ecosystem lens by lens on Renzu.',
  path: '/dapps',
});

export default function DappsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
