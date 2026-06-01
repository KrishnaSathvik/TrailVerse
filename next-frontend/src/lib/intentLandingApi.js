import { getApiBaseUrl } from '@/lib/apiBase';

const DEFAULT_LIMIT = 24;
/** Production ISR for intent rankings; dev uses no-store so trait fixes show immediately. */
const REVALIDATE_SECONDS = 3600;

function searchFetchOptions() {
  if (process.env.NODE_ENV === 'development') {
    return { cache: 'no-store' };
  }
  return { next: { revalidate: REVALIDATE_SECONDS } };
}

/**
 * @param {string[]} featuredCodes
 * @param {object[]} parks
 * @param {number} limit
 */
export function mergeFeaturedParks(parks, featuredCodes = [], limit = DEFAULT_LIMIT) {
  if (!featuredCodes?.length) {
    return parks.slice(0, limit);
  }

  const normalizedFeatured = featuredCodes.map((c) => c.toLowerCase());
  const featuredSet = new Set(normalizedFeatured);
  const byCode = new Map(parks.map((p) => [String(p.parkCode).toLowerCase(), p]));

  const featured = normalizedFeatured
    .map((code) => byCode.get(code))
    .filter(Boolean);

  const rest = parks.filter((p) => !featuredSet.has(String(p.parkCode).toLowerCase()));

  return [...featured, ...rest].slice(0, limit);
}

/**
 * @param {import('@/data/intentLandings').IntentLanding} landing
 */
export async function fetchIntentLandingParks(landing, { limit = DEFAULT_LIMIT } = {}) {
  const apiBase = getApiBaseUrl();
  const params = new URLSearchParams({
    q: landing.searchQuery,
    limit: String(Math.max(limit, 48)),
  });

  if (landing.featuredParkCodes?.length) {
    params.set('pinned', landing.featuredParkCodes.join(','));
  }

  const res = await fetch(`${apiBase}/parks/search?${params}`, searchFetchOptions());

  if (!res.ok) {
    return { parks: [], totalCount: 0 };
  }

  const json = await res.json();
  const rawParks = json.data ?? json.parks ?? [];
  const totalCount = json.count ?? rawParks.length;
  const parks = mergeFeaturedParks(rawParks, landing.featuredParkCodes, limit);

  return { parks, totalCount };
}
