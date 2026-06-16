import { describe, expect, it, vi } from 'vitest';
import {
  fetchParkExploreBundle,
  parkExploreQueryKey,
  PARK_EXPLORE_ENDPOINTS,
} from '../useParkExploreCache';

describe('parkExploreQueryKey', () => {
  it('keys cache by park code', () => {
    expect(parkExploreQueryKey('yell')).toEqual(['parkExploreCache', 'yell']);
  });
});

describe('fetchParkExploreBundle', () => {
  it('merges parallel endpoint results and tolerates failures', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url.endsWith('/activities')) {
        return { json: async () => ({ data: [{ id: 'a1' }] }) };
      }
      if (url.endsWith('/places')) {
        return { json: async () => { throw new Error('fail'); } };
      }
      return { json: async () => ({ data: [] }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const bundle = await fetchParkExploreBundle('yell', 'https://api.test');

    expect(bundle.activities).toEqual([{ id: 'a1' }]);
    expect(bundle.places).toBeNull();
    expect(bundle.tours).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(PARK_EXPLORE_ENDPOINTS.length);

    vi.unstubAllGlobals();
  });
});
