'use client';

import { useQuery } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/apiBase';
import { DISCOVER_DETAIL_REVALIDATE_SEC } from '@/lib/discoverApi';

const DISCOVER_QUERY_VERSION = 'v2';

const CATALOG_STALE_MS = 60 * 60 * 1000;
const DETAIL_STALE_MS = DISCOVER_DETAIL_REVALIDATE_SEC * 1000;
const DETAIL_GC_MS = 60 * 60 * 1000;

export function useDiscoverCatalog({ initialData } = {}) {
  return useQuery({
    queryKey: ['discover', DISCOVER_QUERY_VERSION, 'catalog'],
    queryFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/discover/catalog`);
      if (!res.ok) throw new Error('Failed to load discover catalog');
      const json = await res.json();
      return json.data;
    },
    initialData,
    staleTime: CATALOG_STALE_MS,
    gcTime: CATALOG_STALE_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: false
  });
}

export function useDiscoverParksPage(dimension, slug, page, limit, nationalParksOnly) {
  return useQuery({
    queryKey: ['discover', DISCOVER_QUERY_VERSION, 'parks', dimension, slug, page, limit, nationalParksOnly],
    queryFn: async () => {
      const params = new URLSearchParams({
        dimension,
        slug,
        page: String(page),
        limit: String(limit)
      });
      if (nationalParksOnly) params.set('nationalParksOnly', 'true');
      const res = await fetch(`${getApiBaseUrl()}/discover/parks?${params}`);
      if (!res.ok) throw new Error('Failed to load parks');
      return res.json();
    },
    enabled: Boolean(dimension && slug),
    staleTime: DETAIL_STALE_MS,
    gcTime: DETAIL_GC_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev
  });
}

export function useDiscoverDetail(dimension, slug, { initialData } = {}) {
  return useQuery({
    queryKey: ['discover', DISCOVER_QUERY_VERSION, 'detail', dimension, slug],
    queryFn: async () => {
      const params = new URLSearchParams({ dimension, slug });
      const res = await fetch(`${getApiBaseUrl()}/discover/detail?${params}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to load discover detail');
      const json = await res.json();
      return json.data;
    },
    enabled: Boolean(dimension && slug),
    initialData,
    staleTime: DETAIL_STALE_MS,
    gcTime: DETAIL_GC_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false
  });
}
