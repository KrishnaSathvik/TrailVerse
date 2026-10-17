'use strict';

/**
 * PHASE 4G — ONE CONSTRAINT, ONE RUNTIME MEANING, EVERY ENTRY PATH.
 *
 * Phase 4F traced the production constraint path end to end and found the
 * traveler's stated mobility reaching the validator correctly — and
 * `travelerFitEvaluation` reading a dialect nothing in `server/src` writes
 * (`constraints.mobilityRaw`, flat `constraints.wheelchair`,
 * `constraints.fitness`). Those are the shapes the OFFLINE GATE HARNESSES emit.
 * The reader was written against a capture, so on real production objects it
 * returned null for every hard mobility need, and the traveler who said
 * "my dad uses a wheelchair" was not treated as low-effort — while the next
 * turn saying "more relaxed" was.
 *
 * The success criterion these tests encode:
 *
 *   refinement and restored-trip semantics EQUAL initial-turn semantics for the
 *   same persisted constraint, and the CONSTRAINTS carry that behavior — not the
 *   wording of the latest message.
 *
 * Everything runs through the real `parseConstraints`, the only constraints
 * producer in `server/src`. Offline, no model calls.
 */

const { parseConstraints } = require('../constraintEngine');
const { resolveRuntimeMobility } = require('../canonicalRuntimeProjection');
const { resolveCoveragePolicy, evaluateItineraryCompleteness } = require('../itineraryCompleteness');
const { lowEffortProfile } = require('../travelerFitEvaluation');
const { evaluateProseConstraintSafety } = require('../proseConstraintSafety');
const { planEvidenceRequirements } = require('../../services/evidencePlannerService');
const { buildSemanticRequest } = require('../../services/semanticTurnResolver');
const { classifyTrailieIntent } = require('../../services/trailieIntentClassifier');

const STATED = 'Three days in Zion. My dad uses a wheelchair and needs frequent breaks, so keep the walking light.';
/** Deliberately carries NO mobility, pace or effort language of its own. */
const NEUTRAL_REFINEMENT = 'Swap the day 2 afternoon stop for something different.';

const ZION = {
  entityId: 'nps:park:zion',
  entityType: 'national_park',
  displayName: 'Zion National Park',
  latitude: 37.298,
  longitude: -113.026,
  resolutionConfidence: 1,
};

function turns() {
  const initial = parseConstraints({ parkCode: 'zion', formData: {} }, STATED);
  const refinement = parseConstraints(
    { parkCode: 'zion', formData: {}, planningState: initial.planningState },
    NEUTRAL_REFINEMENT
  );
  // A restored trip re-enters through the same producer with the persisted
  // planningState round-tripped through JSON and no message at all.
  const restored = parseConstraints(
    { parkCode: 'zion', formData: {}, planningState: JSON.parse(JSON.stringify(initial.planningState)) },
    ''
  );
  return { initial, refinement, restored };
}

const { initial, refinement, restored } = turns();
const ENTRY_PATHS = [
  ['initial turn', initial, STATED],
  ['refinement', refinement, NEUTRAL_REFINEMENT],
  ['restored trip', restored, ''],
];

describe('the production producer writes the canonical shape, not a flat one', () => {
  test.each(ENTRY_PATHS)('%s', (_label, constraints) => {
    expect(constraints.walkingTolerance).toBeUndefined();
    expect(constraints.wheelchair).toBeUndefined();
    expect(constraints.mobilityRaw).toBeUndefined();
    expect(constraints.fitness).toBeUndefined();
  });
});

describe('every entry path resolves the same runtime mobility', () => {
  test.each(ENTRY_PATHS)('%s', (_label, constraints) => {
    expect(resolveRuntimeMobility(constraints)).toEqual(
      expect.objectContaining({
        walkingTolerance: 'limited',
        requiresFrequentBreaks: true,
        wheelchair: true,
      })
    );
  });
});

