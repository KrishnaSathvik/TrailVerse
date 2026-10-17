'use strict';

/**
 * Phase 9C.1D.2 — travel-edge lifecycle across patch operations.
 *
 * Canonical stop ids are immutable (9C.1D.1), so a valid `travelEdges` entry
 * should survive an unrelated mutation — but every operation must revalidate
 * the day's edges against its (possibly changed) stop sequence rather than
 * carrying stale/now-invalid relationships forward blindly.
 */

const { applyPlanPatch } = require('../itineraryPlanPatch');

function planWith(day1Stops, day1TravelEdges) {
  return {
    intro: 'A short trip.',
    days: [
      { day: 1, dayNumber: 1, stops: day1Stops, ...(day1TravelEdges ? { travelEdges: day1TravelEdges } : {}) },
    ],
  };
}

const patch = (operations) => ({ response: 'ok', operations });
const edge = (sourceStopId, targetStopId) => ({ sourceStopId, targetStopId, relationship: 'transfer' });

describe('update_stop preserves valid travel edges', () => {
  it('an ordinary field update on an unrelated field leaves the edge intact', () => {
    const prior = planWith(
      [{ id: 'a', name: 'A', duration: 20 }, { id: 'b', name: 'B', duration: 30 }],
      [edge('a', 'b')]
    );
    const result = applyPlanPatch({
      priorPlan: prior,
      planPatch: patch([{ op: 'update_stop', dayNumber: 1, stopId: 'b', stop: { duration: 45 } }]),
    });
    expect(result.ok).toBe(true);
    expect(result.plan.days[0].travelEdges).toEqual([edge('a', 'b')]);
  });
});

describe('remove_stop drops incident edges', () => {
  it('removing an endpoint stop drops the edge that referenced it', () => {
    const prior = planWith(
      [{ id: 'a', name: 'A', duration: 20 }, { id: 'b', name: 'B', duration: 30 }],
      [edge('a', 'b')]
    );
    const result = applyPlanPatch({
      priorPlan: prior,
      planPatch: patch([{ op: 'remove_stop', dayNumber: 1, stopId: 'b' }]),
    });
    expect(result.ok).toBe(true);
    expect(result.plan.days[0].travelEdges).toEqual([]);
  });
});

describe('reorder_stops revalidates direction, never rewrites', () => {
  it('a reorder that flips source after target drops the edge instead of reversing it', () => {
    const prior = planWith(
      [{ id: 'a', name: 'A', duration: 20 }, { id: 'b', name: 'B', duration: 30 }],
      [edge('a', 'b')]
    );
    const result = applyPlanPatch({
      priorPlan: prior,
      planPatch: patch([{ op: 'reorder_stops', dayNumber: 1, stopOrder: ['b', 'a'] }]),
    });
    expect(result.ok).toBe(true);
    expect(result.plan.days[0].travelEdges).toEqual([]);
  });

  it('a reorder that keeps direction intact keeps the edge', () => {
    const prior = planWith(
      [{ id: 'a', name: 'A', duration: 20 }, { id: 'b', name: 'B', duration: 30 }, { id: 'c', name: 'C', duration: 10 }],
      [edge('a', 'c')]
    );
    const result = applyPlanPatch({
      priorPlan: prior,
      planPatch: patch([{ op: 'reorder_stops', dayNumber: 1, stopOrder: ['a', 'c', 'b'] }]),
    });
    expect(result.ok).toBe(true);
    expect(result.plan.days[0].travelEdges).toEqual([edge('a', 'c')]);
  });
});

describe('add_stop invents no edges', () => {
  it('adding a new stop does not create any travel edge automatically', () => {
    const prior = planWith(
      [{ id: 'a', name: 'A', duration: 20 }, { id: 'b', name: 'B', duration: 30 }],
      [edge('a', 'b')]
    );
    const result = applyPlanPatch({
      priorPlan: prior,
      planPatch: patch([{ op: 'add_stop', dayNumber: 1, stop: { name: 'C', duration: 15 } }]),
    });
    expect(result.ok).toBe(true);
    expect(result.plan.days[0].travelEdges).toEqual([edge('a', 'b')]);
  });
});

describe('update_day is a wholesale replacement — stale relationships do not silently carry forward', () => {
  it('a replacement day that omits travelEdges/activityGroups does not inherit the prior day\'s', () => {
    const prior = planWith(
      [{ id: 'a', name: 'A', duration: 20 }, { id: 'b', name: 'B', duration: 30 }],
      [edge('a', 'b')]
    );
    const result = applyPlanPatch({
      priorPlan: prior,
      planPatch: patch([{
        op: 'update_day',
        dayNumber: 1,
        day: { stops: [{ id: 'a', name: 'A', duration: 25 }, { id: 'b', name: 'B', duration: 35 }] },
      }]),
    });
    expect(result.ok).toBe(true);
    expect(result.plan.days[0].travelEdges ?? []).toEqual([]);
  });

  it('a replacement day that DOES supply travelEdges gets them validated, not blindly trusted', () => {
    const prior = planWith([{ id: 'a', name: 'A', duration: 20 }, { id: 'b', name: 'B', duration: 30 }]);
    const result = applyPlanPatch({
      priorPlan: prior,
      planPatch: patch([{
        op: 'update_day',
        dayNumber: 1,
        day: {
          stops: [{ id: 'a', name: 'A', duration: 20 }, { id: 'b', name: 'B', duration: 30 }],
          travelEdges: [edge('a', 'b'), edge('b', 'a')], // second is backward — must be dropped
        },
      }]),
    });
    expect(result.ok).toBe(true);
    expect(result.plan.days[0].travelEdges).toEqual([edge('a', 'b')]);
  });
});
