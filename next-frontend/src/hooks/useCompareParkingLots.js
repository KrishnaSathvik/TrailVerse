import { useQueries } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/apiBase';

async function fetchParkingLots(parkCode) {
  const response = await fetch(`${getApiBaseUrl()}/parks/${parkCode}/parkinglots`);
  if (!response.ok) return [];
  const json = await response.json();
  return Array.isArray(json?.data) ? json.data : [];
}

/** NPS parking lot lists for parks in an active comparison (max 4). */
export function useCompareParkingLots(parkCodes, enabled = true) {
  const codes = Array.isArray(parkCodes) ? parkCodes.filter(Boolean) : [];

  const queries = useQueries({
    queries: codes.map((parkCode) => ({
      queryKey: ['compareParkingLots', parkCode],
      queryFn: () => fetchParkingLots(parkCode),
      enabled: enabled && codes.length >= 2,
      staleTime: 10 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
    })),
  });

  const parkingByCode = {};
  codes.forEach((code, index) => {
    parkingByCode[code] = queries[index]?.data ?? null;
  });

  const isLoading = queries.some((query) => query.isLoading);
  const isFetching = queries.some((query) => query.isFetching);

  return { parkingByCode, isLoading, isFetching };
}
