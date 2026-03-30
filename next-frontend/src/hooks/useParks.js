import { useQuery, keepPreviousData } from '@tanstack/react-query';
import npsApi from '../services/npsApi';
import { get, set } from 'idb-keyval';

// Hook for paginated parks (default behavior - fetches one page at a time)
export const useParks = (page = 1, limit = 12, nationalParksOnly = true) => {
  return useQuery({
    queryKey: ['parks', page, limit, nationalParksOnly],
    queryFn: async () => {
      // Check IndexedDB before hitting the network for paginated queries
      // to achieve near-instant loads without redundant API calls.
      try {
        const idbCacheTime = await get('trailverse_all_parks_time');
        if (idbCacheTime && (Date.now() - parseInt(idbCacheTime)) < 1000 * 60 * 60 * 24 * 7) {
          const allParks = await get('trailverse_all_parks');
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
    gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days - keep in cache for a week
    refetchOnWindowFocus: false, // Don't refetch when window gains focus
    refetchOnMount: false, // Don't refetch when component mounts if data is fresh
    retry: 2, // Retry failed requests only 2 times
    placeholderData: keepPreviousData, // Keep previous data while fetching new page (smooth UX)
  });
};


// Hook to fetch ALL parks (for filtering/searching on client side)
export const useAllParks = () => {
  return useQuery({
    queryKey: ['parks', 'all'],
    queryFn: async () => {
      try {
        // Try IndexedDB first for instant loads
        const idbCacheTime = await get('trailverse_all_parks_time');
        if (idbCacheTime && (Date.now() - parseInt(idbCacheTime)) < 1000 * 60 * 60 * 24 * 7) {
          const cached = await get('trailverse_all_parks');
          if (cached) return cached;
        }
      } catch (e) {
        // ignore idb errors
      }

      try {
        const response = await npsApi.getAllParks(1, 1000, true, false); // fetchAll=true, nationalParksOnly=false to get ALL 474 parks
        try {
          // Cache to IndexedDB for instant loads on refresh (avoids 5MB localStorage limit)
          await set('trailverse_all_parks', response);
          await set('trailverse_all_parks_time', Date.now().toString());
        } catch (e) { console.warn('IndexedDB full or disabled'); }
        return response;
      } catch (error) {
        throw error;
      }
    },
    staleTime: 1000 * 60 * 60 * 24, // 24 hours - parks data rarely changes
    gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days - keep in cache for a week
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 2,
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
    staleTime: 1000 * 60 * 60 * 6, // 6 hours - park details change less frequently
    gcTime: 1000 * 60 * 60 * 24 * 2, // 2 days
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 2,
  });
};
