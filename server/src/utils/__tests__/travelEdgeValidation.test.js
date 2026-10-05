'use strict';

/**
 * Phase 9C.1D.2 — minimal canonical same-destination travel-edge semantics.
 *
 * A `travelEdge` means only: "the traveler is intended to transfer from this
 * independent experience to that one." It carries no mode, duration,
 * distance, or verification status — those are separate, later questions.
 * Deliberately conservative: anything structurally ambiguous is DROPPED,
 * never repaired/guessed, matching the `activityGroups` precedent.
 */

const {
  normalizeDayTravelEdges,
  normalizeItineraryTravelEdges,
  findTravelEdge,
} = require('../travelEdgeValidation');

function day(stops, travelEdges, activityGroups) {
  return {
    dayNumber: 1,
    stops,
    ...(activityGroups !== undefined ? { activityGroups } : {}),
    ...(travelEdges !== undefined ? { travelEdges } : {}),
  };
}

function stop(id, extra = {}) {
  return { id, order: 0, type: 'trail', name: id, note: 'n', duration: 30, ...extra };
}

const edge = (sourceStopId, targetStopId, relationship = 'transfer') => ({ sourceStopId, targetStopId, relationship });

describe('normalizeDayTravelEdges — structural validation', () => {
  test('a basic forward same-destination transfer validates', () => {
    const d = day([stop('old-faithful'), stop('grand-prismatic')], [edge('old-faithful', 'grand-prismatic')]);
    expect(normalizeDayTravelEdges(d)).toEqual([edge('old-faithful', 'grand-prismatic')]);
  });

  test('an edge referencing a stop id missing from the day is dropped', () => {
    const d = day([stop('a'), stop('b')], [edge('a', 'nonexistent')]);
    expect(normalizeDayTravelEdges(d)).toEqual([]);
  });

  test('source === target is dropped', () => {
    const d = day([stop('a'), stop('b')], [edge('a', 'a')]);
    expect(normalizeDayTravelEdges(d)).toEqual([]);
  });

  test('a backward edge (source occurs after target in sequence) is dropped, never reversed', () => {
    const d = day([stop('a'), stop('b')], [edge('b', 'a')]);
    expect(normalizeDayTravelEdges(d)).toEqual([]);
  });

  test('an exact duplicate pair is deduplicated deterministically (first occurrence kept)', () => {
    const d = day([stop('a'), stop('b')], [edge('a', 'b'), edge('a', 'b')]);
    expect(normalizeDayTravelEdges(d)).toEqual([edge('a', 'b')]);
  });

  test('only relationship "transfer" is accepted in V1; anything else is dropped', () => {
    const d = day([stop('a'), stop('b')], [edge('a', 'b', 'continuous_activity')]);
    expect(normalizeDayTravelEdges(d)).toEqual([]);
  });

  test('no travelEdges field at all normalizes to an empty array', () => {
    expect(normalizeDayTravelEdges(day([stop('a'), stop('b')]))).toEqual([]);
  });
});

