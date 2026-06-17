'use client';

import { useQuery } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/apiBase';
import { EXPLORE_INDEX_STALE_MS, STATIC_TAB_GC_MS } from '@/lib/parkTabCachePolicy';

export function parkExploreIndexQueryKey(parkCode) {
  return ['parkExploreIndex', parkCode];
}

/**
 * Lightweight tab availability (counts only) for hiding empty explore tabs.
 * @param {string} parkCode NPS park code
 */
export async function fetchParkExploreIndex(parkCode, apiUrl = getApiBaseUrl()) {
  const code = String(parkCode || '').toLowerCase();
  const res = await fetch(`${apiUrl}/parks/${code}/explore-index`);
  if (!res.ok) {
    throw new Error(`explore-index failed (${res.status})`);
  }
  const json = await res.json();
  return json?.data ?? null;
}

export function useParkExploreIndex(parkCode) {
  const normalizedCode = parkCode ? String(parkCode).toLowerCase() : '';

  const query = useQuery({
    queryKey: parkExploreIndexQueryKey(normalizedCode),
    queryFn: () => fetchParkExploreIndex(normalizedCode),
    enabled: Boolean(normalizedCode),
    staleTime: EXPLORE_INDEX_STALE_MS,
    gcTime: STATIC_TAB_GC_MS,
    refetchOnWindowFocus: false,
  });

  return {
    index: query.data ?? null,
    ready: query.isSuccess,
    loading: query.isLoading,
  };
}
