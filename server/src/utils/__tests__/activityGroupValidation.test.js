'use strict';

/**
 * Phase 9C.1B — continuous-activity grouping.
 *
 * A group means only "these stops are one continuous traveler activity, so
 * adjacency between them must not be read as an independent driving leg."
 * It does NOT imply shared geographic identity, does not merge map pins,
 * and does not assert a travel mode. Invalid/dangling groups are DROPPED
 * deterministically, never repaired/guessed — `id` is the only stable
 * endpoint identity; `order`/position is never used to reconcile membership.
 */

const {
  normalizeDayActivityGroups,
  normalizeItineraryActivityGroups,
  stopsShareActivityGroup,
} = require('../activityGroupValidation');

function day(stops, activityGroups) {
  return { dayNumber: 1, stops, ...(activityGroups !== undefined ? { activityGroups } : {}) };
}

function stop(id) {
  return { id, order: 0, type: 'trail', name: id, note: 'n', duration: 30 };
}

describe('normalizeDayActivityGroups', () => {
  test('a valid multi-waypoint group (>=2 real stop ids) is kept', () => {
    const d = day(
      [stop('trailhead'), stop('haystack-pass'), stop('granite-chalet')],
      [{ id: 'g1', stopIds: ['trailhead', 'haystack-pass', 'granite-chalet'] }]
    );
    expect(normalizeDayActivityGroups(d)).toEqual([
      { id: 'g1', stopIds: ['trailhead', 'haystack-pass', 'granite-chalet'] },
    ]);
  });

  test('a group referencing a stop id missing from the day is dropped entirely', () => {
    const d = day(
      [stop('a'), stop('b')],
      [{ id: 'g1', stopIds: ['a', 'nonexistent'] }]
    );
    expect(normalizeDayActivityGroups(d)).toEqual([]);
  });

  test('a group with fewer than 2 stop ids is dropped', () => {
    const d = day([stop('a'), stop('b')], [{ id: 'g1', stopIds: ['a'] }]);
    expect(normalizeDayActivityGroups(d)).toEqual([]);
  });

  test('a group listing the same stop id twice (authoring error) is dropped, not silently deduped', () => {
    const d = day([stop('a'), stop('b')], [{ id: 'g1', stopIds: ['a', 'a', 'b'] }]);
    expect(normalizeDayActivityGroups(d)).toEqual([]);
  });

  test('a stop cannot belong to two groups — the later conflicting group is dropped, the earlier one wins', () => {
    const d = day(
      [stop('a'), stop('b'), stop('c')],
      [
        { id: 'g1', stopIds: ['a', 'b'] },
        { id: 'g2', stopIds: ['b', 'c'] },
      ]
    );
    expect(normalizeDayActivityGroups(d)).toEqual([{ id: 'g1', stopIds: ['a', 'b'] }]);
  });

  test('no activityGroups field at all normalizes to an empty array', () => {
    expect(normalizeDayActivityGroups(day([stop('a'), stop('b')]))).toEqual([]);
  });

  test('an empty activityGroups array stays empty', () => {
    expect(normalizeDayActivityGroups(day([stop('a')], []))).toEqual([]);
  });

  // Phase 9C.1D.2 — a continuous activity must occupy one contiguous run of
  // the day's current stop sequence. An unrelated stop interrupting a
  // supposedly-continuous group is a semantic contradiction: dropped, never
  // reordered/repaired, same fail-safe policy as every other invalid shape.
  test('a group whose members are interrupted by an unrelated stop is dropped', () => {
    const d = day(
      [stop('trailhead'), stop('haystack-pass'), stop('unrelated-viewpoint'), stop('granite-chalet')],
      [{ id: 'g1', stopIds: ['trailhead', 'haystack-pass', 'granite-chalet'] }]
    );
    expect(normalizeDayActivityGroups(d)).toEqual([]);
  });

  test('a contiguous group survives even when it does not start at index 0', () => {
    const d = day(
      [stop('welcome'), stop('trailhead'), stop('haystack-pass'), stop('granite-chalet')],
      [{ id: 'g1', stopIds: ['trailhead', 'haystack-pass', 'granite-chalet'] }]
    );
    expect(normalizeDayActivityGroups(d)).toEqual([
      { id: 'g1', stopIds: ['trailhead', 'haystack-pass', 'granite-chalet'] },
    ]);
  });

  test('out-of-order members drop even when the run is contiguous', () => {
    const d = day(
      [stop('trailhead'), stop('haystack-pass'), stop('granite-chalet')],
      [{ id: 'g1', stopIds: ['granite-chalet', 'trailhead', 'haystack-pass'] }]
    );
    expect(normalizeDayActivityGroups(d)).toEqual([]);
  });
});

describe('normalizeItineraryActivityGroups', () => {
  test('normalizes every day in the itinerary, dropping only the invalid groups', () => {
    const itin = {
      days: [
        day([stop('a'), stop('b')], [{ id: 'g1', stopIds: ['a', 'b'] }]),
        day([stop('c'), stop('d')], [{ id: 'g2', stopIds: ['c', 'missing'] }]),
      ],
    };
    const out = normalizeItineraryActivityGroups(itin);
    expect(out.days[0].activityGroups).toEqual([{ id: 'g1', stopIds: ['a', 'b'] }]);
    expect(out.days[1].activityGroups).toEqual([]);
  });
});

describe('stopsShareActivityGroup', () => {
  test('true for two stop ids in the same group', () => {
    const d = day([stop('a'), stop('b')], [{ id: 'g1', stopIds: ['a', 'b'] }]);
    expect(stopsShareActivityGroup(d, 'a', 'b')).toBe(true);
  });

  test('false for stops in different groups or ungrouped', () => {
    const d = day(
      [stop('a'), stop('b'), stop('c')],
      [{ id: 'g1', stopIds: ['a', 'b'] }]
    );
    expect(stopsShareActivityGroup(d, 'a', 'c')).toBe(false);
    expect(stopsShareActivityGroup(d, 'b', 'c')).toBe(false);
  });

  test('false when either id is missing/falsy', () => {
    const d = day([stop('a'), stop('b')], [{ id: 'g1', stopIds: ['a', 'b'] }]);
    expect(stopsShareActivityGroup(d, null, 'b')).toBe(false);
    expect(stopsShareActivityGroup(d, 'a', undefined)).toBe(false);
  });
});