describe('normalizeDayTravelEdges — activity-group interaction', () => {
  test('an edge between two stops in the same activity group is invalid (the group already owns that relationship)', () => {
    const d = day(
      [stop('trailhead'), stop('chalet')],
      [edge('trailhead', 'chalet')],
      [{ id: 'g1', stopIds: ['trailhead', 'chalet'] }]
    );
    expect(normalizeDayTravelEdges(d)).toEqual([]);
  });

  test('a source inside a group must be its LAST member — an edge from a non-final group member is dropped', () => {
    const d = day(
      [stop('trailhead'), stop('waypoint'), stop('chalet'), stop('lodge')],
      [edge('waypoint', 'lodge')], // 'waypoint' is a member but not the last one ('chalet' is)
      [{ id: 'g1', stopIds: ['trailhead', 'waypoint', 'chalet'] }]
    );
    expect(normalizeDayTravelEdges(d)).toEqual([]);
  });

  test('a source that IS the last member of its group is a valid edge origin', () => {
    const d = day(
      [stop('trailhead'), stop('waypoint'), stop('chalet'), stop('lodge')],
      [edge('chalet', 'lodge')],
      [{ id: 'g1', stopIds: ['trailhead', 'waypoint', 'chalet'] }]
    );
    expect(normalizeDayTravelEdges(d)).toEqual([edge('chalet', 'lodge')]);
  });

  test('a target inside a group must be its FIRST member — an edge into a non-first group member is dropped', () => {
    const d = day(
      [stop('lodge'), stop('trailhead'), stop('waypoint'), stop('chalet')],
      [edge('lodge', 'waypoint')], // 'waypoint' is a member but not the first one ('trailhead' is)
      [{ id: 'g1', stopIds: ['trailhead', 'waypoint', 'chalet'] }]
    );
    expect(normalizeDayTravelEdges(d)).toEqual([]);
  });

  test('a target that IS the first member of its group is a valid edge destination', () => {
    const d = day(
      [stop('lodge'), stop('trailhead'), stop('waypoint'), stop('chalet')],
      [edge('lodge', 'trailhead')],
      [{ id: 'g1', stopIds: ['trailhead', 'waypoint', 'chalet'] }]
    );
    expect(normalizeDayTravelEdges(d)).toEqual([edge('lodge', 'trailhead')]);
  });
});

describe('normalizeDayTravelEdges — same-destination ownership boundary', () => {
  test('a same-day cross-destination edge is dropped — roadTripContract/routeEvidenceDriveBridge own that transfer', () => {
    const d = day(
      [stop('zion-narrows', { parkCode: 'zion' }), stop('bryce-viewpoint', { parkCode: 'brca' })],
      [edge('zion-narrows', 'bryce-viewpoint')]
    );
    expect(normalizeDayTravelEdges(d)).toEqual([]);
  });

  test('a same-parkCode edge is retained as same-destination', () => {
    const d = day(
      [stop('zion-narrows', { parkCode: 'zion' }), stop('zion-emerald-pools', { parkCode: 'zion' })],
      [edge('zion-narrows', 'zion-emerald-pools')]
    );
    expect(normalizeDayTravelEdges(d)).toEqual([edge('zion-narrows', 'zion-emerald-pools')]);
  });
});

describe('normalizeItineraryTravelEdges', () => {
  test('normalizes every day in the itinerary independently', () => {
    const itin = {
      days: [
        day([stop('a'), stop('b')], [edge('a', 'b')]),
        day([stop('c'), stop('d')], [edge('c', 'nonexistent')]),
      ],
    };
    const out = normalizeItineraryTravelEdges(itin);
    expect(out.days[0].travelEdges).toEqual([edge('a', 'b')]);
    expect(out.days[1].travelEdges).toEqual([]);
  });

  test('same stop id reused on two different days never cross-contaminates edge validation (each day resolves only its own stops)', () => {
    const itin = {
      days: [
        day([stop('stop-1'), stop('stop-2')], [edge('stop-1', 'stop-2')]),
        day([stop('stop-1'), stop('stop-2')], [edge('stop-1', 'stop-2')]),
      ],
    };
    const out = normalizeItineraryTravelEdges(itin);
    expect(out.days[0].travelEdges).toEqual([edge('stop-1', 'stop-2')]);
    expect(out.days[1].travelEdges).toEqual([edge('stop-1', 'stop-2')]);
  });
});

describe('findTravelEdge', () => {
  test('returns the matching edge for day-scoped endpoint ids', () => {
    const d = day([stop('a'), stop('b')], [edge('a', 'b')]);
    expect(findTravelEdge(d, 'a', 'b')).toEqual(edge('a', 'b'));
  });

  test('returns null when no edge matches', () => {
    const d = day([stop('a'), stop('b')], [edge('a', 'b')]);
    expect(findTravelEdge(d, 'b', 'a')).toBeNull();
  });

  test('is a pure lookup — never dispatches anything, no side effects on the day object', () => {
    const d = day([stop('a'), stop('b')], [edge('a', 'b')]);
    const before = JSON.stringify(d);
    findTravelEdge(d, 'a', 'b');
    expect(JSON.stringify(d)).toBe(before);
  });
});
