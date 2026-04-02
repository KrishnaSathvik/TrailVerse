import { useQuery, keepPreviousData } from '@tanstack/react-query';
import npsApi from '../services/npsApi';
import { get, set } from 'idb-keyval';

const ALL_PARKS_CACHE_VERSION = 'v3';
const getAllParksCacheKey = (includeActivities = false) =>
  `trailverse_all_parks_${ALL_PARKS_CACHE_VERSION}_${includeActivities ? 'with_activities' : 'basic'}`;
const getAllParksCacheTimeKey = (includeActivities = false) =>
  `trailverse_all_parks_time_${ALL_PARKS_CACHE_VERSION}_${includeActivities ? 'with_activities' : 'basic'}`;
const PARKS_QUERY_VERSION = 'v3';

// Hook for paginated parks (default behavior - fetches one page at a time)
export const useParks = (page = 1, limit = 12, nationalParksOnly = true, initialData = null) => {
  return useQuery({
    queryKey: ['parks', PARKS_QUERY_VERSION, page, limit, nationalParksOnly],
    queryFn: async () => {
      // Check IndexedDB before hitting the network for paginated queries
      // to achieve near-instant loads without redundant API calls.
      try {
        const idbCacheTime = await get(getAllParksCacheTimeKey(false));
        if (idbCacheTime && (Date.now() - parseInt(idbCacheTime)) < 1000 * 60 * 60 * 24) {
          const allParks = await get(getAllParksCacheKey(false));
          if (allParks?.data) {
            // Filter and paginate from the full dataset
            let parks = allParks.data;
            if (nationalParksOnly) {
              parks = parks.filter(p => p.designation?.toLowerCase().includes('national park'));
            }
            parks.sort((a, b) => a.fullName.localeCompare(b.fullName));
            const start = (page - 1) * limit;
            const paginatedParks = parks.slice(start, start + limit);
            return {
              data: paginatedParks,
              total: parks.length,
              page,
              pages: Math.ceil(parks.length / limit),
              hasMore: start + limit < parks.length
            };
          }
        }
      } catch (e) { /* ignore idb errors */ }

      return npsApi.getAllParks(page, limit, false, nationalParksOnly);
    },
    staleTime: 1000 * 60 * 60 * 24, // 24 hours - parks data rarely changes
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
    refetchOnWindowFocus: false, // Don't refetch when window gains focus
    refetchOnMount: false, // Don't refetch when component mounts if data is fresh
    retry: 2, // Retry failed requests only 2 times
    placeholderData: keepPreviousData, // Keep previous data while fetching new page (smooth UX)
    initialData,
  });
};


// Hook to fetch ALL parks (for filtering/searching on client side)
export const useAllParks = (initialData = null, includeActivities = false, enabled = true) => {
  return useQuery({
    queryKey: ['parks', PARKS_QUERY_VERSION, 'all', includeActivities],
    queryFn: async () => {
      const cacheKey = getAllParksCacheKey(includeActivities);
      const cacheTimeKey = getAllParksCacheTimeKey(includeActivities);
      try {
        // Try IndexedDB first for instant loads
        const idbCacheTime = await get(cacheTimeKey);
        if (idbCacheTime && (Date.now() - parseInt(idbCacheTime)) < 1000 * 60 * 60 * 24) {
          const cached = await get(cacheKey);
          if (cached) return cached;
        }
      } catch (e) {
        // ignore idb errors
      }

      try {
        const response = await npsApi.getAllParks(1, 1000, true, false, includeActivities);
        try {
          // Cache to IndexedDB for instant loads on refresh (avoids 5MB localStorage limit)
          await set(cacheKey, response);
          await set(cacheTimeKey, Date.now().toString());
        } catch (e) { console.warn('IndexedDB full or disabled'); }
        return response;
      } catch (error) {
        throw error;
      }
    },
    enabled,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours - parks data rarely changes
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 2,
    initialData,
  });
};

export const usePark = (parkCode) => {
  return useQuery({
    queryKey: ['park', parkCode],
    queryFn: () => npsApi.getParkByCode(parkCode),
    enabled: !!parkCode,
    staleTime: 1000 * 60 * 60 * 12, // 12 hours - park basic info rarely changes
    gcTime: 1000 * 60 * 60 * 24 * 3, // 3 days
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 2,
  });
};

export const useParkDetails = (parkCode) => {
  return useQuery({
    queryKey: ['parkDetails', parkCode],
    queryFn: () => npsApi.getParkDetails(parkCode),
    enabled: !!parkCode,
    staleTime: 1000 * 60 * 10, // 10 minutes — park details include dynamic NPS data
    gcTime: 1000 * 60 * 60, // 1 hour
    refetchOnWindowFocus: false,
    refetchOnMount: true, // Refetch on mount to pick up new data
    retry: 2,
  });
};
