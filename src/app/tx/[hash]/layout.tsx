import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ hash: string }>;
}): Promise<Metadata> {
  const { hash } = await params;
  const shortHash = `${hash.slice(0, 8)}…${hash.slice(-6)}`;
  const ogImageUrl = `https://txtranslator.vercel.app/tx/${hash}/opengraph-image`;
  const title = `Tx ${shortHash} — Tx·Translator`;
  const description = 'Decoded Injective transaction — paste any hash on Tx·Translator.';
  return {
    title,
    openGraph: {
      title,
      description,
      type: 'website',
      url: `https://txtranslator.vercel.app/tx/${hash}`,
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default function TxLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
