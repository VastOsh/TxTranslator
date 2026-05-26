import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ hash: string }>;
}): Promise<Metadata> {
  const { hash } = await params;
  const shortHash = `${hash.slice(0, 8)}…${hash.slice(-6)}`;
  return {
    title: `Tx ${shortHash} — Tx·Translator`,
    twitter: {
      card: 'summary_large_image',
    },
  };
}

export default function TxLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
