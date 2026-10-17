'use strict';

/**
 * Offline regression fixtures for the unified Trailie conversational architecture.
 * Provider isolation is enforced by offlineRepairSetup / deny_live mode.
 */

const { resolveTurnSufficiencyDecision, DECISIONS } = require('../turnSufficiencyDecision');
const { resolveActionTarget } = require('../actionTargetResolution');
const { resolveRefinementScope } = require('../refinementScope');
const { parseTripPushback } = require('../tripPushback');
const { ensureFullItineraryClosing, materialVerification } = require('../visibleItineraryCompleteness');
const { reconcileCanonicalNarrative } = require('../canonicalPlanNarrative');
const { groundedDisplayName } = require('../stopDisplayLabel');
const { invalidateRemovedStopReferences } = require('../invalidateRemovedStopReferences');
const { evaluateItineraryCompleteness } = require('../itineraryCompleteness');
const { isPlanDerivedCurrent, stampPlanDerived } = require('../planDerivedState');
const { buildArtifactNotAppliedMessage, failureCategoryFromCodes } = require('../../services/artifactFulfillment');
const { assessItineraryReadiness } = require('../itineraryReadiness');
const { enrichItineraryParkIdentity } = require('../itineraryParkIdentity');

const undatedPlan = {
  days: [
    { dayNumber: 1, stops: [{ id: 'a', name: 'Museum', type: 'museum', duration: 90 }] },
    { dayNumber: 2, stops: [{ id: 'b', name: 'Park Walk', type: 'walk', duration: 60 }] },
  ],
};

test('simple factual → answer now', () => {
  const d = resolveTurnSufficiencyDecision({
    userText: 'Can I drive to Brooks Falls?',
    requestedArtifact: 'plain_answer',
  });
  expect(d.decision).toBe(DECISIONS.ANSWER_NOW);
  expect(d.clarificationNeeded).toBe(false);
});

test('comparison → answer first', () => {
  const d = resolveTurnSufficiencyDecision({
    userText: 'Acadia or Shenandoah for fall colors?',
    requestedArtifact: 'comparison',
  });
  expect(d.decision).toBe(DECISIONS.ANSWER_AND_REFINE);
});

test('discovery → answer now', () => {
  const d = resolveTurnSufficiencyDecision({
    userText: 'Where should I go in November for desert landscapes?',
    requestedArtifact: 'plain_answer',
  });
  expect(d.decision).toBe(DECISIONS.ANSWER_NOW);
});

test('sparse committed plan needs clarification when material facts are missing', () => {
  const d = resolveTurnSufficiencyDecision({
    userText: 'Give me a three-day trip',
    requestedArtifact: 'itinerary',
    askedToProduceTripArtifact: true,
  });
  expect(d.decision).toBe(DECISIONS.CLARIFY_BEFORE_PLAN);
  expect(d.clarificationNeeded).toBe(true);
  expect(d.materialMissingInformation.some((g) => g.concept === 'destination')).toBe(true);
});

test('same planning request with saved context plans immediately', () => {
  const d = resolveTurnSufficiencyDecision({
    userText: 'Give me three relaxed days',
    requestedArtifact: 'itinerary',
    askedToProduceTripArtifact: true,
    metadata: { parkCode: 'x', parkName: 'Saved Destination' },
    constraints: { dates: { numDays: 3 } },
    priorPlan: undatedPlan,
  });
  expect(d.decision).toBe(DECISIONS.PLAN_NOW);
  expect(d.clarificationNeeded).toBe(false);
});

test('undated tomorrow does not guess day 2', () => {
  const scope = resolveRefinementScope({
    text: "We're exhausted. Simplify tomorrow.",
    priorPlan: undatedPlan,
    now: new Date('2026-09-17T12:00:00Z'),
  });
  expect(scope.resolved).toBe(false);
  expect(scope.reasonCodes).toContain('temporal_target_unresolved');
  expect(scope.dayNumber == null).toBe(true);
});

