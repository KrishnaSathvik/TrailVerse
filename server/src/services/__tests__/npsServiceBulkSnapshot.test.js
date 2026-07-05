process.env.NPS_API_KEY = process.env.NPS_API_KEY || 'test-nps-key-for-unit-tests';

const NpsSnapshot = require('../../models/NpsSnapshot');
const npsService = require('../npsService');

describe('npsService bulk snapshot helpers', () => {
  afterEach(() => {
    npsService._bulkInFlight.clear();
    npsService._bulkRefreshChain = Promise.resolve();
    npsService._rateLimitedUntil = 0;
  });

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

  it('dedupes concurrent bulk in-flight fetches', async () => {
    let calls = 0;
    const original = npsService._fetchGroupedBulkFromNps.bind(npsService);
    npsService._fetchGroupedBulkFromNps = jest.fn(async (opts) => {
      calls += 1;
      npsService._hydrateBulkMemoryCacheRef(opts.memoryCache, { yell: [{ id: 1 }] });
      return opts.memoryCache.data;
    });
    npsService._loadSnapshot = jest.fn(async () => ({ data: null, stale: true }));
    npsService.placesCache.data = null;
    npsService.placesCache.timestamp = 0;

    const [a, b] = await Promise.all([
      npsService.getAllPlaces(),
      npsService.getAllPlaces(),
    ]);

    expect(a).toEqual({ yell: [{ id: 1 }] });
    expect(b).toEqual(a);
    expect(npsService._fetchGroupedBulkFromNps).toHaveBeenCalledTimes(1);
    expect(calls).toBe(1);

    npsService._fetchGroupedBulkFromNps = original;
  });

  it('serializes bulk NPS refreshes', async () => {
    const order = [];
    npsService._loadSnapshot = jest.fn(async () => ({ data: null, stale: true }));
    npsService.placesCache.data = null;
    npsService.placesCache.timestamp = 0;
    npsService.campgroundsCache.data = null;
    npsService.campgroundsCache.timestamp = 0;

    npsService._fetchGroupedBulkFromNps = jest.fn(async (opts) => {
      order.push(`start-${opts.key}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
      npsService._hydrateBulkMemoryCacheRef(opts.memoryCache, { yell: [{ id: opts.key }] });
      order.push(`end-${opts.key}`);
      return opts.memoryCache.data;
    });

    await Promise.all([
      npsService.getAllPlaces(),
      npsService.getAllCampgrounds(),
    ]);

    expect(order.indexOf('start-bulk-places')).toBeLessThan(order.indexOf('end-bulk-places'));
    expect(order.indexOf('end-bulk-places')).toBeLessThan(order.indexOf('start-bulk-campgrounds'));
    expect(order.indexOf('start-bulk-campgrounds')).toBeLessThan(order.indexOf('end-bulk-campgrounds'));
  });

  it('saves large grouped snapshots in chunks', async () => {
    const updateOne = jest.spyOn(NpsSnapshot, 'updateOne').mockResolvedValue({});
    const byPark = {};
    for (let i = 0; i < 45; i++) {
      byPark[`park${i}`] = [{ id: i }];
    }

    await npsService._saveSnapshot('bulk-places', byPark);

    expect(updateOne).toHaveBeenCalled();
    const firstCall = updateOne.mock.calls[0][1];
    expect(firstCall.$set.data).toEqual({});

    const dottedCalls = updateOne.mock.calls.filter(
      (call) => call[1]?.$set && Object.keys(call[1].$set).some((key) => key.startsWith('data.park'))
    );
    expect(dottedCalls.length).toBeGreaterThan(1);

    updateOne.mockRestore();
  });
});
