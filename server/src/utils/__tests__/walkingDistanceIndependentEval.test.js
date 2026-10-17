'use strict';

/**
 * Phase 12H2-B — held-out walking-distance evaluation.
 * Destinations and sentences are not the development fixtures.
 */

const { resolveWalkingDistance, inferWalkingDistanceMiles } = require('../walkingDistanceOwnership');

describe('12H2-B independent evaluation (held-out rows)', () => {
  test('Harbor Dunes — true activity distance is retained', () => {
    const result = resolveWalkingDistance({
      text: 'Harbor Dunes Walk is a packed-sand 0.9-mile loop with tide-pool pullouts.',
      name: 'Harbor Dunes Walk',
      activityTypes: ['walk', 'beach'],
      category: 'thingstodo',
    });
    expect(result.miles).toBe(0.9);
    expect(result.source).toBe('text');
  });

  test('Split River Monument — geographic mileage is rejected', () => {
    const result = resolveWalkingDistance({
      text: 'Split River Monument protects 22 miles of designated wild river through the gorge.',
      name: 'Gorge Overlook',
      activityTypes: ['viewpoint'],
      category: 'place',
    });
    expect(result.miles).toBeNull();
  });

  test('Stackhouse Furnace wayside remains unmeasured', () => {
    const result = resolveWalkingDistance({
      text: 'A 2.4-mile worker path once connected the furnace to the river landing.',
      name: 'Stackhouse Furnace Wayside',
      activityTypes: [],
      category: 'place',
    });
    expect(result.miles).toBeNull();
  });

  test('Cinder Cone — structured distance wins over a larger narrative figure', () => {
    const result = resolveWalkingDistance({
      text: 'The cinder fields stretch 11 miles along the highway. Stay on the marked path.',
      name: 'Cinder Cone Path',
      activityTypes: ['hike'],
      structuredMiles: 1.1,
    });
    expect(result.miles).toBe(1.1);
    expect(result.source).toBe('structured');
  });

  test('removing an invalid distance does not invent a duration', () => {
    const result = resolveWalkingDistance({
      text: 'There are 16 miles of recreational river area in the preserve.',
      name: 'Diversion Exhibit',
      activityTypes: ['exhibit'],
      category: 'place',
      providerDuration: '20 Minutes',
    });
    expect(result.miles).toBeNull();
    expect(result.derivedDurationMinutes).toBeNull();
  });

  test('max-number heuristic is gone even without entity context', () => {
    expect(inferWalkingDistanceMiles(
      'A 1.2-mile trail. The preserve contains 45 miles of trails and 90 miles of shoreline.'
    )).toBe(1.2);
  });
});
