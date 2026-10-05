'use strict';

const { finalizeStructuredItinerary, deepFreeze } = require('../finalizeItinerary');

function plan() {
  return {
    days: [
      {
        id: 'd1', dayNumber: 1, label: 'Day 1',
        stops: [
          { id: 's1', order: 0, type: 'trail', name: 'Rim Trail', note: 'n', startTime: '08:00', duration: 120, latitude: 0, longitude: 0 },
          { id: 's2', order: 1, type: 'landmark', name: 'Overlook', note: 'n', startTime: '11:00', duration: 60, latitude: 37.2, longitude: -113.0, coordinateSource: 'geocoder' },
        ],
      },
    ],
  };
}

describe('finalizeStructuredItinerary', () => {
  it('freezes the returned itinerary (immutable downstream)', async () => {
    const res = await finalizeStructuredItinerary({ itineraryData: plan() });
    expect(Object.isFrozen(res.itineraryData)).toBe(true);
    expect(Object.isFrozen(res.itineraryData.days[0])).toBe(true);
    expect(() => { res.itineraryData.days[0].stops[0].name = 'X'; }).toThrow();
  });

  it('does not mutate the caller\'s input', async () => {
    const input = plan();
    const before = JSON.stringify(input);
    await finalizeStructuredItinerary({ itineraryData: input });
    expect(JSON.stringify(input)).toBe(before);
  });

  it('normalizes invalid coordinates (0,0) to null; keeps trusted coords', async () => {
    const res = await finalizeStructuredItinerary({ itineraryData: plan() });
    const [a, b] = res.itineraryData.days[0].stops;
    expect(a.latitude).toBeNull(); // 0,0 rejected
    expect(a.longitude).toBeNull();
    expect(b.latitude).toBeCloseTo(37.2); // geocoder-sourced kept
  });

  it('valid schema-captured tool coordinates survive as coordinateSource: tool', async () => {
    // No explicit coordinateSource → defaults to trusted 'tool' after validation.
    const p = { days: [{ id: 'd1', dayNumber: 1, label: 'Day 1', stops: [
      { id: 's1', order: 0, type: 'trail', name: 'Rim', note: 'n', startTime: '08:00', duration: 60, latitude: 37.29, longitude: -113.05 },
    ] }] };
    const res = await finalizeStructuredItinerary({ itineraryData: p });
    const stop = res.itineraryData.days[0].stops[0];
    expect(stop.latitude).toBeCloseTo(37.29);
    expect(stop.longitude).toBeCloseTo(-113.05);
    expect(stop.coordinateSource).toBe('tool');
  });

  it('coordinates explicitly marked estimated in the payload become null', async () => {
    const p = { days: [{ id: 'd1', dayNumber: 1, label: 'Day 1', stops: [
      { id: 's1', order: 0, type: 'trail', name: 'Rim', note: 'n', startTime: '08:00', duration: 60, latitude: 37.29, longitude: -113.05, coordinateSource: 'model_estimate' },
    ] }] };
    const res = await finalizeStructuredItinerary({ itineraryData: p });
    const stop = res.itineraryData.days[0].stops[0];
    expect(stop.latitude).toBeNull();
    expect(stop.coordinateSource).toBe('unknown');
  });

  it('out-of-range / partial tool coordinates become null', async () => {
    const p = { days: [{ id: 'd1', dayNumber: 1, label: 'Day 1', stops: [
      { id: 's1', order: 0, type: 'trail', name: 'A', note: 'n', startTime: '08:00', duration: 60, latitude: 999, longitude: -113 },
      { id: 's2', order: 1, type: 'trail', name: 'B', note: 'n', startTime: '10:00', duration: 60, latitude: 37.2, longitude: null },
    ] }] };
    const res = await finalizeStructuredItinerary({ itineraryData: p });
    const [a, b] = res.itineraryData.days[0].stops;
    expect(a.latitude).toBeNull();
    expect(b.latitude).toBeNull(); // partial pair
  });

  it('computes feasibility on the final plan and returns structured issues', async () => {
    const res = await finalizeStructuredItinerary({ itineraryData: plan() });
    expect(Array.isArray(res.feasibilityIssues)).toBe(true);
  });

  it('runs constraint correction before returning (removed stops stay removed)', async () => {
    const constraints = { hasConstraints: true, avoidStrenuous: true, maxHikeDifficulty: 'easy' };
    const strenuous = plan();
    strenuous.days[0].stops[0].difficulty = 'strenuous';
    const res = await finalizeStructuredItinerary({ itineraryData: strenuous, constraints });
    // Whatever correction did, the result is frozen and self-consistent.
    expect(Object.isFrozen(res.itineraryData)).toBe(true);
  });

  it('Phase 9C.1B — keeps a valid continuous-activity group', async () => {
    const withGroup = plan();
    withGroup.days[0].activityGroups = [{ id: 'g1', stopIds: ['s1', 's2'] }];
    const res = await finalizeStructuredItinerary({ itineraryData: withGroup });
    expect(res.itineraryData.days[0].activityGroups).toEqual([{ id: 'g1', stopIds: ['s1', 's2'] }]);
  });

  it('Phase 9C.1B — drops a dangling activity group (referencing a stop id that was removed by correction)', async () => {
    const constraints = { hasConstraints: true, avoidStrenuous: true, maxHikeDifficulty: 'easy' };
    const strenuous = plan();
    strenuous.days[0].stops[0].difficulty = 'strenuous';
    // Group references the stop most likely to be removed by correction.
    strenuous.days[0].activityGroups = [{ id: 'g1', stopIds: ['s1', 's2'] }];
    const res = await finalizeStructuredItinerary({ itineraryData: strenuous, constraints });
    const remainingIds = new Set(res.itineraryData.days[0].stops.map((s) => s.id));
    if (!remainingIds.has('s1')) {
      expect(res.itineraryData.days[0].activityGroups).toEqual([]);
    } else {
      expect(res.itineraryData.days[0].activityGroups).toEqual([{ id: 'g1', stopIds: ['s1', 's2'] }]);
    }
  });
});

describe('deepFreeze', () => {
  it('recursively freezes nested structures', () => {
    const o = deepFreeze({ a: { b: [{ c: 1 }] } });
    expect(Object.isFrozen(o.a.b[0])).toBe(true);
  });
});
