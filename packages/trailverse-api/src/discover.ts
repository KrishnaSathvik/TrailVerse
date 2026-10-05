import type { ApiClient } from './client';

export function createDiscoverApi(client: ApiClient) {
  return {
    getCatalog() {
      return client.get<unknown>('/discover/catalog');
    },

    getDetail(dimension: string, slug: string) {
      return client.get<unknown>('/discover/detail', {
        params: { dimension, slug },
      });
    },

    getParksPage(
      dimension: string,
      slug: string,
      page = 1,
      limit = 12,
      { nationalParksOnly = false }: { nationalParksOnly?: boolean } = {},
    ) {
      const params: Record<string, string | number | boolean> = {
        dimension,
        slug,
        page,
        limit,
      };
      if (nationalParksOnly) params.nationalParksOnly = true;
      return client.get<unknown>('/discover/parks', { params });
    },

    getNpsGuide(title: string, slug = '') {
      return client.get<unknown>('/discover/nps-guide', { params: { title, slug } });
    },
  };
}

export type DiscoverApi = ReturnType<typeof createDiscoverApi>;
