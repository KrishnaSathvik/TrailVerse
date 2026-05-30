import { useQuery } from '@tanstack/react-query';
import npsApi from '../services/npsApi';

const MAP_PLACES_VERSION = 'v2';

export function useMapPlaces(enabled = true) {
  return useQuery({
    queryKey: ['map-places', MAP_PLACES_VERSION],
    queryFn: () => npsApi.getMapPlaces(),
    enabled,
    staleTime: 7 * 24 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 2,
  });
}
