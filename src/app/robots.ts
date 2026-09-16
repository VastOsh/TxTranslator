import type { MetadataRoute } from 'next';

// Crawlers may read every public lens. The owner-only area and the API surface
// carry no indexable content, so they are kept out of search results.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/me/', '/api/'],
    },
    sitemap: 'https://renzu.xyz/sitemap.xml',
    host: 'https://renzu.xyz',
  };
}
