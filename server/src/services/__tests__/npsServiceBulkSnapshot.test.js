process.env.NPS_API_KEY = process.env.NPS_API_KEY || 'test-nps-key-for-unit-tests';

const npsService = require('../npsService');

describe('npsService bulk snapshot helpers', () => {
  it('reads grouped bulk data by park code', () => {
    const slice = npsService._getGroupedBulkSlice(
      { yell: [{ id: 1 }, { id: 2 }], yose: [{ id: 3 }] },
      'yell'
    );
    expect(slice).toHaveLength(2);
  });

  it('filters flat bulk activities by park code', () => {
    const slice = npsService._getGroupedBulkSlice(
      [
        { id: 1, parkCode: 'yell' },
        { id: 2, parkCode: 'yose' },
        { id: 3, parkCode: 'yell' },
      ],
      'yell'
    );
    expect(slice).toHaveLength(2);
  });

  it('matches grouped bulk data regardless of input case', () => {
    const slice = npsService._getGroupedBulkSlice({ yell: [{ id: 1 }] }, 'YELL');
    expect(slice).toHaveLength(1);
  });

  it('hydrates bulk memory from snapshot data', () => {
    npsService.placesCache.data = null;
    npsService.placesCache.timestamp = 0;
    npsService._hydrateBulkMemoryCache('bulk-places', { yell: [{ id: 1 }] });
    expect(npsService.placesCache.data.yell).toHaveLength(1);
  });

  it('returns bulk slice without NPS when rate-limited', async () => {
    const originalLoad = npsService._loadSnapshot.bind(npsService);
    npsService._loadSnapshot = jest.fn(async () => ({
      data: { yell: [{ id: 'place-1' }] },
    }));
    npsService._markRateLimited();
    npsService.endpointCache.flushAll();
    npsService.placesCache.data = null;

    const places = await npsService.getParkPlaces('yell');
    expect(places).toHaveLength(1);
    expect(places[0].id).toBe('place-1');

    npsService._loadSnapshot = originalLoad;
    npsService._rateLimitedUntil = 0;
  });
});
