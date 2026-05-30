import { useQuery } from '@tanstack/react-query';
import enhancedApi from '../services/enhancedApi';

export function useCampgroundDetails(parkCode, campgroundId, enabled = true) {
  return useQuery({
    queryKey: ['park-campgrounds', parkCode],
    queryFn: async () => {
      const result = await enhancedApi.get(`/parks/${parkCode}/campgrounds`, {}, {
        cacheType: 'parkDetails',
        ttl: 7 * 24 * 60 * 60 * 1000,
      });
      return result.data.data;
    },
    enabled: Boolean(enabled && parkCode),
    staleTime: 7 * 24 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    select: (campgrounds) =>
      campgrounds?.find((campground) => campground.id === campgroundId) ?? null,
  });
}
