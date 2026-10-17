import type { ApiClient } from './client';
import type { PaginatedParks, ParkSearchResult, ParkSummary } from './types';

export const ALL_PARKS_LITE_FIELDS_MAP =
  'parkCode,fullName,states,designation,latitude,longitude,images';

export const ALL_PARKS_LITE_FIELDS_PLAN_AI =
  'parkCode,fullName,states,designation,latitude,longitude';

export type GetAllParksOptions = {
  page?: number;
  limit?: number;
  fetchAll?: boolean;
  nationalParksOnly?: boolean;
  includeActivities?: boolean;
};

export function createParksApi(client: ApiClient) {
  return {
    getAllParks(options: GetAllParksOptions = {}) {
      const {
        page = 1,
        limit = 12,
        fetchAll = false,
        nationalParksOnly = true,
        includeActivities = false,
      } = options;

      const params: Record<string, string | number | boolean> = {};
      if (fetchAll) {
        params.all = 'true';
        if (includeActivities) params.includeActivities = 'true';
      } else {
        params.page = page;
        params.limit = limit;
      }
      if (nationalParksOnly) params.nationalParksOnly = 'true';

      return client.get<PaginatedParks>('/parks', { params });
    },

    getAllParksLite({ includeImages = true }: { includeImages?: boolean } = {}) {
      const fields = includeImages ? ALL_PARKS_LITE_FIELDS_MAP : ALL_PARKS_LITE_FIELDS_PLAN_AI;
      return client.get<PaginatedParks>('/parks', {
        params: { all: 'true', fields },
      });
    },

    getParkByCode(parkCode: string) {
      return client.get<ParkSummary>(`/parks/${parkCode}`);
    },

    getParkDetails(parkCode: string) {
      return client.get<Record<string, unknown>>(`/parks/${parkCode}/details`);
    },

    getParkAlerts(parkCode: string) {
      return client.get<unknown[]>(`/parks/${parkCode}/alerts`);
    },

    getParkWeather(parkCode: string) {
      return client.get<unknown>(`/parks/${parkCode}/weather`);
    },

    getParkPermits(parkCode: string) {
      return client.get<unknown>(`/parks/${parkCode}/permits`);
    },

    getParkActivities(parkCode: string) {
      return client.get<unknown>(`/parks/${parkCode}/activities`);
    },

    getParkPlaces(parkCode: string) {
      return client.get<unknown>(`/parks/${parkCode}/places`);
    },

    getParkCampgrounds(parkCode: string) {
      return client.get<unknown>(`/parks/${parkCode}/campgrounds`);
    },

    getParkReviews(parkCode: string) {
      return client.get<unknown>(`/parks/${parkCode}/reviews`);
    },

    getEnhancedParkData(parkCode: string) {
      return client.get<unknown>(`/parks/${parkCode}/enhanced`);
    },

    getMapPlaces() {
      return client.get<{ data: unknown[]; count?: number }>('/parks/map/places');
    },

    getMapCampgrounds() {
      return client.get<{ data: unknown[]; count?: number }>('/parks/map/campgrounds');
    },

    async searchParks(query?: string, state?: string, limit = 24) {
      const params: Record<string, string | number> = {};
      if (query) params.q = query;
      if (state) params.state = state;
      if (limit) params.limit = limit;

      const body = await client.get<
        ParkSummary[] | { data?: ParkSummary[]; count?: number; searchId?: string }
      >('/parks/search', { params });

      if (Array.isArray(body)) {
        return { parks: body, count: body.length, searchId: null } satisfies ParkSearchResult;
      }

      return {
        parks: body?.data || [],
        count: body?.count ?? body?.data?.length ?? 0,
        searchId: body?.searchId ?? null,
      } satisfies ParkSearchResult;
    },

    async fetchParksByCodes(codes: string[]) {
      const normalized = [...new Set(codes.map((c) => c.trim().toLowerCase()).filter(Boolean))];
      const fetched = await Promise.all(
        normalized.map(async (code) => {
          try {
            return await client.get<ParkSummary>(`/parks/${code}`);
          } catch {
            return null;
          }
        }),
      );
      const byCode = new Map(
        fetched.filter(Boolean).map((park) => [park!.parkCode?.toLowerCase(), park]),
      );
      return normalized.map((code) => byCode.get(code)).filter(Boolean) as ParkSummary[];
    },
  };
}

export type ParksApi = ReturnType<typeof createParksApi>;
