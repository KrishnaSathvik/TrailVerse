'use strict';

const {
  stampPlanDerived,
  isPlanDerivedCurrent,
  clearDerivedDriveStateOnDays,
  bindDerivedSurfaces,
} = require('../planDerivedState');
const { applyPlanPatch } = require('../itineraryPlanPatch');

describe('plan derived state', () => {
  test('a stamped artifact is current only for its plan hash', () => {
    const logistics = stampPlanDerived({ schemaVersion: 'travel-logistics-v1' }, 'hash-18');
    expect(logistics.planHash).toBe('hash-18');
    expect(isPlanDerivedCurrent(logistics, 'hash-18')).toBe(true);
    expect(isPlanDerivedCurrent(logistics, 'hash-17')).toBe(false);
    expect(isPlanDerivedCurrent(null, 'hash-18')).toBe(true);
  });

  test('rewrite of day 2 clears that day’s drive minutes and leaves day 1 alone', () => {
    const prior = {
      days: [
        {
          dayNumber: 1,
          stops: [
            { id: 'a', name: 'Springdale', drivingTimeFromPreviousMin: null },
            { id: 'b', name: 'Watchman', drivingTimeFromPreviousMin: 12 },
          ],
          totalDriveMinutes: 12,
        },
        {
          dayNumber: 2,
          stops: [
            { id: 'c', name: 'Angels Landing', drivingTimeFromPreviousMin: null },
            { id: 'd', name: 'Observation Point', drivingTimeFromPreviousMin: 45 },
          ],
          totalDriveMinutes: 45,
        },
      ],
    };
    const applied = applyPlanPatch({
      priorPlan: prior,
      planPatch: {
        response: 'I rebuilt Day 2.',
        operations: [{
          op: 'update_day',
          dayNumber: 2,
          day: {
            dayNumber: 2,
            stops: [
              { id: 'e', name: "Pa'rus", drivingTimeFromPreviousMin: 99 },
              { id: 'f', name: 'Lower Emerald Pool', drivingTimeFromPreviousMin: 30 },
            ],
            totalDriveMinutes: 129,
          },
        }],
      },
    });
    expect(applied.ok).toBe(true);
    expect(applied.plan.days[0].stops[1].drivingTimeFromPreviousMin).toBe(12);
    expect(applied.plan.days[0].totalDriveMinutes).toBe(12);
    expect(applied.plan.days[1].stops.map((s) => s.drivingTimeFromPreviousMin)).toEqual([null, null]);
    expect(applied.plan.days[1].totalDriveMinutes).toBeNull();
  });

  test('clearDerivedDriveStateOnDays is a no-op for empty touch sets', () => {
    const plan = {
      days: [{ dayNumber: 1, stops: [{ id: 'a', drivingTimeFromPreviousMin: 10 }] }],
    };
    expect(clearDerivedDriveStateOnDays(plan, [])).toBe(plan);
  });

  test('bindDerivedSurfaces stamps logistics and the answer to the same hash', () => {
    const bound = bindDerivedSurfaces({
      planHash: 'rev-19',
      travelLogistics: { routeLegs: [] },
      response: { kind: 'itinerary', text: 'I changed day two.' },
    });
    expect(bound.travelLogistics.planHash).toBe('rev-19');
    expect(bound.response.planHash).toBe('rev-19');
    expect(bound.response.text).toBe('I changed day two.');
  });
});
