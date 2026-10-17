'use strict';

/**
 * Phase 9C.1D.1 — drivingTimesContextService day-boundary hardening.
 *
 * `enrichItineraryDrivingTimes` used to carry `prevStop`/`prevCoords` across
 * the outer day loop, so the first stop of day 2 could be evaluated as if it
 * were adjacent to the last stop of day 1 — a day-identity mismatch, since
 * `hasAuthoritativeDrivingTransition(day, ...)` receives the NEW day while
 * `originStop` could be a stop that actually belongs to the PREVIOUS day.
 *
 * `resolveIntraDayOriginStop` is the single, structural fix: it only ever
 * looks backward within the stops of the day it is given, so a cross-day
 * "previous stop" can never be produced as a candidate at all — no reliance
 * on `hasAuthoritativeDrivingTransition`'s current always-false behavior.
 */

const { resolveIntraDayOriginStop, enrichItineraryDrivingTimes } = require('../drivingTimesContextService');

jest.mock('node-fetch');
const nodeFetch = require('node-fetch');

describe('resolveIntraDayOriginStop', () => {
  it('returns null for the first stop of a day — never a previous day\'s last stop', () => {
    const stops = [{ id: 's1', latitude: 44.4, longitude: -110.5 }];
    expect(resolveIntraDayOriginStop(stops, 0)).toBeNull();
  });

  it('returns the nearest earlier same-day stop that has coordinates', () => {
    const stops = [
      { id: 's1', latitude: 44.4, longitude: -110.5 },
      { id: 's2' }, // no coordinates — skipped
      { id: 's3', latitude: 44.5, longitude: -110.6 },
    ];
    expect(resolveIntraDayOriginStop(stops, 2)?.id).toBe('s1');
  });

  it('returns null when no earlier same-day stop has coordinates', () => {
    const stops = [{ id: 's1' }, { id: 's2', latitude: 44.5, longitude: -110.6 }];
    expect(resolveIntraDayOriginStop(stops, 1)).toBeNull();
  });
});

describe('enrichItineraryDrivingTimes never carries origin across a day boundary', () => {
  it('the first stop of day 2 is never assigned a drivingTimeFromPreviousMin sourced from day 1', async () => {
    const key = process.env.GMAPS_SERVER_KEY;
    process.env.GMAPS_SERVER_KEY = 'test-key';

    const data = {
      days: [
        { stops: [{ id: 'd1s1', name: 'Day 1 stop', latitude: 44.40, longitude: -110.50 }] },
        { stops: [{ id: 'd2s1', name: 'Day 2 stop', latitude: 44.41, longitude: -110.51 }] },
      ],
    };

    await enrichItineraryDrivingTimes(data, '[test]');
    expect(data.days[1].stops[0].drivingTimeFromPreviousMin).toBeNull();

    if (key) process.env.GMAPS_SERVER_KEY = key;
    else delete process.env.GMAPS_SERVER_KEY;
  });
});

// Phase 9C.1D.2 — a semantic `transfer` travelEdge means only "movement is
// intended here," not a verified transport mode. It must not, by itself,
// authorize a Distance Matrix dispatch.
describe('a semantic travelEdge alone never triggers a Distance Matrix dispatch', () => {
  it('produces zero fetch calls even with a valid same-day travelEdge present', async () => {
    const key = process.env.GMAPS_SERVER_KEY;
    process.env.GMAPS_SERVER_KEY = 'test-key';
    nodeFetch.mockClear();

    const data = {
      days: [{
        travelEdges: [{ sourceStopId: 's1', targetStopId: 's2', relationship: 'transfer' }],
        stops: [
          { id: 's1', name: 'Old Faithful', latitude: 44.46, longitude: -110.83 },
          { id: 's2', name: 'Grand Prismatic', latitude: 44.53, longitude: -110.84 },
        ],
      }],
    };

    await enrichItineraryDrivingTimes(data, '[test]');
    expect(nodeFetch).not.toHaveBeenCalled();
    expect(data.days[0].stops[1].drivingTimeFromPreviousMin).toBeNull();

    if (key) process.env.GMAPS_SERVER_KEY = key;
    else delete process.env.GMAPS_SERVER_KEY;
  });
});
