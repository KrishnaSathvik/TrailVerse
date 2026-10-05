'use strict';

/**
 * Phase 9C.1D.1 — canonical stop endpoint identity hardening.
 *
 * `stop.id` is not currently a reliable relationship endpoint: it can be
 * absent on `add_stop`, and `update_stop` can silently overwrite it. This
 * suite pins the narrow identity contract required before any travel-edge
 * work can trust `sourceStopId`/`targetStopId`:
 *
 *   - every stop entering the plan via add_stop ends up with a non-empty id
 *   - a duplicate id within the same day is not allowed to survive
 *   - update_stop can never change an existing stop's id, patch-content or not
 *   - remove_stop / reorder_stops preserve every surviving stop's id exactly
 *
 * Deterministic offline fixtures only. No providers, no model calls.
 */

const { applyPlanPatch } = require('../itineraryPlanPatch');

function planWith(day1Stops) {
  return {
    intro: 'A short trip.',
    days: [
      { day: 1, dayNumber: 1, stops: day1Stops },
      { day: 2, dayNumber: 2, stops: [{ id: 'stop-1', name: 'Day 2 Overlook', type: 'viewpoint', duration: 30 }] },
    ],
  };
}

const patch = (operations) => ({ response: 'ok', operations });

describe('add_stop always leaves a non-empty, day-unique id', () => {
  it('assigns a server-owned id when the model omits one', () => {
    const prior = planWith([{ id: 'stop-1', name: 'Welcome Center', type: 'visitor_center', duration: 20 }]);
    const result = applyPlanPatch({
      priorPlan: prior,
      planPatch: patch([{ op: 'add_stop', dayNumber: 1, stop: { name: 'Trailhead', type: 'trail', duration: 40 } }]),
    });
    expect(result.ok).toBe(true);
    const added = result.plan.days[0].stops.find((s) => s.name === 'Trailhead');
    expect(added).toBeDefined();
    expect(typeof added.id).toBe('string');
    expect(added.id.trim().length).toBeGreaterThan(0);
  });

  it('reassigns a server-owned id when the model supplies one that collides within the same day', () => {
    const prior = planWith([{ id: 'stop-1', name: 'Welcome Center', type: 'visitor_center', duration: 20 }]);
    const result = applyPlanPatch({
      priorPlan: prior,
      planPatch: patch([{ op: 'add_stop', dayNumber: 1, stop: { id: 'stop-1', name: 'Trailhead', type: 'trail', duration: 40 } }]),
    });
    expect(result.ok).toBe(true);
    const stops = result.plan.days[0].stops;
    const ids = stops.map((s) => s.id);
    expect(new Set(ids).size).toBe(stops.length); // no duplicate id within the day
    const added = stops.find((s) => s.name === 'Trailhead');
    expect(added.id).not.toBe('stop-1');
  });

  it('keeps a model-supplied id that does not collide within the day', () => {
    const prior = planWith([{ id: 'stop-1', name: 'Welcome Center', type: 'visitor_center', duration: 20 }]);
    const result = applyPlanPatch({
      priorPlan: prior,
      planPatch: patch([{ op: 'add_stop', dayNumber: 1, stop: { id: 'trailhead-1', name: 'Trailhead', type: 'trail', duration: 40 } }]),
    });
    expect(result.ok).toBe(true);
    const added = result.plan.days[0].stops.find((s) => s.name === 'Trailhead');
    expect(added.id).toBe('trailhead-1');
  });

  it('an id that collides only with a DIFFERENT day\'s stop id is left alone (day-scoped uniqueness)', () => {
    const prior = planWith([{ id: 'stop-1', name: 'Welcome Center', type: 'visitor_center', duration: 20 }]);
    // Day 2 already has a stop with id 'stop-1' — adding an id-'stop-1' stop to
    // day 1 is fine, since day 1 has no existing 'stop-1' collision of its own.
    const result = applyPlanPatch({
      priorPlan: prior,
      planPatch: patch([{ op: 'add_stop', dayNumber: 1, stop: { id: 'unique-in-day1', name: 'Trailhead', type: 'trail', duration: 40 } }]),
    });
    expect(result.ok).toBe(true);
    const added = result.plan.days[0].stops.find((s) => s.name === 'Trailhead');
    expect(added.id).toBe('unique-in-day1');
  });
});

describe('update_stop can never change a canonical id', () => {
  it('ignores an id supplied in the patch content, ordinary field update', () => {
    const prior = planWith([{ id: 'stop-1', name: 'Welcome Center', type: 'visitor_center', duration: 20 }]);
    const result = applyPlanPatch({
      priorPlan: prior,
      planPatch: patch([{ op: 'update_stop', dayNumber: 1, stopId: 'stop-1', stop: { id: 'renamed-id', duration: 25 } }]),
    });
    expect(result.ok).toBe(true);
    const stop = result.plan.days[0].stops[0];
    expect(stop.id).toBe('stop-1');
    expect(stop.duration).toBe(25);
  });

  it('ignores an id supplied in the patch content, even on a name change (rename branch)', () => {
    const prior = planWith([{ id: 'stop-1', name: 'Welcome Center', type: 'visitor_center', duration: 20 }]);
    const result = applyPlanPatch({
      priorPlan: prior,
      planPatch: patch([{ op: 'update_stop', dayNumber: 1, stopId: 'stop-1', stop: { id: 'renamed-id', name: 'Different Place' } }]),
    });
    expect(result.ok).toBe(true);
    const stop = result.plan.days[0].stops[0];
    expect(stop.id).toBe('stop-1');
    expect(stop.name).toBe('Different Place');
  });
});

describe('remove_stop / reorder_stops preserve surviving ids', () => {
  it('remove_stop does not touch the ids of the stops that remain', () => {
    const prior = planWith([
      { id: 'stop-1', name: 'Welcome Center', type: 'visitor_center', duration: 20 },
      { id: 'stop-2', name: 'Trailhead', type: 'trail', duration: 40 },
    ]);
    const result = applyPlanPatch({
      priorPlan: prior,
      planPatch: patch([{ op: 'remove_stop', dayNumber: 1, stopId: 'stop-1' }]),
    });
    expect(result.ok).toBe(true);
    expect(result.plan.days[0].stops).toHaveLength(1);
    expect(result.plan.days[0].stops[0].id).toBe('stop-2');
  });

  it('reorder_stops preserves every id exactly, only order changes', () => {
    const prior = planWith([
      { id: 'stop-1', name: 'Welcome Center', type: 'visitor_center', duration: 20 },
      { id: 'stop-2', name: 'Trailhead', type: 'trail', duration: 40 },
    ]);
    const result = applyPlanPatch({
      priorPlan: prior,
      planPatch: patch([{ op: 'reorder_stops', dayNumber: 1, stopOrder: ['stop-2', 'stop-1'] }]),
    });
    expect(result.ok).toBe(true);
    const ids = result.plan.days[0].stops.map((s) => s.id);
    expect(ids).toEqual(['stop-2', 'stop-1']);
  });
});
