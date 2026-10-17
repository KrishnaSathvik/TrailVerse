'use strict';

/**
 * PHASE 4G — the ONE canonical runtime projection.
 *
 * Trailie accumulated several constraint dialects: the canonical runtime shape
 * production writes, the durable planningState shape, and a flattened shape the
 * offline gate harnesses emit for human-legible telemetry. Phase 4F proved a
 * consumer (`travelerFitEvaluation`) was reading the HARNESS dialect and
 * therefore saw nothing at all in production.
 *
 * These tests pin the boundary: exactly two legitimate input dialects, one
 * runtime meaning, and harness/legacy dialects deliberately NOT honoured — so a
 * future fallback cannot quietly recreate the problem.
 */

const {
  MOBILITY_FIELDS,
  resolveRuntimeMobility,
  runtimeMobilityField,
  resolveRuntimeFitness,
  resolveRuntimePace,
  resolveRuntimeTransportMode,
  resolveRuntimeActivityPreference,
  resolveRuntimeHasOlderTravelers,
} = require('../canonicalRuntimeProjection');

describe('resolveRuntimeMobility — legitimate dialects', () => {
  test('reads the current-turn canonical shape', () => {
    const m = resolveRuntimeMobility({ mobility: { walkingTolerance: 'limited' } });
    expect(m.walkingTolerance).toBe('limited');
  });

  test('reads the durable planningState shape', () => {
    const m = resolveRuntimeMobility({
      planningState: { mobility: { walkingTolerance: 'limited' } },
    });
    expect(m.walkingTolerance).toBe('limited');
  });

  test('projects every mobility field, defaulting absent ones to null', () => {
    const m = resolveRuntimeMobility({ mobility: { wheelchair: true } });
    expect(Object.keys(m).sort()).toEqual([...MOBILITY_FIELDS].sort());
    expect(m.wheelchair).toBe(true);
    expect(m.walkingTolerance).toBeNull();
    expect(m.maxWalkMilesPerSegment).toBeNull();
  });

  test('null/undefined constraints project to an all-null shape', () => {
    for (const input of [null, undefined, {}, 'nonsense', 42]) {
      const m = resolveRuntimeMobility(input);
      expect(MOBILITY_FIELDS.every((f) => m[f] === null)).toBe(true);
    }
  });
});

describe('resolveRuntimeMobility — precedence is current turn, then durable, then null', () => {
  test('a current-turn value shadows the durable value', () => {
    const m = resolveRuntimeMobility({
      mobility: { maxWalkMilesPerSegment: 1 },
      planningState: { mobility: { maxWalkMilesPerSegment: 3 } },
    });
    expect(m.maxWalkMilesPerSegment).toBe(1);
  });

  test('a null current-turn value falls through to the durable value', () => {
    const m = resolveRuntimeMobility({
      mobility: { walkingTolerance: null },
      planningState: { mobility: { walkingTolerance: 'limited' } },
    });
    expect(m.walkingTolerance).toBe('limited');
  });

  test('a durable-only null does not resurrect anything', () => {
    const m = resolveRuntimeMobility({
      mobility: { walkingTolerance: 'limited' },
      planningState: { mobility: { walkingTolerance: null } },
    });
    expect(m.walkingTolerance).toBe('limited');
  });

  test('precedence is per FIELD, not per object', () => {
    const m = resolveRuntimeMobility({
      mobility: { wheelchair: true, walkingTolerance: null },
      planningState: { mobility: { wheelchair: null, walkingTolerance: 'limited' } },
    });
    expect(m.wheelchair).toBe(true);
    expect(m.walkingTolerance).toBe('limited');
  });
});

