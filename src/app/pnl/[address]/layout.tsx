import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>;
}): Promise<Metadata> {
  const { address } = await params;
  const short = `${address.slice(0, 10)}…${address.slice(-6)}`;
  const title = `Perp PnL ${short} — Tx·Translator`;
  const description = 'Realized PnL, win rate and open positions for any Injective perp trader.';
  return {
    title,
    openGraph: {
      title,
      description,
      type: 'website',
      url: `https://txtranslator.vercel.app/pnl/${address}`,
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default function PnlLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
