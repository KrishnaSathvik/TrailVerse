import { describe, expect, it, vi } from 'vitest';
import { fetchParkExploreIndex, parkExploreIndexQueryKey } from '../useParkExploreIndex';
import {
  fetchParkTab,
  parkTabQueryKey,
} from '../useParkTabData';
import { CLIENT_CACHE_VERSION } from '@/lib/clientCacheVersion';
import { TAB_ID_TO_ENDPOINT } from '@/lib/parkTabEndpoints';

describe('parkExploreIndexQueryKey', () => {
  it('keys index cache by park code', () => {
    expect(parkExploreIndexQueryKey('yell')).toEqual(['parkExploreIndex', CLIENT_CACHE_VERSION, 'yell']);
  });
});

describe('fetchParkExploreIndex', () => {
  it('loads explore-index payload', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: { activities: 2, places: 0, transit: { hasGtfs: false, feeds: 0 } },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const index = await fetchParkExploreIndex('yell', 'https://api.test');

    expect(index?.activities).toBe(2);
    expect(fetchMock).toHaveBeenCalledWith('https://api.test/parks/yell/explore-index');

    vi.unstubAllGlobals();
  });
});

describe('fetchParkTab', () => {
  it('loads a single tab endpoint', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ id: 'a1' }] }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const data = await fetchParkTab('yell', 'activities', 'https://api.test');

    expect(data).toEqual([{ id: 'a1' }]);
    expect(fetchMock).toHaveBeenCalledWith('https://api.test/parks/yell/activities');

    vi.unstubAllGlobals();
  });

  it('maps camping tab to campgrounds endpoint', () => {
    expect(TAB_ID_TO_ENDPOINT.camping).toBe('campgrounds');
    expect(parkTabQueryKey('yell', 'camping')).toEqual(['parkTab', CLIENT_CACHE_VERSION, 'yell', 'camping']);
  });
});
