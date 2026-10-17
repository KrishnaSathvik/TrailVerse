'use strict';

/**
 * WP-TU Phase 4 Task 10 — candidate-plan discovery is pure DATA RETRIEVAL,
 * bounded to the exact shape `resolveTargetTripId` (Task 9) already expects.
 * Model mocked (no Mongo binary), matching this repo's own controller-test
 * convention (see tripController.test.js).
 */

jest.mock('../../models/TripPlan');
const TripPlan = require('../../models/TripPlan');
const { fetchCandidatePlans } = require('../candidatePlanDiscovery');

function mockFind(docs) {
  const lean = jest.fn().mockResolvedValue(docs);
  const limit = jest.fn().mockReturnValue({ lean });
  const select = jest.fn().mockReturnValue({ limit });
  TripPlan.find = jest.fn().mockReturnValue({ select });
  return { select, limit, lean };
}

describe('fetchCandidatePlans', () => {
  test('returns [] with no userId — never queries', async () => {
    TripPlan.find = jest.fn();
    const result = await fetchCandidatePlans({ userId: null });
    expect(result).toEqual([]);
    expect(TripPlan.find).not.toHaveBeenCalled();
  });

  test('maps docs into the exact bounded candidatePlans shape', async () => {
    const docId = '507f1f77bcf86cd799439011';
    mockFind([{
      _id: docId,
      title: 'Redwood Trip',
      parkCode: 'redw',
      parkName: 'Redwood National Park',
      formData: { startDate: '2026-05-01', endDate: '2026-05-05', groupSize: 2 },
      planningState: { destination: { parkCode: 'redw', parkName: 'Redwood National Park', region: 'west' } },
      status: 'active',
    }]);

    const result = await fetchCandidatePlans({ userId: 'user-1' });
    expect(result).toEqual([{
      id: docId,
      title: 'Redwood Trip',
      parkCode: 'redw',
      parkName: 'Redwood National Park',
      formData: { startDate: '2026-05-01', endDate: '2026-05-05' },
      planningState: { destination: { parkCode: 'redw', parkName: 'Redwood National Park' } },
      status: 'active',
    }]);
    // Bounded metadata ONLY — no plan content, no formData.groupSize leak,
    // no planningState.destination.region leak.
    expect(result[0]).not.toHaveProperty('plan');
    expect(result[0].formData).not.toHaveProperty('groupSize');
    expect(result[0].planningState.destination).not.toHaveProperty('region');
  });

  test('excludes the currently active trip and scopes to active status', async () => {
    const { select } = mockFind([]);
    await fetchCandidatePlans({ userId: 'user-1', excludeTripId: 'trip-badl-1' });
    expect(TripPlan.find).toHaveBeenCalledWith({
      userId: 'user-1',
      status: 'active',
      _id: { $ne: 'trip-badl-1' },
    });
    expect(select).toHaveBeenCalledWith('title parkCode parkName formData planningState status');
  });

  test('never throws — a query failure resolves to an empty list', async () => {
    TripPlan.find = jest.fn(() => { throw new Error('boom'); });
    const result = await fetchCandidatePlans({ userId: 'user-1' });
    expect(result).toEqual([]);
  });
});
