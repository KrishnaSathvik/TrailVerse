/**
 * Bulk/snapshot internals of NPSService.
 *
 * These tests exercise the REAL bulk + snapshot implementation, so they build a
 * private instance via the exported class rather than reaching for the shared
 * accessor. Two consequences that matter:
 *
 *   - Nothing here mutates an exported singleton, so no test can leak state
 *     into another file (the previous version assigned onto the module export
 *     and relied on afterEach to put it back).
 *   - The key is passed explicitly, so the suite needs no NPS_API_KEY in the
 *     environment and makes no live NPS call. Only the two network-boundary
 *     seams (_loadSnapshot / _fetchGroupedBulkFromNps) are stubbed.
 */

const NpsSnapshot = require('../../models/NpsSnapshot');
const { NPSService } = require('../npsService');

describe('npsService bulk snapshot helpers', () => {
  let svc;

  beforeEach(() => {
    // A fresh instance per test: caches, in-flight map and refresh chain all
    // start clean without any manual reset bookkeeping.
    svc = new NPSService({ apiKey: 'test-nps-key-not-used-for-network' });
  });

  it('reads grouped bulk data by park code', () => {
    const slice = svc._getGroupedBulkSlice(
      { yell: [{ id: 1 }, { id: 2 }], yose: [{ id: 3 }] },
      'yell'
    );
    expect(slice).toHaveLength(2);
  });

  it('filters flat bulk activities by park code', () => {
    const slice = svc._getGroupedBulkSlice(
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
    const slice = svc._getGroupedBulkSlice({ yell: [{ id: 1 }] }, 'YELL');
    expect(slice).toHaveLength(1);
  });

  it('hydrates bulk memory from snapshot data', () => {
    svc.placesCache.data = null;
    svc.placesCache.timestamp = 0;
    svc._hydrateBulkMemoryCache('bulk-places', { yell: [{ id: 1 }] });
    expect(svc.placesCache.data.yell).toHaveLength(1);
  });

  it('returns bulk slice without NPS when rate-limited', async () => {
    svc._loadSnapshot = jest.fn(async () => ({
      data: { yell: [{ id: 'place-1' }] },
    }));
    svc._markRateLimited();
    svc.endpointCache.flushAll();
    svc.placesCache.data = null;

    const places = await svc.getParkPlaces('yell');
    expect(places).toHaveLength(1);
    expect(places[0].id).toBe('place-1');
  });

  it('dedupes concurrent bulk in-flight fetches', async () => {
    let calls = 0;
    svc._fetchGroupedBulkFromNps = jest.fn(async (opts) => {
      calls += 1;
      svc._hydrateBulkMemoryCacheRef(opts.memoryCache, { yell: [{ id: 1 }] });
      return opts.memoryCache.data;
    });
    svc._loadSnapshot = jest.fn(async () => ({ data: null, stale: true }));
    svc.placesCache.data = null;
    svc.placesCache.timestamp = 0;

    const [a, b] = await Promise.all([
      svc.getAllPlaces(),
      svc.getAllPlaces(),
    ]);

    expect(a).toEqual({ yell: [{ id: 1 }] });
    expect(b).toEqual(a);
    expect(svc._fetchGroupedBulkFromNps).toHaveBeenCalledTimes(1);
    expect(calls).toBe(1);
  });

  it('serializes bulk NPS refreshes', async () => {
    const order = [];
    svc._loadSnapshot = jest.fn(async () => ({ data: null, stale: true }));
    svc.placesCache.data = null;
    svc.placesCache.timestamp = 0;
    svc.campgroundsCache.data = null;
    svc.campgroundsCache.timestamp = 0;

    svc._fetchGroupedBulkFromNps = jest.fn(async (opts) => {
      order.push(`start-${opts.key}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
      svc._hydrateBulkMemoryCacheRef(opts.memoryCache, { yell: [{ id: opts.key }] });
      order.push(`end-${opts.key}`);
      return opts.memoryCache.data;
    });

    await Promise.all([
      svc.getAllPlaces(),
      svc.getAllCampgrounds(),
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

    await svc._saveSnapshot('bulk-places', byPark);

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

describe('WP5A shadow-only NPS evidence seam', () => {
  test('returns explicit observation/completeness without writing legacy endpoint caches', async () => {
    const service = new NPSService({ apiKey: 'test-only-key' });
    service.api.get = jest.fn().mockResolvedValue({
      data: { data: [{ id: 'alert-1', title: 'Closure' }], total: '1' },
    });
    const result = await service.getParkAlertsEvidence('yose', { signal: new AbortController().signal });
    expect(result).toMatchObject({ data: [{ id: 'alert-1', title: 'Closure' }], isComplete: true });
    expect(new Date(result.observedAt).toString()).not.toBe('Invalid Date');
    expect(service.endpointCache.get('alerts_yose')).toBeUndefined();
  });
});
