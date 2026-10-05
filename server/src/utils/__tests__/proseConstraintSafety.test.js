'use strict';

/**
 * P0 — hard constraints bind prose, and the validator never invents properties
 * the answer did not state.
 */

const {
  evaluateProseConstraintSafety,
  buildProseConstraintRepairInstructions,
} = require('../proseConstraintSafety');

const MOBILITY = { mobility: { maxWalkMilesPerSegment: 1 } };
const EXPOSURE = { avoidExposure: true };
const BOTH = { mobility: { maxWalkMilesPerSegment: 1 }, avoidExposure: true };
const NO_HIKING = { activityPreferences: { hiking: 'none' } };

const codes = (text, constraints) => evaluateProseConstraintSafety({ text, constraints }).reasonCodes;

describe('explicit contradictions in the answer itself', () => {
  test('a stated distance beyond the limit is a violation', () => {
    expect(codes('Start with the 8-mile loop trail along the ridge.', MOBILITY))
      .toContain('mobility_distance_contradiction');
  });

  test('kilometres are converted before comparison', () => {
    expect(codes('The 12 km hike is the highlight.', MOBILITY))
      .toContain('mobility_distance_contradiction');
    // 1.2 km ≈ 0.75 mi — inside a 1-mile limit.
    expect(codes('The 1.2 km walk is gentle.', MOBILITY)).toEqual([]);
  });

  test('exposure the answer describes is a violation', () => {
    expect(codes('Take the exposed cliff-edge traverse for the best views.', EXPOSURE))
      .toContain('exposure_constraint_contradiction');
    expect(codes('The chain section is the fun part.', EXPOSURE))
      .toContain('exposure_constraint_contradiction');
  });

  test('a strenuous hike offered to a non-hiker is a violation', () => {
    expect(codes('I would make the strenuous summit hike your main activity.', NO_HIKING))
      .toContain('hiking_constraint_contradiction');
  });

  test('the original Case E prose is now rejected', () => {
    const text = 'Hike the 8-mile exposed cliff traverse at Angels Landing; the chain section is fine for everyone in your group regardless of mobility limits.';
    const result = evaluateProseConstraintSafety({ text, constraints: BOTH });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toEqual(expect.arrayContaining([
      'mobility_distance_contradiction',
      'exposure_constraint_contradiction',
    ]));
  });
});

describe('guidance is not a recommendation', () => {
  test.each([
    'Skip the 8-mile loop — it is well beyond your one-mile limit.',
    'Avoid the exposed cliff traverse entirely.',
    "I'd leave out the 6-mile ridge hike; it is too long for your limit.",
    'Rather than the 9-mile trail, take the short boardwalk.',
    'The 8-mile route would be too much, so we will not include it.',
  ])('%s → no violation', (text) => {
    expect(evaluateProseConstraintSafety({ text, constraints: BOTH }).ok).toBe(true);
  });
});

describe('unknown properties stay unknown (no invention)', () => {
  test('a bare place mention is not assumed to be too long', () => {
    expect(evaluateProseConstraintSafety({
      text: 'Try Example Trail near the visitor center if you feel up to it.',
      constraints: MOBILITY,
    }).ok).toBe(true);
  });

  test('but certifying an unestablished distance is rejected', () => {
    expect(codes('Example Trail is perfect for your one-mile limit.', MOBILITY))
      .toContain('unsupported_mobility_suitability_claim');
    expect(codes('That walk is well within your limit.', MOBILITY))
      .toContain('unsupported_mobility_suitability_claim');
  });

  test('certifying a distance the answer DID state as compliant is allowed', () => {
    expect(evaluateProseConstraintSafety({
      text: 'The 0.5-mile paved walk is well within your limit.',
      constraints: MOBILITY,
    }).ok).toBe(true);
  });

  test('certifying absence of exposure is rejected when unestablished', () => {
    expect(codes('That trail has no exposure at all, so it is a safe pick.', EXPOSURE))
      .toContain('unsupported_exposure_suitability_claim');
  });
});

describe('scope', () => {
  test('no active hard constraint means nothing to enforce', () => {
    expect(evaluateProseConstraintSafety({
      text: 'Hike the 8-mile exposed cliff traverse.',
      constraints: null,
    }).ok).toBe(true);
  });

  test('a non-walking distance is not a walking violation', () => {
    expect(evaluateProseConstraintSafety({
      text: 'It is a 40-mile drive between the two entrances.',
      constraints: MOBILITY,
    }).ok).toBe(true);
  });

  test('planningState-shaped constraints are read too', () => {
    expect(codes('Take the 8-mile trail.', { planningState: { mobility: { maxWalkMilesPerSegment: 1 } } }))
      .toContain('mobility_distance_contradiction');
  });

  test('repair instructions are deterministic and name no places', () => {
    const result = evaluateProseConstraintSafety({
      text: 'Hike the 8-mile exposed cliff traverse at Angels Landing.',
      constraints: BOTH,
    });
    const instructions = buildProseConstraintRepairInstructions(result);
    expect(instructions).toMatch(/walking limit/i);
    expect(instructions).toMatch(/exposed/i);
    expect(instructions).not.toMatch(/Angels Landing/i);
  });
});
