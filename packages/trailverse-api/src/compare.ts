import type { ApiClient } from './client';

export function createCompareApi(client: ApiClient) {
  return {
    getParkComparison(parkCodes: string[]) {
      return client.post<unknown>('/parks/compare', { parkCodes });
    },

    getParkComparisonSummary(parkCodes: string[]) {
      return client.post<unknown>('/parks/compare/summary', { parkCodes });
    },
  };
}

export type CompareApi = ReturnType<typeof createCompareApi>;
