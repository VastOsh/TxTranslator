import type { Metadata } from 'next';
import { lensMetadata } from '@/lib/seo';

export const metadata: Metadata = lensMetadata({
  title: 'Injective token safety checker',
  description:
    'Check any Injective token for impersonation, launchpad rug signals, holder bubble maps, creator track record and wallet-funding clusters.',
  path: '/token',
});

export default function TokenLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
