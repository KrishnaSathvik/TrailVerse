'use strict';

/**
 * REFINEMENT ROUTING + CONTAINMENT (2026-09-02).
 *
 * Live bug (reproduced before any change, artifacts/trailie-refinement-
 * containment-2026-09-02): an accepted guest 3-day Olympic plan followed by
 * "Make day 2 more relaxed." classified `simple_itinerary` and regenerated the
 * ENTIRE plan — Days 1 and 3 rewritten into different park regions, 3 attempts,
 * 125.5s, $0.279 — while the prose claimed only Day 2 changed.
 *
 * ROOT CAUSE: the guest session persists the accepted plan on its assistant
 * messages (`AnonymousSession.messages[].canonicalPlan`), but the route never
 * lifted it into `resolvedMetadata.existingCanonicalPlan`. Every downstream
 * layer (turn understanding's `itinerary_patch`, the traveler-job resolver's
 * refinement jobs, the classifier's artifact floor, the execution service's
 * `usePlanPatch`) is already generic and prior-plan-aware — they were simply
 * never shown the plan on guest continuations.
 *
 * THE FIX is therefore plan AVAILABILITY, not phrase matching: surface the
 * latest persisted assistant canonical plan into the prepared context. These
 * tests pin (1) the plan-lifting helper, (2) the generic routing contract
 * with and without a prior plan, and (3) the bridge wiring that hands the
 * plan to classification and execution.
 */

const { latestCanonicalPlanFromMessages } = require('../../utils/guestConversationPlan');
const { classifyTrailieIntent } = require('../trailieIntentClassifier');
const { resolveTravelerJob } = require('../trailieTravelerJobResolver');
const { buildClassifierPriorTripState } = require('../trailieV2RouteBridge');

const PLAN = Object.freeze({
  days: [
    { dayNumber: 1, stops: [{ name: 'Kalaloch Lodge' }] },
    { dayNumber: 2, stops: [{ name: 'Lake Crescent Lodge' }] },
    { dayNumber: 3, stops: [{ name: 'Hoh Rain Forest Visitor Center' }] },
  ],
});

describe('latestCanonicalPlanFromMessages — the persisted guest plan surfaces', () => {
  test('returns the most recent assistant canonical plan with days', () => {
    const older = { days: [{ dayNumber: 1, stops: [{ name: 'Old Stop' }] }] };
    const messages = [
      { role: 'user', content: 'Plan 3 days in Olympic.' },
      { role: 'assistant', content: 'Here is a plan.', canonicalPlan: older },
      { role: 'user', content: 'Make day 2 more relaxed.' },
      { role: 'assistant', content: 'Updated.', canonicalPlan: PLAN },
      { role: 'user', content: 'Thanks!' },
    ];
    expect(latestCanonicalPlanFromMessages(messages)).toBe(PLAN);
  });

  test('assistant messages without a usable plan are skipped, not treated as plans', () => {
    const messages = [
      { role: 'assistant', content: 'Prose only.', canonicalPlan: PLAN },
      { role: 'assistant', content: 'No plan here.' },
      { role: 'assistant', content: 'Empty plan.', canonicalPlan: { days: [] } },
    ];
    expect(latestCanonicalPlanFromMessages(messages)).toBe(PLAN);
  });

  test('no assistant plan anywhere → null (first turn, or reset conversation)', () => {
    expect(latestCanonicalPlanFromMessages([])).toBeNull();
    expect(latestCanonicalPlanFromMessages(null)).toBeNull();
    expect(latestCanonicalPlanFromMessages([
      { role: 'user', content: 'Plan 3 days in Olympic.' },
      { role: 'assistant', content: 'What dates?' },
    ])).toBeNull();
  });

  test('a user message can never supply the plan', () => {
    expect(latestCanonicalPlanFromMessages([
      { role: 'user', content: 'x', canonicalPlan: PLAN },
    ])).toBeNull();
  });
});

describe('generic refinement routing — existing plan + referenced modification', () => {
  const prior = {
    hasActiveTrip: true,
    hasItinerary: true,
    existingCanonicalPlan: PLAN,
    lastTravelerJob: 'day_by_day_itinerary',
    activeDecision: { kind: 'day_by_day_itinerary', destinationParkCode: 'olym' },
  };

  const classify = (msg, priorTripState = prior) => ({
    intent: classifyTrailieIntent({ userPrompt: msg, priorTripState }).primaryIntent,
    job: resolveTravelerJob({ userPrompt: msg, priorTripState }).job,
  });

  test.each([
    ['Make day 2 more relaxed.'],
    ['Swap the afternoon hike for something easier.'],
    ['Keep day 1, but change day 3.'],
    ['Can we start later tomorrow morning?'],
  ])('refines with an active plan: %s', (msg) => {
    const { intent, job } = classify(msg);
    expect(intent).toBe('trip_refinement');
    expect(job).toBe('itinerary_refinement');
  });

  test('a fresh explicit plan request stays new planning even with an active plan', () => {
    const { intent, job } = classify('Plan me 3 relaxed days in Badlands.');
    expect(intent).toBe('simple_itinerary');
    expect(job).toBe('day_by_day_itinerary');
  });

  test('a hypothetical question stays Q&A even with an active plan', () => {
    const { intent } = classify('What does a relaxed day in Zion look like?');
    expect(intent).toBe('general_qa');
  });

  test('duration deliberation is not an automatic refinement', () => {
    const { intent } = classify('Should I spend 2 or 3 days there?');
    expect(intent).not.toBe('trip_refinement');
  });

  test('a state question about tomorrow is not a mutation, even with an active plan', () => {
    const { intent } = classify('Is the shuttle running tomorrow?');
    expect(intent).not.toBe('trip_refinement');
  });

  test('without a prior plan the same words are NOT a refinement', () => {
    const { intent, job } = classify('Make day 2 more relaxed.', null);
    expect(intent).toBe('simple_itinerary');
    // An ordinal edit cannot create a fresh plan when no plan exists.
    expect(job).toBe('general_advice');
  });
});

describe('bridge wiring — the lifted plan reaches classification and execution state', () => {
  test('resolvedMetadata.existingCanonicalPlan flips hasItinerary and rides into tripState', () => {
    const tripState = buildClassifierPriorTripState({
      resolvedMetadata: { existingCanonicalPlan: PLAN },
      planningState: { lastTravelerJob: 'day_by_day_itinerary' },
    });
    expect(tripState.hasItinerary).toBe(true);
    expect(tripState.hasActiveTrip).toBe(true);
    expect(tripState.existingCanonicalPlan).toBe(PLAN);
  });

  test('without the plan the guest continuation still has no itinerary flag', () => {
    const tripState = buildClassifierPriorTripState({
      planningState: { lastTravelerJob: 'day_by_day_itinerary' },
    });
    expect(tripState.hasItinerary).toBe(false);
  });
});