test('unresolved that reservation asks which reservation', () => {
  const action = resolveActionTarget({
    text: 'Move that reservation to tomorrow.',
    priorPlan: undatedPlan,
    tripState: { planningState: { lodging: { bookings: [
      { id: 'b1', name: 'Downtown Inn' },
      { id: 'b2', name: 'Riverside Lodge' },
    ] } } },
  });
  expect(action.resolved).toBe(false);
  expect(action.clarificationNeeded).toBe(true);
  const scope = resolveRefinementScope({
    text: 'Move that reservation to tomorrow.',
    priorPlan: undatedPlan,
    tripState: { planningState: { lodging: { bookings: [
      { id: 'b1', name: 'Downtown Inn' },
      { id: 'b2', name: 'Riverside Lodge' },
    ] } } },
  });
  expect(scope.resolved).toBe(false);
  expect(scope.reasonCodes).toContain('action_booking_unresolved');
});

test('active-trip context resolves obvious place disambiguation readiness', () => {
  const readiness = assessItineraryReadiness({
    conversationUserText: 'Build my three-day plan',
    metadata: {
      activeTripContext: { primaryDestination: { parkCode: 'acad', name: 'Active Park' } },
    },
    constraints: { dates: { numDays: 3 } },
    askedToProduceTripArtifact: true,
    priorPlan: undatedPlan,
  });
  expect(readiness.ready).toBe(true);
  expect(readiness.decision).toBe(DECISIONS.PLAN_NOW);
});

test('light fatigue/relaxed day is valid', () => {
  const result = evaluateItineraryCompleteness({
    itineraryData: { days: [{ dayNumber: 1, stops: [{ name: 'Local Museum', type: 'museum', duration: 90 }] }] },
    constraints: { pace: 'relaxed' },
    userPrompt: "We're exhausted. Keep today light.",
  });
  expect(result.ok).toBe(true);
  expect(result.reasonCodes).not.toContain('insufficient_day_coverage');
});

test('closure removal does not require filler', () => {
  const result = evaluateItineraryCompleteness({
    itineraryData: {
      days: [
        { dayNumber: 1, stops: [{ name: 'Visitor Center', type: 'visitor_center', duration: 45 }] },
        { dayNumber: 2, stops: [{ name: 'Museum', type: 'museum', duration: 120 }] },
        { dayNumber: 3, stops: [{ name: 'Scenic Drive', type: 'scenic_drive', duration: 90 }] },
      ],
    },
    constraints: {},
    userPrompt: 'The canyon road is closed. Adapt day 1.',
    isRefinement: true,
    priorItineraryData: {
      days: [
        { dayNumber: 1, stops: [{ name: 'Overlook', type: 'viewpoint', duration: 60 }, { name: 'Visitor Center', type: 'visitor_center', duration: 45 }] },
        { dayNumber: 2, stops: [{ name: 'Museum', type: 'museum', duration: 120 }] },
        { dayNumber: 3, stops: [{ name: 'Scenic Drive', type: 'scenic_drive', duration: 90 }] },
      ],
    },
    touchedDayNumbers: [1],
  });
  expect(result.reasonCodes).not.toContain('insufficient_day_coverage');
});

test('removed stop disappears from alternatives/narrative', () => {
  const priorPlan = {
    days: [
      { dayNumber: 1, stops: [{ id: 'museum', name: 'Museum', type: 'museum' }] },
      { dayNumber: 2, stops: [{ id: 'overlook', name: 'Canyon Overlook' }] },
    ],
  };
  const itineraryData = {
    days: [
      { dayNumber: 1, stops: [{ id: 'museum', name: 'Museum', type: 'museum' }] },
      { dayNumber: 2, stops: [{ id: 'patio', name: 'Patio', type: 'viewpoint' }] },
    ],
    alternatives: [{ name: 'Library', parent: 'Museum' }, { name: 'Patio', parent: 'Canyon Overlook' }],
    narrativeSections: [{ markdown: 'Visit Canyon Overlook tomorrow.' }],
  };
  const result = invalidateRemovedStopReferences({ priorPlan, itineraryData, text: 'Visit Canyon Overlook.' });
  expect(JSON.stringify(result)).not.toContain('Canyon Overlook');
});

