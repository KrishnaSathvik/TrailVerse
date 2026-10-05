'use strict';

/**
 * WP-TU Phase 4 Task 9 — deterministic, pure, offline targetTripId resolver.
 *
 * Every test drives `resolveTargetTripId` directly with hand-built
 * `candidatePlans` and, wherever practical, the REAL `classifyTrailieIntent`
 * output (real job/relationship/destination resolution) rather than a
 * hand-mocked intent object — consistent with how prior tasks favored real
 * classifier output. No DB, no model calls.
 */

const { classifyTrailieIntent } = require('../trailieIntentClassifier');
const { STATUS, needsPlanTarget, resolveTargetTripId, __testables } = require('../targetTripResolver');

function plan({ id, title = 'New Trip Plan', parkCode, parkName, startDate = null, endDate = null, status = 'active' }) {
  return {
    id,
    title,
    parkCode,
    parkName,
    formData: { startDate, endDate },
    planningState: { destination: { parkCode, parkName, region: null, state: null } },
    status,
  };
}

const BADLANDS_PLAN = plan({
  id: 'trip-badl-1', title: 'Badlands Trip', parkCode: 'badl', parkName: 'Badlands National Park',
  startDate: '2026-06-01', endDate: '2026-06-05',
});
const REDWOOD_PLAN = plan({
  id: 'trip-redw-1', title: 'Redwood Trip', parkCode: 'redw', parkName: 'Redwood National Park',
  startDate: '2026-05-01', endDate: '2026-05-05',
});
const REDWOOD_PLAN_2 = plan({
  id: 'trip-redw-2', title: 'New Trip Plan', parkCode: 'redw', parkName: 'Redwood National Park',
  startDate: '2026-09-01', endDate: '2026-09-05',
});
const ZION_PLAN_OLD = plan({
  id: 'trip-zion-old', title: 'Old Zion Trip', parkCode: 'zion', parkName: 'Zion National Park',
  startDate: '2025-03-01', endDate: '2025-03-05',
});

function intentFor(userPrompt, priorTripState = null) {
  return classifyTrailieIntent({ userPrompt, priorTripState });
}

const BADLANDS_PRIOR = { primaryDestination: { parkCode: 'badl', name: 'Badlands' }, hasItinerary: true };

