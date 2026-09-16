import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>;
}): Promise<Metadata> {
  const { address } = await params;
  const short = `${address.slice(0, 10)}…${address.slice(-6)}`;
  const title = `Perp PnL ${short} · Tx·Translator`;
  const description = 'Realized PnL, win rate and open positions for any Injective perp trader.';
  return {
    // absolute: keep the exact share title, bypassing the root "%s · Renzu" template
    title: { absolute: title },
    openGraph: {
      title,
      description,
      type: 'website',
      url: `/pnl/${address}`,
      images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Renzu, every lens on Injective' }],
    },
    twitter: {
      card: 'summary_large_image',
      site: '@Renzuapp',
      title,
      description,
      images: ['/opengraph-image'],
    },
  };
}

export default function PnlLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
