'use strict';

/**
 * WP-TU Phase 2 Task 4A — a fresh, explicit multi-destination BUILD request
 * ("Plan Yellowstone and Grand Teton.", "Plan a Yellowstone and Grand Teton
 * road trip.") must resolve as `day_by_day_itinerary` / `set`, not
 * `general_advice` / `preserve`.
 *
 * Root cause: `resolveArtifactIntent`'s `TRIP_ARTIFACT_OBJECT` regex requires
 * the artifact noun (trip/itinerary/plan/vacation/getaway) to sit
 * IMMEDIATELY after the verb + optional article — no gap for destination
 * names in between. Fix: one new disjunct in `explicitFreshItineraryRequest`,
 * driven by the ALREADY-COMPUTED `destinationRelationship` (threaded in from
 * `buildTurnUnderstanding`, not re-derived), gated by the SAME
 * `PLAN_VERB_CIRCUMSTANCE_OBJECT` guard the existing disjuncts already use.
 *
 * This suite pins the coordinator's 9-prompt trace (6 mandatory rows + 3
 * informational residual-gap prompts, recorded not chased) plus the full
 * Task 3 -> Task 4 -> Task 4A wiring assertion through the real tripScope
 * sync.
 */

const { classifyTrailieIntent } = require('../trailieIntentClassifier');
const { __testables } = require('../trailieV2ExecutionService');

function classifyNoPriorTrip(userPrompt) {
  return classifyTrailieIntent({ userPrompt, priorTripState: null });
}

describe('Task 4A — multi-destination build classification (mandatory acceptance table)', () => {
  test('"Plan Yellowstone and Grand Teton." -> day_by_day_itinerary / new / set', () => {
    const i = classifyNoPriorTrip('Plan Yellowstone and Grand Teton.');
    expect(i.travelerJob).toBe('day_by_day_itinerary');
    expect(i.tripContext).toEqual({ relationship: 'new', activeContextAction: 'set' });
  });

  test('"Plan a Yellowstone and Grand Teton road trip." -> day_by_day_itinerary / new / set', () => {
    const i = classifyNoPriorTrip('Plan a Yellowstone and Grand Teton road trip.');
    expect(i.travelerJob).toBe('day_by_day_itinerary');
    expect(i.tripContext).toEqual({ relationship: 'new', activeContextAction: 'set' });
  });

  test('"Create a road trip through Zion and Bryce Canyon." stays day_by_day_itinerary / set (already correct, must not regress)', () => {
    const i = classifyNoPriorTrip('Create a road trip through Zion and Bryce Canyon.');
    expect(i.travelerJob).toBe('day_by_day_itinerary');
    expect(i.tripContext.activeContextAction).toBe('set');
  });

  test('"Yellowstone or Grand Teton for October?" stays destination_compare / preserve (must not regress)', () => {
    const i = classifyNoPriorTrip('Yellowstone or Grand Teton for October?');
    expect(i.travelerJob).toBe('destination_compare');
    expect(i.tripContext.activeContextAction).toBe('preserve');
  });

  test('"Can I visit Yellowstone and Grand Teton in October?" stays general_advice / preserve (must not regress)', () => {
    const i = classifyNoPriorTrip('Can I visit Yellowstone and Grand Teton in October?');
    expect(i.travelerJob).toBe('general_advice');
    expect(i.tripContext.activeContextAction).toBe('preserve');
  });

  test('"How should I plan around crowds at Yellowstone and Grand Teton?" stays general_advice / preserve (PLAN_VERB_CIRCUMSTANCE_OBJECT guard must hold)', () => {
    const i = classifyNoPriorTrip('How should I plan around crowds at Yellowstone and Grand Teton?');
    expect(i.travelerJob).toBe('general_advice');
    expect(i.tripContext.activeContextAction).toBe('preserve');
  });

  // "Which is better, Zion or Bryce?" — same family as the compare row above,
  // pinned separately since it has no produce verb at all (an independent
  // reason the new disjunct can never fire for it).
  test('"Which is better, Zion or Bryce?" stays destination_compare / preserve (must not regress)', () => {
    const i = classifyNoPriorTrip('Which is better, Zion or Bryce?');
    expect(i.travelerJob).toBe('destination_compare');
    expect(i.tripContext.activeContextAction).toBe('preserve');
  });
});

describe('Task 4A — known residual gaps (informational, not chased per coordinator instruction)', () => {
  test('"Build me a Yellowstone + Grand Teton trip." is NOT fixed by this change — "+" does not resolve as a combine/route relationship', () => {
    const i = classifyNoPriorTrip('Build me a Yellowstone + Grand Teton trip.');
    expect(i.understanding.destinationRelationship).toBe('unknown');
    expect(i.travelerJob).toBe('general_advice');
    expect(i.tripContext.activeContextAction).toBe('preserve');
  });

  test('"Let\'s do Yellowstone and Grand Teton instead." is NOT fixed by this change — "do" is not a produce verb', () => {
    const i = classifyNoPriorTrip("Let's do Yellowstone and Grand Teton instead.");
    expect(i.travelerJob).toBe('general_advice');
    expect(i.tripContext.activeContextAction).toBe('preserve');
  });
});

describe('Task 4A — full Task 3 -> Task 4 -> Task 4A wiring assertion', () => {
  test('no active trip -> "Plan a Yellowstone and Grand Teton road trip." -> set -> tripScope carries BOTH destinations', () => {
    const intent = classifyNoPriorTrip('Plan a Yellowstone and Grand Teton road trip.');
    expect(intent.tripContext.activeContextAction).toBe('set');

    const tripScope = __testables.syncTripScopeDestinationFromIntent(null, intent);
    expect(tripScope.type).toBe('road_trip');
    expect(tripScope.destinations.map((d) => d.parkCode)).toEqual(['yell', 'grte']);
    expect(tripScope.destinations.map((d) => d.displayName)).toEqual(['Yellowstone', 'Grand Teton']);
  });
});
