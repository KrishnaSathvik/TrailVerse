import { useQuery } from '@tanstack/react-query';
import { getApi } from '@/src/lib/api';

export function useMapParks() {
  const api = getApi();

  return useQuery({
    queryKey: ['map-parks-lite'],
    queryFn: async () => {
      const result = await api.parks.getAllParksLite({ includeImages: false });
      return result.data;
    },
    staleTime: 24 * 60 * 60 * 1000,
  });
}
