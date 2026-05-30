import { getApiBaseUrl } from './apiBase';

const BASE = () => `${getApiBaseUrl()}/discover`;

/** Seconds — aligned with React Query staleTime for discover detail */
export const DISCOVER_DETAIL_REVALIDATE_SEC = 30 * 60;

export async function fetchDiscoverCatalog() {
  const res = await fetch(`${BASE()}/catalog`, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error('Failed to load discover catalog');
  const json = await res.json();
  return json.data;
}

export async function fetchDiscoverDetail(dimension, slug) {
  const params = new URLSearchParams({ dimension, slug });
  const res = await fetch(`${BASE()}/detail?${params}`, {
    next: {
      revalidate: DISCOVER_DETAIL_REVALIDATE_SEC,
      tags: [`discover-detail-${dimension}-${slug}`]
    }
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to load discover detail');
  const json = await res.json();
  return json.data;
}

export async function fetchNpsGuide(title, slug) {
  const params = new URLSearchParams({ title, slug: slug || '' });
  const res = await fetch(`${BASE()}/nps-guide?${params}`, { next: { revalidate: 86400 } });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data;
}

export async function fetchDiscoverParksPage(
  dimension,
  slug,
  page = 1,
  limit = 12,
  { nationalParksOnly = false } = {}
) {
  const params = new URLSearchParams({
    dimension,
    slug,
    page: String(page),
    limit: String(limit)
  });
  if (nationalParksOnly) params.set('nationalParksOnly', 'true');
  const res = await fetch(`${BASE()}/parks?${params}`, {
    next: { revalidate: DISCOVER_DETAIL_REVALIDATE_SEC }
  });
  if (!res.ok) throw new Error('Failed to load parks');
  return res.json();
}
