import type { MetadataRoute } from 'next';
import { getAllParkSlugs } from '@/lib/parkApi';
import { GUIDES } from '@/data/guides';
import { INTENT_LANDINGS } from '@/data/intentLandings';
import { COMPARE_LANDINGS } from '@/data/compareLandings';

import { PUBLIC_ITINERARIES } from '@/data/publicItineraries';
import { blogSitemapEntries, latestBlogDateModified } from '@/lib/blogDates';

const BASE_URL = 'https://www.nationalparksexplorerusa.com';
const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://trailverse.onrender.com/api'
    : 'http://localhost:5001/api');

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static routes. Dynamic hubs (/, /events, /explore, /where-next, /discover/*)
  // omit lastModified: they have no editorial modification record, and a
  // request-time `new Date()` would falsely claim they changed on every crawl.
  // /blog gets the newest blog post date once posts are fetched below.
  const blogHubRoute: MetadataRoute.Sitemap[number] = {
    url: `${BASE_URL}/blog`,
    changeFrequency: 'weekly',
    priority: 0.8,
  };
  const staticRoutes: MetadataRoute.Sitemap = [
    // Daily-changing content
    { url: BASE_URL, changeFrequency: 'daily', priority: 1.0 },
    { url: `${BASE_URL}/events`, changeFrequency: 'daily', priority: 0.8 },
    // Weekly-changing content
    { url: `${BASE_URL}/explore`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE_URL}/where-next`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/discover`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE_URL}/discover/activities`, changeFrequency: 'weekly', priority: 0.85 },
    { url: `${BASE_URL}/discover/topics`, changeFrequency: 'weekly', priority: 0.85 },
    { url: `${BASE_URL}/discover/types`, changeFrequency: 'weekly', priority: 0.85 },
    { url: `${BASE_URL}/discover/states`, changeFrequency: 'weekly', priority: 0.85 },
    blogHubRoute,
    { url: `${BASE_URL}/plan-ai`, lastModified: new Date('2026-05-01'), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/trailie-demo`, lastModified: new Date('2026-06-11'), changeFrequency: 'weekly', priority: 0.75 },
    { url: `${BASE_URL}/testimonials`, lastModified: new Date('2026-05-01'), changeFrequency: 'weekly', priority: 0.5 },
    // Monthly/rarely-changing content
    { url: `${BASE_URL}/map`, lastModified: new Date('2026-05-01'), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/compare`, lastModified: new Date('2026-05-01'), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/about`, lastModified: new Date('2026-01-01'), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/features`, lastModified: new Date('2026-01-01'), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/mcp`, lastModified: new Date('2026-05-01'), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/chatgpt`, lastModified: new Date('2026-05-01'), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/magazine`, lastModified: new Date('2026-05-01'), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/faq`, lastModified: new Date('2026-01-01'), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/guides`, lastModified: new Date('2026-05-31'), changeFrequency: 'monthly', priority: 0.75 },
    { url: `${BASE_URL}/itineraries`, lastModified: new Date('2026-07-12'), changeFrequency: 'weekly', priority: 0.8 },
    {
      url: `${BASE_URL}/reports/when-to-go.html`,
      lastModified: new Date('2026-05-01'),
      changeFrequency: 'monthly',
      priority: 0.75,
    },
    { url: `${BASE_URL}/privacy`, lastModified: new Date('2026-01-01'), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/terms`, lastModified: new Date('2026-01-01'), changeFrequency: 'yearly', priority: 0.3 },
  ];

  // Park routes — content doesn't change at the URL level daily
  let parkRoutes: MetadataRoute.Sitemap = [];
  try {
    const parkSlugs = await getAllParkSlugs();
    const parkLastModified = new Date('2026-05-01');
    parkRoutes = parkSlugs.map(({ slug }: { slug: string }) => ({
      url: `${BASE_URL}/parks/${slug}`,
      lastModified: parkLastModified,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }));
  } catch (e) {
    console.error('Sitemap: Failed to fetch park slugs', e);
  }

  // Blog routes — editorial date (contentUpdatedAt || publishedAt), never updatedAt
  let blogRoutes: MetadataRoute.Sitemap = [];
  try {
    const res = await fetch(`${API_URL}/blogs?status=published&limit=200`, { next: { revalidate: 3600 } });
    if (res.ok) {
      const json = await res.json();
      const posts = json.data || json.blogs || json || [];
      blogRoutes = blogSitemapEntries(posts, BASE_URL);
      const latest = latestBlogDateModified(posts);
      if (latest) blogHubRoute.lastModified = latest;
    }
  } catch (e) {
    console.error('Sitemap: Failed to fetch blog posts', e);
  }

  // State aggregation pages — all US states & territories with NPS sites
  const stateLastModified = new Date('2026-05-01');
  const stateRoutes: MetadataRoute.Sitemap = [
    'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado',
    'connecticut', 'delaware', 'district-of-columbia', 'florida', 'georgia',
    'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky',
    'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota',
    'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new-hampshire',
    'new-jersey', 'new-mexico', 'new-york', 'north-carolina', 'north-dakota',
    'ohio', 'oklahoma', 'oregon', 'pennsylvania', 'rhode-island',
    'south-carolina', 'south-dakota', 'tennessee', 'texas', 'utah', 'vermont',
    'virginia', 'washington', 'west-virginia', 'wisconsin', 'wyoming',
    'american-samoa', 'guam', 'puerto-rico', 'virgin-islands',
  ].map(stateCode => ({
    url: `${BASE_URL}/parks/state/${stateCode}`,
    lastModified: stateLastModified,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  // Blog category pages
  const categoryLastModified = new Date('2026-03-01');
  const categoryRoutes: MetadataRoute.Sitemap = [
    'trip-planning', 'park-guides', 'gear-packing',
    'seasonal', 'astrophotography', 'budget-travel'
  ].map(cat => ({
    url: `${BASE_URL}/blog/category/${cat}`,
    lastModified: categoryLastModified,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  const guideLastModified = new Date('2026-05-31');
  const guideRoutes: MetadataRoute.Sitemap = GUIDES.map((guide) => ({
    url: `${BASE_URL}/guides/${guide.slug}`,
    lastModified: guideLastModified,
    changeFrequency: 'monthly' as const,
    priority: 0.75,
  }));

  const intentLastModified = new Date('2026-05-31');
  const intentRoutes: MetadataRoute.Sitemap = INTENT_LANDINGS.map((landing) => ({
    url: `${BASE_URL}${landing.path}`,
    lastModified: intentLastModified,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  const compareLastModified = new Date('2026-06-01');
  const compareRoutes: MetadataRoute.Sitemap = COMPARE_LANDINGS.map((landing) => ({
    url: `${BASE_URL}/compare/${landing.slug}`,
    lastModified: compareLastModified,
    changeFrequency: 'monthly' as const,
    priority: 0.75,
  }));

  const sampleRoutes: MetadataRoute.Sitemap = PUBLIC_ITINERARIES.map(sample => ({
    url: `${BASE_URL}/itineraries/${sample.slug}`, changeFrequency: 'yearly' as const, priority: 0.75,
  }));

  return [...sampleRoutes, ...staticRoutes, ...compareRoutes, ...parkRoutes, ...stateRoutes, ...blogRoutes, ...categoryRoutes, ...guideRoutes, ...intentRoutes];
}
