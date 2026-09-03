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

export const metadata: Metadata = {
  metadataBase: new URL('https://txtranslator.vercel.app'),
  title: 'Renzu · Every lens on Injective',
  description: 'The Injective intelligence hub. Decode transactions, inspect wallets and tokens, track real volume and whales, each through its own lens.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${ibmPlexSans.variable} ${jetbrainsMono.variable} ${bricolage.variable}`}
    >
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
