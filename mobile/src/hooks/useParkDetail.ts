import { useQuery } from '@tanstack/react-query';
import { resolveParkIdentifier } from '@trailverse/api';
import { getApi } from '@/src/lib/api';
import {
  CACHE_TTL,
  getCachedParkDetail,
  isStale,
  setCachedParkDetail,
} from '@/src/lib/offlineCache';
import { useNetworkStatus } from '@/src/components/OfflineBanner';

export function useParkDetail(identifier: string | undefined) {
  const { isConnected } = useNetworkStatus();
  const resolved = identifier ? resolveParkIdentifier(identifier) : { parkCode: null, slug: null };
  const parkCode = resolved.parkCode;
  const api = getApi();

  return useQuery({
    queryKey: ['park-detail', parkCode],
    enabled: !!parkCode,
    queryFn: async () => {
      if (!parkCode) throw new Error('Invalid park identifier');

      if (!isConnected) {
        const cached = await getCachedParkDetail(parkCode);
        if (cached) {
          return {
            ...(cached.data as Record<string, unknown>),
            _cachedAt: cached.fetchedAt,
            _offline: true,
          };
        }
        throw new Error('Offline and no cached park detail');
      }

      const data = await api.parks.getParkDetails(parkCode);
      await setCachedParkDetail(parkCode, data);
      return { ...(data as Record<string, unknown>), _cachedAt: Date.now(), _offline: false };
    },
    staleTime: CACHE_TTL.parkDetail,
  });
}

export function useParkTabData(
  parkCode: string | undefined,
  tab: string,
  enabled: boolean,
) {
  const api = getApi();

  return useQuery({
    queryKey: ['park-tab', parkCode, tab],
    enabled: !!parkCode && enabled,
    queryFn: async () => {
      if (!parkCode) throw new Error('Missing park code');
      switch (tab) {
        case 'alerts':
          return api.parks.getParkAlerts(parkCode);
        case 'weather':
          return api.parks.getParkWeather(parkCode);
        case 'permits':
          return api.parks.getParkPermits(parkCode);
        case 'activities':
          return api.parks.getParkActivities(parkCode);
        case 'places':
          return api.parks.getParkPlaces(parkCode);
        case 'camping':
          return api.parks.getParkCampgrounds(parkCode);
        case 'reviews':
          return api.parks.getParkReviews(parkCode);
        default:
          return null;
      }
    },
    staleTime: tab === 'alerts' ? CACHE_TTL.alerts : CACHE_TTL.weather,
  });
}

export function isParkDataStale(cachedAt?: number, tab = 'overview') {
  if (!cachedAt) return false;
  const ttl = tab === 'alerts' ? CACHE_TTL.alerts : CACHE_TTL.weather;
  return isStale(cachedAt, ttl);
}