describe('every consumer sees that constraint on every entry path', () => {
  test.each(ENTRY_PATHS)('completeness coverage policy — %s', (_label, constraints) => {
    expect(resolveCoveragePolicy(constraints)).toBe('mobility_limited');
  });

  test.each(ENTRY_PATHS)('traveler fit low-effort profile — %s', (_label, constraints) => {
    // The empty prompt is the point: the CONSTRAINTS must carry this.
    expect(lowEffortProfile(constraints, '')).toBe(true);
  });

  test.each(ENTRY_PATHS)('evidence planning asks for accessibility — %s', (_label, constraints, prompt) => {
    const requirements = planEvidenceRequirements({
      turnId: 'turn:4g',
      userPrompt: prompt,
      intent: classifyTrailieIntent({ userPrompt: prompt || STATED }),
      resolvedEntities: [ZION],
      constraints,
      now: new Date('2026-08-29T12:00:00Z'),
    });
    expect(requirements.map((r) => r.topic)).toContain('accessibility');
  });

  test.each(ENTRY_PATHS)('the semantic seam is told the constraint — %s', (_label, constraints) => {
    const request = buildSemanticRequest({
      text: 'change the second day',
      understanding: { taskFamily: 'refinement' },
      triggerReasons: ['test'],
      travelerConstraints: constraints,
    });
    expect(request.input.travelerConstraints).toEqual(
      expect.objectContaining({ walkingTolerance: 'limited' })
    );
  });

  test.each(ENTRY_PATHS)('prose safety still guards the limit — %s', (_label, constraints) => {
    const result = evaluateProseConstraintSafety({
      text: 'This hike is perfect for you and well within your walking limit.',
      constraints,
    });
    expect(result.reasonCodes).toContain('unsupported_mobility_suitability_claim');
  });
});

describe('behavior follows the constraints, not the wording of the latest message', () => {
  test('a neutral refinement does not lower the traveler-fit profile', () => {
    expect(lowEffortProfile(refinement, '')).toBe(lowEffortProfile(initial, ''));
  });

  test('adding or removing effort language in the prompt changes nothing', () => {
    for (const prompt of ['', NEUTRAL_REFINEMENT, 'take it easy', 'go hard']) {
      expect(lowEffortProfile(restored, prompt)).toBe(true);
    }
  });
});

describe('harness and legacy dialects are not production runtime state', () => {
  test.each([
    ['flat wheelchair', { wheelchair: true }],
    ['dead mobilityRaw', { mobilityRaw: { wheelchair: true } }],
    ['harness rawMobility', { rawMobility: { wheelchair: true } }],
    ['harness fitness', { fitness: 'easy' }],
    ['harness preferences.pace', { preferences: { pace: 'relaxed' } }],
  ])('%s does not establish a low-effort profile', (_label, constraints) => {
    expect(lowEffortProfile(constraints, '')).toBe(false);
  });

  test('flat walkingTolerance is not a valid coverage-policy input', () => {
    expect(resolveCoveragePolicy({ walkingTolerance: 'limited' })).toBe('standard');
  });

  test('the canonical shapes DO establish a low-effort profile', () => {
    expect(lowEffortProfile({ mobility: { wheelchair: true } }, '')).toBe(true);
    expect(lowEffortProfile({ planningState: { mobility: { wheelchair: true } } }, '')).toBe(true);
    expect(lowEffortProfile({ fitnessLevel: 'easy' }, '')).toBe(true);
    expect(lowEffortProfile({ planningState: { preferences: { fitness: 'easy' } } }, '')).toBe(true);
  });
});

/**
 * BUG B — PRESERVED DELIBERATELY, NOT FIXED HERE.
 *
 * `avoidExposure` supports an explicit reversal; `walkingTolerance` does not —
 * `constraintSemantics` has no walking-acceptance pattern and
 * `planningState` only ever WRITES `'limited'`. So a mobility limit is
 * permanent for the life of a trip. That fails safe (it over-constrains) and it
 * is a separate semantics question from constraint canonicalization. This test
 * exists so the asymmetry is explicit and cannot change by accident.
 */
describe('reversal asymmetry (pinned, not fixed in 4G)', () => {
  const reversed = parseConstraints(
    { parkCode: 'zion', formData: {}, planningState: initial.planningState },
    'Actually my dad is doing much better, walking is fine now and we are fine with exposed drop-offs.'
  );

  test('exposure aversion CAN be reversed', () => {
    expect(reversed.avoidExposure).toBe(false);
    expect(reversed.planningState.preferences.avoidExposure).toBe(false);
  });

  test('a walking limit CANNOT be reversed — it persists for the trip', () => {
    expect(resolveRuntimeMobility(reversed).walkingTolerance).toBe('limited');
    expect(resolveCoveragePolicy(reversed)).toBe('mobility_limited');
  });
});

