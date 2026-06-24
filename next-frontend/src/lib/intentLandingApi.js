import { getApiBaseUrl } from '@/lib/apiBase';

const DEFAULT_LIMIT = 24;
const PRODUCTION_API = 'https://trailverse.onrender.com/api';
/** Production ISR for intent rankings; dev uses no-store so trait fixes show immediately. */
export const INTENT_LANDING_REVALIDATE_SECONDS = 3600;
const REVALIDATE_SECONDS = INTENT_LANDING_REVALIDATE_SECONDS;

/** Card grid fields for intent landings — matchReason replaces heavy descriptions. */
export const INTENT_SEARCH_LITE_FIELDS =
  'parkCode,fullName,states,designation,images,matchReason,matchedTraits';
const FETCH_TIMEOUT_MS = 45_000;
const MAX_ATTEMPTS = 2;

function searchFetchOptions(attempt) {
  if (process.env.NODE_ENV === 'development') {
    return { cache: 'no-store' };
  }
  // Do not long-cache failed or empty responses from a flaky build-time fetch
  if (attempt > 0) {
    return { cache: 'no-store' };
  }
  return { next: { revalidate: REVALIDATE_SECONDS } };
}

function intentSearchUrl(apiBase, params) {
  const base = apiBase.endsWith('/api') ? apiBase : `${apiBase.replace(/\/$/, '')}/api`;
  return `${base}/parks/search?${params}`;
}

/**
 * Server intent fetch: prefer explicit production API so Vercel build does not self-fetch
 * or cache empty grids when the deployment URL is not reachable yet.
 */
function intentServerApiBases() {
  const primary = getApiBaseUrl();
  const bases = [primary];
  if (!primary.startsWith(PRODUCTION_API)) {
    bases.push(PRODUCTION_API);
  }
  return [...new Set(bases)];
}

async function fetchIntentSearchOnce(apiBase, params, attempt) {
  const url = intentSearchUrl(apiBase, params);
  const res = await fetch(url, {
    ...searchFetchOptions(attempt),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  return res;
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
  const params = new URLSearchParams({
    q: landing.searchQuery,
    limit: String(Math.max(limit, 48)),
  });

  if (landing.featuredParkCodes?.length) {
    params.set('pinned', landing.featuredParkCodes.join(','));
  }
  params.set('fields', INTENT_SEARCH_LITE_FIELDS);

  const paramString = params.toString();
  const bases = intentServerApiBases();
  let lastError = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    for (const apiBase of bases) {
      try {
        const res = await fetchIntentSearchOnce(apiBase, paramString, attempt);
        if (!res.ok) {
          lastError = new Error(`HTTP ${res.status} from ${apiBase}`);
          continue;
        }

        const json = await res.json();
        const rawParks = json.data ?? json.parks ?? [];
        const totalCount = json.count ?? rawParks.length;
        const parks = mergeFeaturedParks(rawParks, landing.featuredParkCodes, limit);

        if (parks.length > 0) {
          return { parks, totalCount };
        }

        lastError = new Error(`Empty park list from ${apiBase}`);
      } catch (err) {
        lastError = err;
      }
    }
  }

  if (process.env.NODE_ENV === 'development' && lastError) {
    console.warn('[fetchIntentLandingParks]', landing.searchQuery, lastError.message);
  }

  return { parks: [], totalCount: 0 };
}

/**
 * Browser fetch for Plan AI intent sessions — same lite search as guide pages.
 * @param {import('@/data/intentLandings').IntentLanding} landing
 * @param {{ limit?: number }} [options]
 */
export async function fetchIntentLandingParksClient(landing, { limit = DEFAULT_LIMIT } = {}) {
  const params = new URLSearchParams({
    q: landing.searchQuery,
    limit: String(Math.max(limit, 48)),
    fields: INTENT_SEARCH_LITE_FIELDS,
  });

  if (landing.featuredParkCodes?.length) {
    params.set('pinned', landing.featuredParkCodes.join(','));
  }

  try {
    const res = await fetch(`${getApiBaseUrl()}/parks/search?${params.toString()}`);
    if (!res.ok) {
      return { parks: [], totalCount: 0 };
    }

    const json = await res.json();
    const rawParks = json.data ?? json.parks ?? [];
    const totalCount = json.count ?? rawParks.length;
    const parks = mergeFeaturedParks(rawParks, landing.featuredParkCodes, limit);
    return { parks, totalCount };
  } catch {
    return { parks: [], totalCount: 0 };
  }
}