describe('Task 9 — acceptance matrix (all 10 rows)', () => {
  // Row 1: Active Badlands -> "Make Day 2 easier" -> targetTripId = Badlands
  test('row 1: active-trip refinement with no named destination targets the active trip', () => {
    const intent = intentFor('Make Day 2 easier', BADLANDS_PRIOR);
    expect(intent.tripContext.relationship).toBe('continuation');
    const out = resolveTargetTripId({
      intent,
      candidatePlans: [BADLANDS_PLAN, REDWOOD_PLAN],
      activeTripId: BADLANDS_PLAN.id,
    });
    expect(out.status).toBe(STATUS.RESOLVED);
    expect(out.targetTripId).toBe(BADLANDS_PLAN.id);
  });

  // Row 2: Badlands active -> "For my Redwood trip, change Day 2" -> exact Redwood plan
  test('row 2: historical_reference resolves the exact Redwood plan; active Badlands identity untouched', () => {
    const intent = intentFor('For my Redwood trip, change Day 2', BADLANDS_PRIOR);
    expect(intent.tripContext.relationship).toBe('historical_reference');
    const candidatePlans = [BADLANDS_PLAN, REDWOOD_PLAN];
    const snapshot = JSON.parse(JSON.stringify(candidatePlans));
    const out = resolveTargetTripId({
      intent,
      candidatePlans,
      activeTripId: BADLANDS_PLAN.id,
    });
    expect(out.status).toBe(STATUS.RESOLVED);
    expect(out.targetTripId).toBe(REDWOOD_PLAN.id);
    // Read-only: inputs are byte-identical after the call.
    expect(candidatePlans).toEqual(snapshot);
  });

  // Row 3: next turn "Make Day 3 easier too" -> SAME Redwood plan via continuity
  test('row 3: a further bare follow-up stays on the prior-established Redwood target, not the active Badlands trip', () => {
    const intent = intentFor('Make Day 3 easier too', BADLANDS_PRIOR);
    expect(intent.tripContext.relationship).toBe('continuation');
    const out = resolveTargetTripId({
      intent,
      candidatePlans: [BADLANDS_PLAN, REDWOOD_PLAN],
      activeTripId: BADLANDS_PLAN.id,
      // Task 10/11's concern to populate; Task 9 just consumes it.
      priorTargetTripId: REDWOOD_PLAN.id,
    });
    expect(out.status).toBe(STATUS.RESOLVED);
    expect(out.targetTripId).toBe(REDWOOD_PLAN.id);
    expect(out.reasonCode).toBe('prior_target_continuity');
  });

  // Row 4: Badlands active -> "Is October good in Redwood?" (Q&A) -> not_required
  test('row 4: ordinary Q&A naming a destination never attaches a plan target', () => {
    const intent = intentFor('Is October good in Redwood?', BADLANDS_PRIOR);
    expect(intent.travelerJob).toBe('general_advice');
    const out = resolveTargetTripId({
      intent,
      candidatePlans: [BADLANDS_PLAN, REDWOOD_PLAN],
      activeTripId: BADLANDS_PLAN.id,
    });
    expect(out.status).toBe(STATUS.NOT_REQUIRED);
    expect(out.targetTripId).toBeNull();
  });

  // Row 5: fresh "Plan Zion for 3 days" with an old Zion plan existing -> must NOT reuse it
  test('row 5: a fresh itinerary build never reuses an old same-destination plan as the mutation target', () => {
    const intent = intentFor('Plan Zion for 3 days', null);
    expect(intent.travelerJob).toBe('day_by_day_itinerary');
    expect(intent.tripContext.activeContextAction).toBe('set');
    const out = resolveTargetTripId({
      intent,
      candidatePlans: [ZION_PLAN_OLD],
      activeTripId: null,
    });
    expect(out.status).toBe(STATUS.NOT_REQUIRED);
    expect(out.targetTripId).toBeNull();
  });

  // Row 6: explicit trip ID/title reference, uniquely valid
  test('row 6a: an explicit trip id wins outright', () => {
    const intent = intentFor('Change Day 2', BADLANDS_PRIOR); // continuation-shaped, no destination
    const out = resolveTargetTripId({
      intent,
      candidatePlans: [BADLANDS_PLAN, REDWOOD_PLAN],
      activeTripId: BADLANDS_PLAN.id,
      explicitTripId: REDWOOD_PLAN.id,
    });
    expect(out.status).toBe(STATUS.RESOLVED);
    expect(out.targetTripId).toBe(REDWOOD_PLAN.id);
    expect(out.reasonCode).toBe('explicit_trip_id');
  });

  test('row 6b: an explicit, unique title mention wins over the active trip', () => {
    const intent = intentFor('Update my Redwood Trip, change Day 2', BADLANDS_PRIOR);
    const out = resolveTargetTripId({
      intent,
      candidatePlans: [BADLANDS_PLAN, REDWOOD_PLAN],
      activeTripId: BADLANDS_PLAN.id,
      userMessage: 'Update my Redwood Trip, change Day 2',
    });
    expect(out.status).toBe(STATUS.RESOLVED);
    expect(out.targetTripId).toBe(REDWOOD_PLAN.id);
    expect(out.reasonCode).toBe('explicit_title_reference');
  });

  // Row 7: one unambiguous historical Redwood candidate + clear historical_reference
  test('row 7: a single destination-matching candidate resolves without needing a disambiguator', () => {
    const intent = intentFor('For my Redwood trip, change Day 2', BADLANDS_PRIOR);
    const out = resolveTargetTripId({
      intent,
      candidatePlans: [BADLANDS_PLAN, REDWOOD_PLAN],
      activeTripId: BADLANDS_PLAN.id,
    });
    expect(out.status).toBe(STATUS.RESOLVED);
    expect(out.targetTripId).toBe(REDWOOD_PLAN.id);
    expect(out.reasonCode).toBe('unique_destination_match');
  });

  // Row 8: two Redwood candidates, no disambiguator -> ambiguous
  test('row 8: two same-destination candidates with no real disambiguator resolve as ambiguous, never a guess', () => {
    const intent = intentFor('For my Redwood trip, change Day 2', BADLANDS_PRIOR);
    const out = resolveTargetTripId({
      intent,
      candidatePlans: [BADLANDS_PLAN, REDWOOD_PLAN, REDWOOD_PLAN_2],
      activeTripId: BADLANDS_PLAN.id,
    });
    expect(out.status).toBe(STATUS.AMBIGUOUS);
    expect(out.targetTripId).toBeNull();
    expect(out.candidateTripIds).toEqual(expect.arrayContaining([REDWOOD_PLAN.id, REDWOOD_PLAN_2.id]));
  });

  // Row 9: named destination with no matching saved plan at all -> not_found
  test('row 9: a historical reference to a destination with no saved plan is not_found, never invented', () => {
    const intent = intentFor('For my Acadia trip, change Day 2', BADLANDS_PRIOR);
    expect(intent.tripContext.relationship).toBe('historical_reference');
    const out = resolveTargetTripId({
      intent,
      candidatePlans: [BADLANDS_PLAN, REDWOOD_PLAN],
      activeTripId: BADLANDS_PLAN.id,
    });
    expect(out.status).toBe(STATUS.NOT_FOUND);
    expect(out.targetTripId).toBeNull();
  });

  // Row 10: whenever a historical target resolves, active trip identity/state
  // is never mutated by this resolver — it is read-only w.r.t. active state.
  test('row 10: resolving a historical target never mutates the active trip inputs', () => {
    const intent = intentFor('For my Redwood trip, change Day 2', BADLANDS_PRIOR);
    const activeTripIdBefore = BADLANDS_PLAN.id;
    const badlandsSnapshot = JSON.parse(JSON.stringify(BADLANDS_PLAN));
    const out = resolveTargetTripId({
      intent,
      candidatePlans: [BADLANDS_PLAN, REDWOOD_PLAN],
      activeTripId: activeTripIdBefore,
    });
    expect(out.targetTripId).toBe(REDWOOD_PLAN.id);
    // The function returns a NEW value; it never writes back onto anything
    // the caller passed in, and the "active" identity is simply whatever the
    // caller already had — this resolver has no path that could change it.
    expect(BADLANDS_PLAN).toEqual(badlandsSnapshot);
    expect(activeTripIdBefore).toBe(BADLANDS_PLAN.id);
  });
});