/**
 * T3 REGRESSION PIN (characterizes existing completeness behavior; 4G changes
 * none of it). The Phase 4B "duration-only flip" was measured on a flattened
 * harness capture whose constraint the validator could not see, so the day was
 * judged under `standard` and the >=90 rule. Under the policy the traveler
 * actually earns, the anchor's duration does not decide the day.
 */
describe('T3 — under mobility_limited, 30m and 120m reach the same verdict', () => {
  const dayAt = (minutes) => ({
    days: [{
      dayNumber: 1,
      title: 'Zion',
      stops: [
        { name: 'Lower Emerald Pool Trail', type: 'hike', duration: minutes, timeWindow: 'morning' },
        { name: 'Zion Human History Museum', type: 'museum', duration: 60, timeWindow: 'afternoon' },
        { name: 'Canyon Junction Bridge Viewpoint', type: 'viewpoint', duration: 45, timeWindow: 'evening' },
      ],
    }],
  });
  const verdict = (minutes, constraints) => evaluateItineraryCompleteness({
    itineraryData: dayAt(minutes),
    constraints,
    userPrompt: 'Actually my knee has been bothering me, so keep the walking pretty light.',
  });

  test('the constrained traveler gets the same answer at 30m and 120m', () => {
    const short = verdict(30, restored);
    const long = verdict(120, restored);
    expect(short.coveragePolicy).toBe('mobility_limited');
    expect(long.coveragePolicy).toBe('mobility_limited');
    expect(short.ok).toBe(long.ok);
  });

  test('the same day under the flattened harness dialect is judged as standard', () => {
    expect(verdict(30, { walkingTolerance: 'limited' }).coveragePolicy).toBe('standard');
  });
});

/**
 * SAME DEFECT CLASS, REMAINING FIELDS.
 *
 * `constraints.activityPreferences` and the flat `hasOlderTravelers` are
 * re-extracted from the current message exactly like `constraints.mobility`
 * (`parseConstraints` produces `seed.activityPreferences` and never consumes
 * it), so a consumer reading only those layers loses the traveller's stated
 * preference on every turn after the one that stated it. The durable copies
 * live at `planningState.activityPreferences` / `planningState.travelers`.
 */
describe('activity preference and party facts survive the same three entry paths', () => {
  const NO_HIKING = 'Four days in Zion with my older parents. No hiking please.';
  const hikingInitial = parseConstraints({ parkCode: 'zion', formData: {} }, NO_HIKING);
  const hikingRefinement = parseConstraints(
    { parkCode: 'zion', formData: {}, planningState: hikingInitial.planningState },
    NEUTRAL_REFINEMENT
  );
  const hikingRestored = parseConstraints(
    { parkCode: 'zion', formData: {}, planningState: JSON.parse(JSON.stringify(hikingInitial.planningState)) },
    ''
  );
  const HIKING_PATHS = [
    ['initial turn', hikingInitial, NO_HIKING],
    ['refinement', hikingRefinement, NEUTRAL_REFINEMENT],
    ['restored trip', hikingRestored, ''],
  ];

  test.each(HIKING_PATHS)('the semantic seam is told the hiking preference — %s', (_label, constraints) => {
    const request = buildSemanticRequest({
      text: 'change the second day',
      understanding: { taskFamily: 'refinement' },
      triggerReasons: ['test'],
      travelerConstraints: constraints,
    });
    expect(request.input.travelerConstraints).toEqual(
      expect.objectContaining({ hiking: 'none' })
    );
  });

  test.each(HIKING_PATHS)('evidence planning asks for no-hiking experiences — %s', (_label, constraints, prompt) => {
    const requirements = planEvidenceRequirements({
      turnId: 'turn:4g-hiking',
      userPrompt: prompt,
      intent: classifyTrailieIntent({ userPrompt: prompt || NO_HIKING }),
      resolvedEntities: [ZION],
      constraints,
      now: new Date('2026-08-29T12:00:00Z'),
    });
    const reasons = requirements.flatMap((r) => r.reasons || r.reasonCodes || []);
    expect(reasons).toContain('no_hiking_visitor_experiences');
  });

  test.each(HIKING_PATHS)('the older-travellers fact survives — %s', (_label, constraints) => {
    const { resolveRuntimeHasOlderTravelers } = require('../canonicalRuntimeProjection');
    expect(resolveRuntimeHasOlderTravelers(constraints)).toBe(true);
  });
});
