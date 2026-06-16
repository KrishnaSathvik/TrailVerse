'use client';

import { useQuery } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/apiBase';

export const PARK_EXPLORE_ENDPOINTS = [
  ['activities', 'activities'],
  ['places', 'places'],
  ['tours', 'tours'],
  ['visitorcenters', 'visitorcenters'],
  ['campgrounds', 'campgrounds'],
  ['parkinglots', 'parkinglots'],
  ['facilities', 'facilities'],
  ['brochures', 'brochures'],
  ['gallery', 'gallery'],
  ['videos', 'videos'],
  ['webcams', 'webcams'],
  ['transit', 'transit'],
];

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;

export function parkExploreQueryKey(parkCode) {
  return ['parkExploreCache', parkCode];
}

/**
 * Fetch all explore-tab payloads for one park (parallel).
 * @param {string} parkCode NPS park code
 * @param {string} [apiUrl]
 */
export async function fetchParkExploreBundle(parkCode, apiUrl = getApiBaseUrl()) {
  const results = await Promise.allSettled(
    PARK_EXPLORE_ENDPOINTS.map(([, endpoint]) =>
      fetch(`${apiUrl}/parks/${parkCode}/${endpoint}`)
        .then((res) => res.json())
        .then((json) => json?.data ?? null)
    )
  );

  const bundle = {};
  PARK_EXPLORE_ENDPOINTS.forEach(([key], index) => {
    const result = results[index];
    bundle[key] = result.status === 'fulfilled' ? result.value : null;
  });
  return bundle;
}

/**
 * Eagerly load explore-tab payloads once per park; cached in TanStack Query
 * so park → list → park in the same session reuses data within staleTime.
 */
export function useParkExploreCache(parkCode) {
  const normalizedCode = parkCode ? String(parkCode).toLowerCase() : '';

  const query = useQuery({
    queryKey: parkExploreQueryKey(normalizedCode),
    queryFn: () => fetchParkExploreBundle(normalizedCode),
    enabled: Boolean(normalizedCode),
    staleTime: FIVE_MINUTES_MS,
    gcTime: THIRTY_MINUTES_MS,
    refetchOnWindowFocus: false,
  });

  return {
    cache: query.data ?? null,
    ready: query.isSuccess,
    loading: query.isLoading,
  };
}
