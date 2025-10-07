import { useQuery } from '@tanstack/react-query';
import npsApi from '../services/npsApi';

export const useParks = () => {
  return useQuery({
    queryKey: ['parks'],
    queryFn: () => npsApi.getAllParks(),
    staleTime: 1000 * 60 * 60 * 24, // 24 hours - parks data rarely changes
    cacheTime: 1000 * 60 * 60 * 24 * 7, // 7 days - keep in cache for a week
    refetchOnWindowFocus: false, // Don't refetch when window gains focus
    refetchOnMount: false, // Don't refetch when component mounts if data is fresh
    retry: 2, // Retry failed requests only 2 times
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
