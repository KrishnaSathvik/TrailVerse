'use strict';

/**
 * Phase 12H2-B — walking-distance ownership.
 * Generic NPS-shaped fixtures. No Zion / Pa'rus / 12.6 goldens.
 */

const {
  resolveWalkingDistance,
  inferWalkingDistanceMiles,
  WALKING_DISTANCE_QUALIFIER,
} = require('../walkingDistanceOwnership');

function milesOf(text, entity = {}) {
  return resolveWalkingDistance({ text, ...entity }).miles;
}

describe('valid activity-owned distances', () => {
  test('the trail is 4.2 miles round trip', () => {
    const result = resolveWalkingDistance({
      text: 'The trail is 4.2 miles round trip through the canyon.',
      name: 'Canyon Rim Trail',
      activityTypes: ['hike'],
      category: 'thingstodo',
    });
    expect(result.miles).toBe(4.2);
    expect(result.qualifier).toBe(WALKING_DISTANCE_QUALIFIER.ROUND_TRIP);
    expect(result.source).toBe('text');
  });

  test('a 1.5-mile loop', () => {
    expect(milesOf('A 1.5-mile loop follows the canyon rim.', {
      name: 'Rim Loop',
      activityTypes: ['walk'],
    })).toBe(1.5);
  });

  test('official structured distance wins over unrelated narrative mileage', () => {
    const result = resolveWalkingDistance({
      text: 'The park contains 80 miles of trails. Picnic tables nearby.',
      name: 'River Loop',
      activityTypes: ['hike'],
      structuredMiles: 0.8,
    });
    expect(result.miles).toBe(0.8);
    expect(result.source).toBe('structured');
    expect(result.conflict).toBe(false);
  });

  test('one-way trail distance is stored as stated, not doubled', () => {
    const result = resolveWalkingDistance({
      text: 'Walk 0.5 mile one way to the overlook.',
      name: 'Overlook Walk',
      activityTypes: ['walk'],
    });
    expect(result.miles).toBe(0.5);
    expect(result.qualifier).toBe(WALKING_DISTANCE_QUALIFIER.ONE_WAY);
  });

  test('accessibility-survey length on a trailhead is owned length', () => {
    expect(milesOf('Length: 2,565 feet, .49 miles Surface Type: Compacted gravel', {
      name: 'Living Forest Trailhead',
      activityTypes: ['hike'],
      category: 'place',
    })).toBe(0.49);
  });

  test('round-trip trail named in a trailhead listing remains owned', () => {
    expect(milesOf(
      'One of the most popular day hikes is the Hurricane Hill trail, about 3 miles (4.8 km) round trip.',
      { name: 'Hurricane Hill Trailhead', activityTypes: ['hike'], category: 'place' }
    )).toBe(3);
  });
});

describe('invalid geographic / contextual mileage', () => {
  test('river corridor mileage is not walking distance', () => {
    expect(milesOf('There are 14 miles of recreational river area in the park.', {
      name: 'River Wayside',
      activityTypes: [],
      category: 'place',
    })).toBeNull();
  });

  test('shoreline mileage is not walking distance', () => {
    expect(milesOf('The seashore protects 25 miles of shoreline.', {
      name: 'Coast Overlook',
      activityTypes: ['viewpoint'],
    })).toBeNull();
  });

  test('visitor center miles-from-entrance is not walking distance', () => {
    expect(milesOf('The visitor center is 3 miles from the entrance.', {
      name: 'Park Visitor Center',
      activityTypes: ['visitor_center'],
      category: 'visitor_center',
    })).toBeNull();
  });

  test('road corridor on a wayside entity is not walking distance', () => {
    expect(milesOf('This scenic corridor is 18 miles long through the valley.', {
      name: 'Valley Wayside Exhibit',
      activityTypes: ['exhibit'],
      category: 'place',
    })).toBeNull();
  });

  test('park-total trail mileage is not the entity distance', () => {
    expect(milesOf('The park contains 80 miles of trails.', {
      name: 'Forest Walk',
      activityTypes: ['hike'],
    })).toBeNull();
  });

  test('historical journey mileage is not walking distance', () => {
    expect(milesOf('In 1869 the party traveled 40 miles across the plateau.', {
      name: 'Expedition Overlook',
      activityTypes: ['viewpoint'],
    })).toBeNull();
  });

  test('inferWalkingDistanceMiles no longer returns the max of every mile figure', () => {
    expect(inferWalkingDistanceMiles(
      'The trail is 2.1 miles round trip. The park contains 80 miles of trails. Utah has 81,899 miles of river.'
    )).toBe(2.1);
  });
});

describe('entity-type gating is necessary but not sufficient', () => {
  test('wayside / exhibit / visitor-center rows do not take narrative miles', () => {
    expect(milesOf('A pleasant 2-mile loop starts near here.', {
      name: 'Dam Wayside',
      activityTypes: [],
      category: 'place',
    })).toBeNull();
    expect(milesOf('Hike the 2-mile loop from the parking area.', {
      name: 'District Visitor Center',
      activityTypes: ['visitor_center'],
      category: 'visitor_center',
    })).toBeNull();
  });

  test('a hike row still rejects geographic miles in its body', () => {
    expect(milesOf('There are 12 miles of recreational river area in the park.', {
      name: 'Canyon Walk',
      activityTypes: ['hike', 'walk'],
      category: 'thingstodo',
    })).toBeNull();
  });
});

describe('mixed bodies and structured precedence', () => {
  test('only the trail-owned number is kept when several mile figures appear', () => {
    const result = resolveWalkingDistance({
      text: 'The trail is 3.2 miles round trip. The visitor center is 4 miles from the entrance. The park has 60 miles of roads.',
      name: 'Cedar Trail',
      activityTypes: ['hike'],
    });
    expect(result.miles).toBe(3.2);
    expect(result.qualifier).toBe(WALKING_DISTANCE_QUALIFIER.ROUND_TRIP);
  });

  test('structured official distance is not overwritten by a conflicting narrative number', () => {
    const result = resolveWalkingDistance({
      text: 'Some visitors walk 6 miles along the river corridor.',
      name: 'River Loop',
      activityTypes: ['hike'],
      structuredMiles: 1.2,
    });
    expect(result.miles).toBe(1.2);
    expect(result.source).toBe('structured');
  });

  test('two conflicting owned text distances are not resolved by taking max or min', () => {
    const result = resolveWalkingDistance({
      text: 'The trail is 2 miles round trip. This 5-mile loop follows the rim.',
      name: 'Split Trail',
      activityTypes: ['hike'],
    });
    expect(result.miles).toBeNull();
    expect(result.conflict).toBe(true);
  });

  test('provider duration is untouched when walking distance is absent', () => {
    const result = resolveWalkingDistance({
      text: 'There are 14 miles of recreational river area in the park.',
      name: 'River Exhibit',
      activityTypes: [],
      category: 'place',
      providerDuration: '30-120 Minutes',
    });
    expect(result.miles).toBeNull();
    expect(result.derivedDurationMinutes).toBeNull();
  });
});
