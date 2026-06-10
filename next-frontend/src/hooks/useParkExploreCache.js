'use client';

import { useEffect, useState } from 'react';
import { getApiBaseUrl } from '@/lib/apiBase';

const EXPLORE_ENDPOINTS = [
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

/**
 * Eagerly load all explore-tab payloads once so we can hide empty tabs.
 */
export function useParkExploreCache(parkCode) {
  const [cache, setCache] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!parkCode) {
      setCache(null);
      setReady(false);
      return undefined;
    }

    let cancelled = false;
    setReady(false);
    setCache(null);

    const apiUrl = getApiBaseUrl();

    Promise.allSettled(
      EXPLORE_ENDPOINTS.map(([, endpoint]) =>
        fetch(`${apiUrl}/parks/${parkCode}/${endpoint}`)
          .then((res) => res.json())
          .then((json) => json?.data ?? null)
      )
    ).then((results) => {
      if (cancelled) return;
      const next = {};
      EXPLORE_ENDPOINTS.forEach(([key], index) => {
        const result = results[index];
        next[key] = result.status === 'fulfilled' ? result.value : null;
      });
      setCache(next);
      setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [parkCode]);

  return { cache, ready, loading: !ready };
}
