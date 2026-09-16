import type { Metadata } from 'next';
import { lensMetadata } from '@/lib/seo';

export const metadata: Metadata = lensMetadata({
  title: 'Injective transaction decoder',
  description:
    'Paste any Injective transaction hash and read it in plain English: every message, transfer and fee in order, enriched with USD values and expert insight.',
  path: '/tx',
});

export default function TxLensLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
