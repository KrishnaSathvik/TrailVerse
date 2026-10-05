'use strict';

/**
 * 11A.4 — offline proof that exact demo Q5 is a canonical refinement when an
 * accepted Q4 Zion plan is already active. No refinement-logic source change
 * belongs in this file; it only classifies/contracts the exact wording.
 */

const { classifyTrailieIntent } = require('../trailieIntentClassifier');
const { buildTurnUnderstanding } = require('../turnUnderstanding');
const { resolveTargetTripId } = require('../targetTripResolver');
const { resolveRefinementIntent } = require('../../utils/refinementSemantics');

const Q5 =
  'Actually make it more relaxed, avoid shuttle-heavy parts if possible, and add one good sunset spot.';

const Q4_CANONICAL_PLAN = Object.freeze({
  schemaVersion: 1,
  parkName: 'Zion National Park',
  parkCode: 'zion',
  days: [
    {
      dayNumber: 1,
      title: 'Scenic easy day',
      stops: [{ name: "Pa'rus Trail", placeId: 'parus-trail' }],
    },
    {
      dayNumber: 2,
      title: 'Overlook day',
      stops: [{ name: 'Canyon Overlook', placeId: 'canyon-overlook' }],
    },
  ],
});

const Q4_ACTIVE_STATE = Object.freeze({
  hasActiveTrip: true,
  hasItinerary: true,
  lastTravelerJob: 'day_by_day_itinerary',
  activeDecision: { kind: 'day_by_day_itinerary', destinationParkCode: 'zion' },
  primaryDestination: { parkCode: 'zion', name: 'Zion National Park' },
  existingCanonicalPlan: Q4_CANONICAL_PLAN,
  canonicalPlan: Q4_CANONICAL_PLAN,
  travelerPreferences: {
    party: 'couple',
    scenic: true,
    hiking: 'easy-to-moderate',
    avoidExposure: true,
    durationDays: 2,
  },
});

describe('11A.4 exact Q5 against an accepted Q4 Zion canonical plan', () => {
  test('classifies as a canonical itinerary patch of the active Zion plan', () => {
    const understanding = buildTurnUnderstanding({
      userPrompt: Q5,
      priorTripState: Q4_ACTIVE_STATE,
    });
    const intent = classifyTrailieIntent({
      userPrompt: Q5,
      priorTripState: Q4_ACTIVE_STATE,
    });
    const refinement = resolveRefinementIntent({
      text: Q5,
      priorPlan: Q4_CANONICAL_PLAN,
      hasPriorPlan: true,
    });
    const target = resolveTargetTripId({
      intent,
      candidatePlans: [{
        id: 'zion-q4-accepted',
        parkCode: 'zion',
        title: 'Zion weekend',
      }],
      activeTripId: 'zion-q4-accepted',
      userMessage: Q5,
    });

    const presentationIsRefinement = intent.primaryIntent === 'trip_refinement'
      || intent.executionContract.patchRequested === true;

    expect(intent.travelerJob).toBe('itinerary_refinement');
    expect(intent.primaryIntent).toBe('trip_refinement');
    expect(intent.requestedArtifact).toBe('itinerary_patch');
    expect(intent.structurePolicy).toBe('required');
    expect(intent.executionContract.allowsCanonicalPlanArtifact).toBe(true);
    expect(intent.executionContract.requiresCanonicalPlanArtifact).toBe(true);
    expect(intent.executionContract.patchRequested).toBe(true);
    expect(intent.executionContract.patchExecutable).toBe(true);
    expect(intent.executionContract.reasonCodes).not.toContain('legacy_artifact_escalation_blocked');
    expect(understanding.requestedArtifact).toBe('itinerary_patch');
    expect(target.status).toBe('resolved');
    expect(target.targetTripId).toBe('zion-q4-accepted');
    expect(presentationIsRefinement).toBe(true);
    expect(refinement.isRefinement || intent.requestedArtifact === 'itinerary_patch').toBe(true);
  });

  test('the same Q5 wording is not a refinement when no accepted plan exists', () => {
    const intent = classifyTrailieIntent({ userPrompt: Q5, priorTripState: null });
    expect(intent.requestedArtifact).not.toBe('itinerary_patch');
    expect(intent.executionContract.patchExecutable).toBe(false);
  });
});
