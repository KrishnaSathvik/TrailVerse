'use client';

import { useQuery } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/apiBase';
import { CLIENT_CACHE_VERSION } from '@/lib/clientCacheVersion';
import {
  getParkTabGcTimeMs,
  getParkTabStaleTimeMs,
} from '@/lib/parkTabCachePolicy';

const AUX_STALE_MS = getParkTabStaleTimeMs('places');
const AUX_GC_MS = getParkTabGcTimeMs('places');

export function parkAlertsQueryKey(parkCode) {
  return ['parkAlerts', CLIENT_CACHE_VERSION, parkCode];
}

export function parkPermitsQueryKey(parkCode) {
  return ['parkPermits', CLIENT_CACHE_VERSION, parkCode];
}

export function parkReviewsQueryKey(parkCode) {
  return ['parkReviews', CLIENT_CACHE_VERSION, parkCode];
}

function ssrArrayOptions(initialData) {
  const hasSsr = Array.isArray(initialData);
  if (!hasSsr) return {};
  return {
    initialData,
    refetchOnMount: false,
  };
}

export function useParkAlerts(parkCode, enabled, initialAlerts) {
  const code = parkCode ? String(parkCode).toLowerCase() : '';
  return useQuery({
    queryKey: parkAlertsQueryKey(code),
    queryFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/parks/${code}/alerts`);
      if (!res.ok) throw new Error(`alerts failed (${res.status})`);
      const json = await res.json();
      return Array.isArray(json?.data) ? json.data : [];
    },
    enabled: Boolean(code) && enabled,
    staleTime: AUX_STALE_MS,
    gcTime: AUX_GC_MS,
    refetchOnWindowFocus: false,
    ...ssrArrayOptions(initialAlerts),
  });
}

export function useParkPermits(parkCode, enabled, initialPermits) {
  const code = parkCode ? String(parkCode).toLowerCase() : '';
  return useQuery({
    queryKey: parkPermitsQueryKey(code),
    queryFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/parks/${code}/permits`);
      if (!res.ok) throw new Error(`permits failed (${res.status})`);
      const json = await res.json();
      return Array.isArray(json?.data) ? json.data : [];
    },
    enabled: Boolean(code) && enabled,
    staleTime: AUX_STALE_MS,
    gcTime: AUX_GC_MS,
    refetchOnWindowFocus: false,
    ...ssrArrayOptions(initialPermits),
  });
}

export function useParkReviews(parkCode, enabled) {
  const code = parkCode ? String(parkCode).toLowerCase() : '';
  return useQuery({
    queryKey: parkReviewsQueryKey(code),
    queryFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/reviews/${code}`);
      if (!res.ok) throw new Error(`reviews failed (${res.status})`);
      const json = await res.json();
      const list = json.data || [];
      const count = json.stats?.totalReviews || json.total || json.pagination?.totalReviews || list.length;
      return { list, count, stats: json.stats };
    },
    enabled: Boolean(code) && enabled,
    staleTime: AUX_STALE_MS,
    gcTime: AUX_GC_MS,
    refetchOnWindowFocus: false,
  });
}
