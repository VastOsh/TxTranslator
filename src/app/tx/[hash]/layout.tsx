import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ hash: string }>;
}): Promise<Metadata> {
  const { hash } = await params;
  const shortHash = `${hash.slice(0, 8)}…${hash.slice(-6)}`;
  const ogImageUrl = `https://txtranslator.vercel.app/tx/${hash}/opengraph-image`;
  return {
    title: `Tx ${shortHash} — Tx·Translator`,
    openGraph: {
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      images: [ogImageUrl],
    },
  };
}

export default function TxLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
