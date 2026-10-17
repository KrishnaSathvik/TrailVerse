'use strict';

/**
 * LIVE REGRESSION (2026-09-08 Phase 6 live acceptance pass).
 *
 * Live failure, reproduced with the coordinator's own suggested wording:
 * "Fix Day 2, it is too much driving." against an ACTIVE plan classified as
 * `general_qa` / `trip_duration_advice` instead of a refinement — identical
 * for "Adjust Day 2, it is too much driving." and "Change Day 2, it is too
 * much driving.", proving this was never about the "fix" verb (see the
 * 2026-09-04 turnUnderstanding.js REFINEMENT_FAMILY fix, unrelated).
 *
 * ROOT CAUSE: trailieTravelerJobResolver.js's `DURATION_ADVICE` phrase check
 * (`\b(?:is|are|would)\b.{0,48}\btoo (?:short|long|much)\b`) sat AHEAD of the
 * `turn.requestedArtifact === 'itinerary_patch'` check in the resolver
 * ladder. "it is too much driving" trips DURATION_ADVICE's bare grammar, so
 * the ladder returned `trip_duration_advice` before ever reading the
 * artifact-frame resolver's ALREADY-CORRECT verdict — turnUnderstanding.js's
 * `resolveRefinementIntent` (utils/refinementSemantics.js) had already
 * determined `requestedArtifact: 'itinerary_patch'` for this exact message,
 * from the SAME "too much driving" text plus the "Day 2" plan-local
 * reference (MODIFICATION_DIMENSIONS.difficulty + DAY_REFERENCE) — a real
 * mutation request, not a question.
 *
 * FIX: a GATE, not a reorder or a new lexical exception. DURATION_ADVICE
 * only fires when `turn.requestedArtifact !== 'itinerary_patch'`. An
 * ordinary duration QUESTION never resolves to `itinerary_patch` in the
 * first place (no day/plan-local reference for the artifact resolver to
 * bind modification intent to — see the "STILL DURATION ADVICE" block
 * below), so the gate is inert for every case duration advice already
 * needed to own.
 */

const { classifyTrailieIntent } = require('../trailieIntentClassifier');
const { resolveTravelerJob } = require('../trailieTravelerJobResolver');

const YELLOWSTONE_ACTIVE = { primaryDestination: { parkCode: 'yell', name: 'Yellowstone' }, hasItinerary: true };

function classify(userPrompt, priorTripState) {
  return {
    intent: classifyTrailieIntent({ userPrompt, priorTripState }),
    job: resolveTravelerJob({ userPrompt, priorTripState }).job,
  };
}

describe('DURATION_ADVICE vs plan-mutation gate — the "too much driving" collision', () => {
  describe('positive: plan-scoped mutation phrasing outranks DURATION_ADVICE (active plan)', () => {
    test.each([
      ['Fix Day 2, it is too much driving.'],
      ['Adjust Day 2, it is too much driving.'],
      ['Change Day 2, it is too much driving.'],
      ['Make Day 3 easier, it is too much hiking.'],
    ])('%s -> itinerary_refinement / trip_refinement', (msg) => {
      const { intent, job } = classify(msg, YELLOWSTONE_ACTIVE);
      expect(job).toBe('itinerary_refinement');
      expect(intent.travelerJob).toBe('itinerary_refinement');
      expect(intent.primaryIntent).toBe('trip_refinement');
    });
  });

  describe('negative: genuine duration questions stay duration advice (active plan)', () => {
    test.each([
      ['Is 3 days too much for Yellowstone?'],
      ['Would 5 days be too long?'],
      // "duration advice unless the turn actually requests a mutation" — no
      // day/plan-local reference here, so it never becomes itinerary_patch.
      ['Is this trip too short?'],
    ])('%s -> trip_duration_advice, NOT a refinement', (msg) => {
      const { intent, job } = classify(msg, YELLOWSTONE_ACTIVE);
      expect(job).toBe('trip_duration_advice');
      expect(intent.travelerJob).toBe('trip_duration_advice');
      expect(intent.primaryIntent).not.toBe('trip_refinement');
    });
  });

  describe('negative: genuine duration questions stay duration advice (no active plan)', () => {
    test.each([
      ['Is 3 days too much for Zion?'],
      ['How many days do I need in Yosemite?'],
    ])('%s -> trip_duration_advice', (msg) => {
      const { intent, job } = classify(msg, null);
      expect(job).toBe('trip_duration_advice');
      expect(intent.travelerJob).toBe('trip_duration_advice');
    });
  });

  describe('preserved behavior, unrelated to this gate', () => {
    test('a fresh explicit build stays a fresh build (no active plan)', () => {
      const { intent, job } = classify('Plan me 3 days in Zion.', null);
      expect(job).toBe('day_by_day_itinerary');
      expect(intent.tripContext.activeContextAction).toBe('set');
    });

    test('"Adjust Day 3." / "Change Day 3." (active plan) stay refinements, unchanged', () => {
      for (const msg of ['Adjust Day 3.', 'Change Day 3.']) {
        const { intent, job } = classify(msg, YELLOWSTONE_ACTIVE);
        expect(job).toBe('itinerary_refinement');
        expect(intent.primaryIntent).toBe('trip_refinement');
      }
    });

    // 2026-09-04 fix, must still hold: "fix" only counts as a refinement
    // verb next to a plan-local reference, never bare.
    test('bare "fix" never implies refinement, with or without an active plan', () => {
      expect(classify('How do I fix jet lag?', null).intent.primaryIntent).toBe('general_qa');
      expect(classify('How do I fix jet lag?', YELLOWSTONE_ACTIVE).intent.primaryIntent).toBe('general_qa');
      expect(classify('How can I fix a flat tire?', YELLOWSTONE_ACTIVE).intent.primaryIntent).toBe('general_qa');
    });
  });
});
