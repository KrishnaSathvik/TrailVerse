import { useQuery } from '@tanstack/react-query';
import npsApi from '../services/npsApi';

// Hook for paginated parks (default behavior - fetches one page at a time)
export const useParks = (page = 1, limit = 12, nationalParksOnly = true) => {
  return useQuery({
    queryKey: ['parks', page, limit, nationalParksOnly],
    queryFn: () => npsApi.getAllParks(page, limit, false, nationalParksOnly),
    staleTime: 1000 * 60 * 60 * 24, // 24 hours - parks data rarely changes
    cacheTime: 1000 * 60 * 60 * 24 * 7, // 7 days - keep in cache for a week
    refetchOnWindowFocus: false, // Don't refetch when window gains focus
    refetchOnMount: false, // Don't refetch when component mounts if data is fresh
    retry: 2, // Retry failed requests only 2 times
    keepPreviousData: true, // Keep previous data while fetching new page (smooth UX)
  });
};

// Hook to fetch ALL parks (for filtering/searching on client side)
export const useAllParks = () => {
  return useQuery({
    queryKey: ['parks', 'all'],
    queryFn: () => npsApi.getAllParks(1, 1000, true, false), // fetchAll=true, nationalParksOnly=false to get ALL 474 parks
    staleTime: 1000 * 60 * 60 * 24, // 24 hours - parks data rarely changes
    cacheTime: 1000 * 60 * 60 * 24 * 7, // 7 days - keep in cache for a week
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
    cacheTime: 1000 * 60 * 60 * 24 * 3, // 3 days
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
    cacheTime: 1000 * 60 * 60 * 24 * 2, // 2 days
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 2,
  });
};