describe('Task 9 — needsPlanTarget gate', () => {
  test('REFINEMENT_JOBS + itinerary_patch are the only jobs that need a target', () => {
    expect(needsPlanTarget({ travelerJob: 'itinerary_refinement', understanding: {} })).toBe(true);
    expect(needsPlanTarget({ travelerJob: 'preference_update', understanding: {} })).toBe(true);
    expect(needsPlanTarget({ travelerJob: 'constraint_update', understanding: {} })).toBe(true);
    expect(needsPlanTarget({ travelerJob: 'general_advice', understanding: { requestedArtifact: 'itinerary_patch' } })).toBe(true);
    expect(needsPlanTarget({ travelerJob: 'general_advice', understanding: {} })).toBe(false);
    expect(needsPlanTarget({ travelerJob: 'day_by_day_itinerary', understanding: { requestedArtifact: 'itinerary' } })).toBe(false);
    expect(needsPlanTarget({ travelerJob: 'destination_compare', understanding: {} })).toBe(false);
  });
});

describe('Task 9 — offline/read-only invariants', () => {
  test('never queries a database or calls a model — the module has no such dependency', () => {
    const src = require('fs').readFileSync(require.resolve('../targetTripResolver'), 'utf8');
    expect(src).not.toMatch(/require\(['"]mongoose['"]\)|require\(['"].*\/models\/|TripPlan\.|AnonymousSession\.|\bawait\b/);
  });

  test('is a pure function: same inputs, same output, no observable side effects', () => {
    const intent = intentFor('For my Redwood trip, change Day 2', BADLANDS_PRIOR);
    const args = { intent, candidatePlans: [BADLANDS_PLAN, REDWOOD_PLAN], activeTripId: BADLANDS_PLAN.id };
    expect(resolveTargetTripId(args)).toEqual(resolveTargetTripId(args));
  });

  test('returns not_found rather than a guess when historical_reference names no destination at all (defensive)', () => {
    const out = resolveTargetTripId({
      intent: { travelerJob: 'itinerary_refinement', tripContext: { relationship: 'historical_reference' }, understanding: {} },
      candidatePlans: [BADLANDS_PLAN, REDWOOD_PLAN],
      activeTripId: BADLANDS_PLAN.id,
    });
    expect(out.status).toBe(STATUS.NOT_FOUND);
  });

  // Corrected: verified against the current file that this test's original
  // `candidatePlans` was NON-empty ([BADLANDS_PLAN, REDWOOD_PLAN]) — i.e. it
  // was actually already exercising the "candidates exist, no association"
  // case, which stays not_found (see the new sibling test immediately below
  // asserting exactly that, unchanged). THIS test is rewritten to cover the
  // genuinely-empty case the fix introduces: no active trip, no prior
  // target, AND no candidatePlans at all — the authenticated-unsaved-plan
  // shape (TrailieConversationPlan) that this resolver has no business in.
  test('an ordinary continuation with neither a prior target, an active trip, nor ANY candidatePlans is not_required, not a guess and not a false not_found', () => {
    const out = resolveTargetTripId({
      intent: { travelerJob: 'itinerary_refinement', tripContext: { relationship: 'continuation' }, understanding: {} },
      candidatePlans: [],
      activeTripId: null,
    });
    expect(out.status).toBe(STATUS.NOT_REQUIRED);
    expect(out.reasonCode).toBe('no_persisted_multi_trip_context');
  });

  // NEW — must NOT be weakened by the fix above: candidates genuinely exist,
  // there is just no active/prior-target association telling us which one is
  // current. This is a real "don't know which trip" and stays not_found.
  test('candidates exist but there is no active/prior-target association -> still not_found, never a guess', () => {
    const out = resolveTargetTripId({
      intent: { travelerJob: 'itinerary_refinement', tripContext: { relationship: 'continuation' }, understanding: {} },
      candidatePlans: [BADLANDS_PLAN, REDWOOD_PLAN],
      activeTripId: null,
    });
    expect(out.status).toBe(STATUS.NOT_FOUND);
    expect(out.reasonCode).toBe('no_active_or_prior_target');
  });
});

describe('Task 9 — pure helpers', () => {
  test('findByTitleMention excludes the generic default title', () => {
    const matches = __testables.findByTitleMention(
      [REDWOOD_PLAN_2],
      'change day 2 of my new trip plan'
    );
    expect(matches).toEqual([]);
  });

  test('matchesDestination prefers parkCode over name', () => {
    expect(__testables.matchesDestination(REDWOOD_PLAN, { parkCode: 'redw', name: 'Something Else' })).toBe(true);
    expect(__testables.matchesDestination(REDWOOD_PLAN, { parkCode: 'badl', name: 'Redwood National Park' })).toBe(false);
  });
});
