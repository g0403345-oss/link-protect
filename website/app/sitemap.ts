import type { MetadataRoute } from 'next';

const BASE = 'https://link-protect.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes: { path: string; priority: number; changeFrequency: 'daily' | 'weekly' | 'monthly' }[] = [
    { path: '/', priority: 1, changeFrequency: 'weekly' },
    { path: '/check', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/welcome', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/premium', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/update', priority: 0.6, changeFrequency: 'weekly' },
    { path: '/developers', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/intro', priority: 0.5, changeFrequency: 'monthly' },
    { path: '/terms', priority: 0.3, changeFrequency: 'monthly' },
    { path: '/privacy', priority: 0.3, changeFrequency: 'monthly' },
  ];
  return routes.map((r) => ({
    url: `${BASE}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