test('city POI does not inherit national-park identity by name similarity', () => {
  const itineraryData = {
    days: [{ label: 'City day', stops: [{ name: 'Olympic Sculpture Park', parkCode: 'olym', parkName: 'Olympic National Park' }] }],
  };
  const result = enrichItineraryParkIdentity({ itineraryData, resolvedMetadata: { parkCode: 'olym' } }).itineraryData;
  expect(result.days[0].stops[0].parkCode).toBeNull();
});

test('pushback has no You asked wrapper', () => {
  const result = parseTripPushback({
    completionStatus: 'completed',
    toolCalls: [{
      name: 'recommend_trip_revision',
      input: {
        reason: 'insufficient_time',
        explanation: 'There is too little time for all those transfers and meaningful visits across four parks.',
        recommendation: 'Consider two parks instead.',
      },
    }],
  }, 'Yellowstone, Grand Teton, Glacier and Banff in five days.');
  expect(result.ok).toBe(true);
  expect(result.text).not.toMatch(/You asked:/i);
  expect(result.text.startsWith('There is too little time')).toBe(true);
});

test('generic itinerary tail omitted; specific meaningful tail retained', () => {
  const bare = ensureFullItineraryClosing({
    parkName: 'Example Destination',
    intro: 'A short trip.',
    days: [{ dayNumber: 1, stops: [{ name: 'Museum', type: 'museum', duration: 90 }] }],
  });
  expect((bare.narrativeSections || []).filter((s) => s.placement === 'after_plan')).toHaveLength(0);

  const withPermit = ensureFullItineraryClosing({
    parkName: 'Example Destination',
    intro: 'A short trip.',
    days: [{ dayNumber: 1, stops: [{ name: 'Trailhead', type: 'hike', duration: 90, note: 'Timed-entry permit required.' }] }],
  });
  const after = (withPermit.narrativeSections || []).filter((s) => s.placement === 'after_plan');
  expect(after).toHaveLength(1);
  expect(after[0].markdown).toMatch(/permit|reservation/i);
  expect(materialVerification(withPermit)).toBeTruthy();
});

test('failed edit uses traveler-relevant reason', () => {
  expect(failureCategoryFromCodes(['action_booking_unresolved'])).toBe('target_unresolved');
  const msg = buildArtifactNotAppliedMessage('', {
    planShown: false,
    reasonCodes: ['no_eligible_repair_candidate'],
  });
  expect(msg).toMatch(/saved plan has not been changed/i);
  expect(msg).not.toMatch(/validator|reasonCode|HTTP/i);
  expect(msg).toMatch(/suitable replacement/i);
});

test('prose cannot mention unsaved stop; empty changedDays cannot narrate rewrite', () => {
  const plan = {
    days: [{ dayNumber: 1, stops: [{ name: 'Museum', type: 'museum' }] }],
    intro: 'We rebuilt the whole itinerary around Hidden Falls overlook hike.',
  };
  const result = reconcileCanonicalNarrative({
    itineraryData: plan,
    text: plan.intro,
    evidenceBundle: {
      evidence: [{ topic: 'activities', claim: { normalizedValue: { name: 'Hidden Falls' } } }],
    },
    changedDays: [],
  });
  expect(result.regenerated).toBe(true);
  expect(result.text).toContain('Museum');
  expect(result.text).not.toContain('Hidden Falls');
});

test('display label does not mutate canonical identity', () => {
  const labels = groundedDisplayName({
    canonicalName: 'Official Long Interpretive Title of the Overlook',
    evidenceTitle: 'Overlook',
  });
  expect(labels.canonicalName).toBe('Official Long Interpretive Title of the Overlook');
  expect(labels.displayName).toBe('Overlook');
});

test('known meaningful drive is available to presentation via derived stamp', () => {
  const logistics = stampPlanDerived({
    legs: [{ from: 'A', to: 'B', mode: 'drive', minutes: 95 }],
  }, 'hash-1');
  expect(isPlanDerivedCurrent(logistics, 'hash-1')).toBe(true);
  expect(logistics.legs[0].minutes).toBe(95);
});

test('derived artifacts cannot cross plan hashes', () => {
  const logistics = stampPlanDerived({ drives: [{ minutes: 40 }] }, 'hash-old');
  expect(isPlanDerivedCurrent(logistics, 'hash-new')).toBe(false);
});
