'use client';

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/apiBase';
import {
  getParkTabGcTimeMs,
  getParkTabStaleTimeMs,
} from '@/lib/parkTabCachePolicy';
import {
  isExploreDataTab,
  TAB_ID_TO_CACHE_KEY,
  TAB_ID_TO_ENDPOINT,
} from '@/lib/parkTabEndpoints';

export function parkTabQueryKey(parkCode, tabId) {
  return ['parkTab', parkCode, tabId];
}

/**
 * Fetch one explore tab payload.
 * @param {string} parkCode
 * @param {string} tabId UI tab id (e.g. "places", "camping")
 */
export async function fetchParkTab(parkCode, tabId, apiUrl = getApiBaseUrl()) {
  const code = String(parkCode || '').toLowerCase();
  const endpoint = TAB_ID_TO_ENDPOINT[tabId];
  if (!code || !endpoint) return null;

  const res = await fetch(`${apiUrl}/parks/${code}/${endpoint}`);
  if (!res.ok) {
    throw new Error(`park tab ${endpoint} failed (${res.status})`);
  }
  const json = await res.json();
  return json?.data ?? null;
}

/**
 * Lazily load full tab payloads for the active (and optional deep-link) tabs.
 * @param {string} parkCode
 * @param {string[]} tabIds UI tab ids to load
 * @param {{ enabled?: boolean }} [options]
 */
export function useParkExploreTabBundle(parkCode, tabIds, { enabled = true } = {}) {
  const normalizedCode = parkCode ? String(parkCode).toLowerCase() : '';
  const ids = useMemo(
    () => [...new Set((tabIds || []).filter((id) => isExploreDataTab(id)))],
    [tabIds]
  );

  const results = useQueries({
    queries: ids.map((tabId) => ({
      queryKey: parkTabQueryKey(normalizedCode, tabId),
      queryFn: () => fetchParkTab(normalizedCode, tabId),
      enabled: enabled && Boolean(normalizedCode),
      staleTime: getParkTabStaleTimeMs(tabId),
      gcTime: getParkTabGcTimeMs(tabId),
      refetchOnWindowFocus: false,
    })),
  });

  const cache = useMemo(() => {
    const bundle = {};
    ids.forEach((tabId, index) => {
      const result = results[index];
      if (result?.isSuccess && result.data !== undefined) {
        bundle[TAB_ID_TO_CACHE_KEY[tabId]] = result.data;
      }
    });
    return Object.keys(bundle).length > 0 ? bundle : null;
  }, [ids, results]);

  const loadingByTabId = useMemo(() => {
    const map = {};
    ids.forEach((tabId, index) => {
      map[tabId] = Boolean(results[index]?.isLoading);
    });
    return map;
  }, [ids, results]);

  const loading = results.some((result) => result.isLoading);

  return { cache, loading, loadingByTabId };
}
