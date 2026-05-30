import { useQuery } from '@tanstack/react-query';
import enhancedApi from '../services/enhancedApi';

export function usePlaceDetails(parkCode, placeId, enabled = true) {
  return useQuery({
    queryKey: ['park-places', parkCode],
    queryFn: async () => {
      const result = await enhancedApi.get(`/parks/${parkCode}/places`, {}, {
        cacheType: 'parkDetails',
        ttl: 7 * 24 * 60 * 60 * 1000,
      });
      return result.data.data;
    },
    enabled: Boolean(enabled && parkCode),
    staleTime: 7 * 24 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    select: (places) => places?.find((place) => place.id === placeId) ?? null,
  });
}
