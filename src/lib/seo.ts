import type { Metadata } from 'next';

// Per-lens metadata helper. Next shallow-merges the `openGraph`/`twitter` objects,
// so a child that sets its own openGraph REPLACES the root's wholesale, including
// the file-based hub image. We therefore restate the share image here so every
// lens keeps a card while carrying its own title, description and canonical.
// (Next docs, "Merging": pull shared nested fields out and spread them.)
const HUB_OG_IMAGE = {
  url: '/opengraph-image',
  width: 1200,
  height: 630,
  alt: 'Renzu, every lens on Injective',
};

export function lensMetadata(opts: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const ogTitle = `${opts.title} · Renzu`;
  return {
    title: opts.title, // root template renders the document <title> as "<title> · Renzu"
    description: opts.description,
    alternates: { canonical: opts.path },
    openGraph: {
      type: 'website',
      siteName: 'Renzu',
      title: ogTitle,
      description: opts.description,
      url: opts.path,
      images: [HUB_OG_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      site: '@Renzuapp',
      creator: '@Renzuapp',
      title: ogTitle,
      description: opts.description,
      images: [HUB_OG_IMAGE],
    },
  };
}
