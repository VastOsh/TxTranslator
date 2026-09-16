import type { Metadata } from 'next';
import { Inter, IBM_Plex_Sans, JetBrains_Mono, Bricolage_Grotesque } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

const inter = Inter({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-rajdhani',
});

const ibmPlexSans = IBM_Plex_Sans({
  weight: ['400', '500', '600'],
  subsets: ['latin'],
  variable: '--font-ibm-plex',
});

const jetbrainsMono = JetBrains_Mono({
  weight: ['400', '500'],
  subsets: ['latin'],
  variable: '--font-mono',
});

// Renzu display face — carries the hub's brand voice.
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display',
});

const DESCRIPTION =
  'The Injective intelligence hub. Decode transactions, inspect wallets and tokens, track real on-chain volume, burn and whales, each through its own lens.';

export const metadata: Metadata = {
  metadataBase: new URL('https://renzu.xyz'),
  title: {
    default: 'Renzu · Every lens on Injective',
    template: '%s · Renzu',
  },
  description: DESCRIPTION,
  applicationName: 'Renzu',
  keywords: [
    'Injective',
    'INJ',
    'Injective explorer',
    'transaction decoder',
    'wallet intelligence',
    'token safety',
    'perpetuals',
    'on-chain analytics',
    'INJ burn',
    'DeFi',
  ],
  authors: [{ name: 'Renzu', url: 'https://renzu.xyz' }],
  creator: 'Renzu',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'Renzu',
    title: 'Renzu · Every lens on Injective',
    description: DESCRIPTION,
    url: '/',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@Renzuapp',
    creator: '@Renzuapp',
    title: 'Renzu · Every lens on Injective',
    description: DESCRIPTION,
  },
};

// Organization + WebSite structured data, so search engines can attach the
// brand, logo and social account to renzu.xyz. No SearchAction: the hub routes
// a pasted query client-side (tx vs wallet vs token) with no single results
// URL, so a sitelinks searchbox target would be dishonest.
const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://renzu.xyz/#org',
      name: 'Renzu',
      url: 'https://renzu.xyz',
      logo: 'https://renzu.xyz/icon.svg',
      sameAs: ['https://x.com/Renzuapp'],
    },
    {
      '@type': 'WebSite',
      '@id': 'https://renzu.xyz/#website',
      name: 'Renzu',
      description: DESCRIPTION,
      url: 'https://renzu.xyz',
      inLanguage: 'en',
      publisher: { '@id': 'https://renzu.xyz/#org' },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${ibmPlexSans.variable} ${jetbrainsMono.variable} ${bricolage.variable}`}
    >
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
