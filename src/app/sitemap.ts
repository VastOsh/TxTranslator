import type { MetadataRoute } from 'next';

const BASE = 'https://renzu.xyz';

// The public lens landing pages. Dynamic result pages (/tx/[hash],
// /pnl/[address], /dapps/[slug]) are generated per query and not enumerated
// here; the owner-only /me area is intentionally excluded.
const LENSES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
  { path: '/', priority: 1.0, changeFrequency: 'daily' },
  { path: '/tx', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/wallet', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/token', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/stats', priority: 0.8, changeFrequency: 'daily' },
  { path: '/pulse', priority: 0.8, changeFrequency: 'daily' },
  { path: '/perps', priority: 0.7, changeFrequency: 'daily' },
  { path: '/leaderboard', priority: 0.7, changeFrequency: 'daily' },
  { path: '/smart-positions', priority: 0.7, changeFrequency: 'daily' },
  { path: '/insiders', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/dapps', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/feed', priority: 0.7, changeFrequency: 'hourly' },
  { path: '/buyback', priority: 0.6, changeFrequency: 'weekly' },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return LENSES.map(({ path, priority, changeFrequency }) => ({
    url: `${BASE}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