describe('resolveRuntimeMobility — harness and legacy dialects are NOT runtime state', () => {
  /**
   * These are the shapes the offline gate harnesses write
   * (`artifacts/trailie-turn3-.../run-turn3.js`) and the shape a dead read in
   * travelerFitEvaluation once expected. Honouring them here is what would let
   * a capture masquerade as production state — the exact Phase 4F defect.
   */
  test.each([
    ['flat root', { walkingTolerance: 'limited' }],
    ['harness rawMobility', { rawMobility: { walkingTolerance: 'limited' } }],
    ['dead mobilityRaw', { mobilityRaw: { walkingTolerance: 'limited' } }],
    ['harness rawPreferences', { rawPreferences: { walkingTolerance: 'limited' } }],
  ])('%s is not a valid production runtime representation', (_label, input) => {
    expect(resolveRuntimeMobility(input).walkingTolerance).toBeNull();
  });

  test.each([
    ['flat root', { wheelchair: true }],
    ['harness rawMobility', { rawMobility: { wheelchair: true } }],
    ['dead mobilityRaw', { mobilityRaw: { wheelchair: true } }],
  ])('%s does not establish a hard mobility need', (_label, input) => {
    expect(resolveRuntimeMobility(input).wheelchair).toBeNull();
  });
});

describe('runtimeMobilityField', () => {
  test('resolves one field with the same precedence', () => {
    const c = {
      mobility: { walkingTolerance: null },
      planningState: { mobility: { walkingTolerance: 'limited' } },
    };
    expect(runtimeMobilityField(c, 'walkingTolerance')).toBe('limited');
  });

  test('a field absent from both dialects is null, never undefined', () => {
    expect(runtimeMobilityField({ mobility: {} }, 'wheelchair')).toBeNull();
    expect(runtimeMobilityField({}, 'wheelchair')).toBeNull();
    expect(runtimeMobilityField(null, 'wheelchair')).toBeNull();
  });
});

describe('the other canonical projections', () => {
  test('fitness comes from fitnessLevel, then durable preferences.fitness', () => {
    expect(resolveRuntimeFitness({ fitnessLevel: 'easy' })).toBe('easy');
    expect(resolveRuntimeFitness({
      planningState: { preferences: { fitness: 'easy' } },
    })).toBe('easy');
    expect(resolveRuntimeFitness({
      fitnessLevel: 'moderate',
      planningState: { preferences: { fitness: 'easy' } },
    })).toBe('moderate');
    expect(resolveRuntimeFitness({ fitness: 'easy' })).toBeNull();
  });

  test('pace comes from the flat canonical field, then durable preferences.pace', () => {
    expect(resolveRuntimePace({ pace: 'relaxed' })).toBe('relaxed');
    expect(resolveRuntimePace({
      planningState: { preferences: { pace: 'relaxed' } },
    })).toBe('relaxed');
    expect(resolveRuntimePace({ preferences: { pace: 'relaxed' } })).toBeNull();
  });

  test('transport mode comes from durable transportation.mode', () => {
    expect(resolveRuntimeTransportMode({
      planningState: { transportation: { mode: '4wd' } },
    })).toBe('4wd');
    expect(resolveRuntimeTransportMode({ transportation: { mode: '4wd' } })).toBeNull();
  });
});

describe('activity preferences and party facts use the same two dialects', () => {
  test('activity preference: current turn, then durable, then null', () => {
    expect(resolveRuntimeActivityPreference({ activityPreferences: { hiking: 'none' } }, 'hiking')).toBe('none');
    expect(resolveRuntimeActivityPreference({
      planningState: { activityPreferences: { hiking: 'none' } },
    }, 'hiking')).toBe('none');
    expect(resolveRuntimeActivityPreference({
      activityPreferences: { hiking: null },
      planningState: { activityPreferences: { hiking: 'none' } },
    }, 'hiking')).toBe('none');
    expect(resolveRuntimeActivityPreference({
      activityPreferences: { hiking: 'easy' },
      planningState: { activityPreferences: { hiking: 'none' } },
    }, 'hiking')).toBe('easy');
    expect(resolveRuntimeActivityPreference({}, 'hiking')).toBeNull();
  });

  test('a flat activity preference is not a runtime representation', () => {
    expect(resolveRuntimeActivityPreference({ hiking: 'none' }, 'hiking')).toBeNull();
  });

  test('older travellers: flat canonical field, then durable travelers.hasOlderTravelers', () => {
    expect(resolveRuntimeHasOlderTravelers({ hasOlderTravelers: true })).toBe(true);
    expect(resolveRuntimeHasOlderTravelers({
      planningState: { travelers: { hasOlderTravelers: true } },
    })).toBe(true);
    expect(resolveRuntimeHasOlderTravelers({})).toBe(false);
    expect(resolveRuntimeHasOlderTravelers({ travelers: { hasOlderTravelers: true } })).toBe(false);
  });
});
