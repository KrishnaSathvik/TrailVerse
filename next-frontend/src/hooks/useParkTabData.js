'use client';

import { useMemo } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/apiBase';
import { CLIENT_CACHE_VERSION } from '@/lib/clientCacheVersion';
import {
  getParkTabGcTimeMs,
  getParkTabStaleTimeMs,
} from '@/lib/parkTabCachePolicy';
import {
  isExploreDataTab,
  TAB_ID_TO_CACHE_KEY,
  TAB_ID_TO_ENDPOINT,
} from '@/lib/parkTabEndpoints';

const ALL_EXPLORE_TAB_IDS = Object.keys(TAB_ID_TO_ENDPOINT);

export function parkTabQueryKey(parkCode, tabId) {
  return ['parkTab', CLIENT_CACHE_VERSION, parkCode, tabId];
}

function isTabQueryLoading(result) {
  if (!result) return false;
  return Boolean(result.isPending || result.isFetching);
}

function isTabQuerySettled(result) {
  if (!result) return false;
  return result.status === 'success' || result.status === 'error';
}

/**
 * Fetch one explore tab payload.
 * @param {string} parkCode
 * @param {string} tabId UI tab id (e.g. "places", "camping")
 */
const TAB_FETCH_TIMEOUT_MS = 25_000;

export async function fetchParkTab(parkCode, tabId, apiUrl = getApiBaseUrl()) {
  const code = String(parkCode || '').toLowerCase();
  const endpoint = TAB_ID_TO_ENDPOINT[tabId];
  if (!code || !endpoint) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TAB_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${apiUrl}/parks/${code}/${endpoint}`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`park tab ${endpoint} failed (${res.status})`);
    }
    const json = await res.json();
    return json?.data ?? null;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`park tab ${endpoint} timed out`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Lazily load full tab payloads for the active (and optional deep-link) tabs.
 * Merges all previously fetched tabs from the React Query cache so switching
 * tabs does not drop already-loaded data.
 * @param {string} parkCode NPS park code (e.g. "yell") — not the URL slug
 * @param {string[]} tabIds UI tab ids to load
 * @param {{ enabled?: boolean }} [options]
 */
export function useParkExploreTabBundle(parkCode, tabIds, { enabled = true } = {}) {
  const queryClient = useQueryClient();
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
    if (!normalizedCode) return null;

    const bundle = {};
    for (const tabId of ALL_EXPLORE_TAB_IDS) {
      const state = queryClient.getQueryState(parkTabQueryKey(normalizedCode, tabId));
      if (state?.data !== undefined) {
        bundle[TAB_ID_TO_CACHE_KEY[tabId]] = state.data;
      }
    }

    ids.forEach((tabId, index) => {
      const data = results[index]?.data;
      if (data !== undefined) {
        bundle[TAB_ID_TO_CACHE_KEY[tabId]] = data;
      }
    });

    return Object.keys(bundle).length > 0 ? bundle : null;
  }, [normalizedCode, ids, results, queryClient]);

  const loadingByTabId = useMemo(() => {
    const map = {};
    ids.forEach((tabId, index) => {
      map[tabId] = isTabQueryLoading(results[index]);
    });
    return map;
  }, [ids, results]);

  const fetchedByTabId = useMemo(() => {
    const map = {};
    if (!normalizedCode) return map;

    for (const tabId of ALL_EXPLORE_TAB_IDS) {
      const state = queryClient.getQueryState(parkTabQueryKey(normalizedCode, tabId));
      if (isTabQuerySettled(state)) {
        map[tabId] = true;
      }
    }

    ids.forEach((tabId, index) => {
      if (isTabQuerySettled(results[index])) {
        map[tabId] = true;
      }
    });

    return map;
  }, [normalizedCode, ids, results, queryClient]);

  const errorByTabId = useMemo(() => {
    const map = {};
    if (!normalizedCode) return map;

    for (const tabId of ALL_EXPLORE_TAB_IDS) {
      const state = queryClient.getQueryState(parkTabQueryKey(normalizedCode, tabId));
      if (state?.status === 'error') {
        map[tabId] = state.error;
      }
    }

    ids.forEach((tabId, index) => {
      if (results[index]?.status === 'error') {
        map[tabId] = results[index].error;
      }
    });

    return map;
  }, [normalizedCode, ids, results, queryClient]);

  const loading = results.some((result) => isTabQueryLoading(result));

  return { cache, loading, loadingByTabId, fetchedByTabId, errorByTabId };
}

/** High-value tabs to warm after the overview paints (idle, no explore-index). */
export const PARK_TAB_IDLE_PREFETCH_IDS = ['places', 'activities'];

/**
 * Prefetch explore tab payloads into the React Query cache (e.g. requestIdleCallback).
 * @param {import('@tanstack/react-query').QueryClient} queryClient
 * @param {string} parkCode
 * @param {string[]} [tabIds]
 */
export function prefetchParkExploreTabs(
  queryClient,
  parkCode,
  tabIds = PARK_TAB_IDLE_PREFETCH_IDS
) {
  const code = String(parkCode || '').toLowerCase();
  if (!code || !queryClient) return;

  for (const tabId of tabIds) {
    if (!isExploreDataTab(tabId)) continue;
    const queryKey = parkTabQueryKey(code, tabId);
    const existing = queryClient.getQueryState(queryKey);
    if (existing?.data !== undefined || existing?.fetchStatus === 'fetching') continue;

    queryClient.prefetchQuery({
      queryKey,
      queryFn: () => fetchParkTab(code, tabId),
      staleTime: getParkTabStaleTimeMs(tabId),
    });
  }
}
