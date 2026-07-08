import { useQuery } from '@tanstack/react-query';
import { getApi } from '@/src/lib/api';
import { CACHE_TTL, getCachedParkList, isStale, setCachedParkList } from '@/src/lib/offlineCache';
import { useNetworkStatus } from '@/src/components/OfflineBanner';

export type UseParksOptions = {
  page?: number;
  limit?: number;
  nationalParksOnly?: boolean;
  search?: string;
  state?: string;
};

export function useParks(options: UseParksOptions = {}) {
  const { page = 1, limit = 20, nationalParksOnly = true, search, state } = options;
  const { isConnected } = useNetworkStatus();
  const api = getApi();

  return useQuery({
    queryKey: ['parks', { page, limit, nationalParksOnly, search, state }],
    queryFn: async () => {
      if (search || state) {
        return api.parks.searchParks(search, state, limit);
      }

      if (!isConnected) {
        const cached = await getCachedParkList();
        if (cached) {
          return { parks: cached.data, count: cached.data.length, searchId: null };
        }
        throw new Error('Offline and no cached park list');
      }

      const result = await api.parks.getAllParks({ page, limit, nationalParksOnly });
      if (page === 1) {
        await setCachedParkList(result.data);
      }
      return { parks: result.data, count: result.total, searchId: null };
    },
    staleTime: CACHE_TTL.parkList,
    placeholderData: (prev) => prev,
  });
}
