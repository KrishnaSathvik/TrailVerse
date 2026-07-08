import { useQuery } from '@tanstack/react-query';
import { getApi } from '@/src/lib/api';
import { useNetworkStatus } from '@/src/components/OfflineBanner';

export function useCompareParks(parkCodes: string[]) {
  const { isConnected } = useNetworkStatus();
  const normalized = [...new Set(parkCodes.map((c) => c.trim().toLowerCase()).filter(Boolean))];
  const api = getApi();

  return useQuery({
    queryKey: ['compare', normalized.sort().join(',')],
    enabled: normalized.length >= 2 && isConnected,
    queryFn: async () => {
      const [comparison, summary] = await Promise.all([
        api.compare.getParkComparison(normalized),
        api.compare.getParkComparisonSummary(normalized),
      ]);
      return { comparison, summary, parkCodes: normalized };
    },
  });
}
