import type { MetadataRoute } from 'next';
import { getAllParkCodes } from '@/lib/parkApi';

const BASE_URL = 'https://www.nationalparksexplorerusa.com';
const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://trailverse.onrender.com/api'
    : 'http://localhost:5001/api');

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static routes
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${BASE_URL}/explore`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE_URL}/blog`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/events`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${BASE_URL}/map`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/plan-ai`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/compare`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/features`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/testimonials`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.5 },
    { url: `${BASE_URL}/faq`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/privacy`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/terms`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
  ];

  // Park routes
  let parkRoutes: MetadataRoute.Sitemap = [];
  try {
    const parkCodes = await getAllParkCodes();
    parkRoutes = parkCodes.map((code: string) => ({
      url: `${BASE_URL}/parks/${code}`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 0.8,
    }));
  } catch (e) {
    console.error('Sitemap: Failed to fetch park codes', e);
  }

  // Blog routes
  let blogRoutes: MetadataRoute.Sitemap = [];
  try {
    const res = await fetch(`${API_URL}/blogs`, { next: { revalidate: 3600 } });
    if (res.ok) {
      const json = await res.json();
      const posts = json.data || json.blogs || json || [];
      blogRoutes = Array.isArray(posts)
        ? posts.map((post: { slug: string }) => ({
            url: `${BASE_URL}/blog/${post.slug}`,
            lastModified: new Date(),
            changeFrequency: 'monthly' as const,
            priority: 0.6,
          }))
        : [];
    }
  } catch (e) {
    console.error('Sitemap: Failed to fetch blog posts', e);
  }

  // State aggregation pages
  const stateRoutes: MetadataRoute.Sitemap = [
    'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'florida',
    'hawaii', 'idaho', 'kentucky', 'maine', 'michigan', 'minnesota', 'montana',
    'nevada', 'new-mexico', 'north-dakota', 'ohio', 'oregon', 'south-dakota',
    'tennessee', 'texas', 'utah', 'virginia', 'washington', 'west-virginia',
    'wyoming', 'north-carolina', 'south-carolina', 'indiana',
  ].map(stateCode => ({
    url: `${BASE_URL}/parks/state/${stateCode}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  // Blog category pages
  const categoryRoutes: MetadataRoute.Sitemap = [
    'trip-planning', 'park-guides', 'gear-packing',
    'seasonal', 'astrophotography', 'budget-travel'
  ].map(cat => ({
    url: `${BASE_URL}/blog/category/${cat}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  return [...staticRoutes, ...parkRoutes, ...stateRoutes, ...blogRoutes, ...categoryRoutes];
}
