'use strict';

const { buildGuestTripMigrationPayload, selectGuestCanonicalPlanForMigration } = require('../guestCanonicalPlanMigration');
const { hashPayload } = require('../canonicalResponse');

describe('guest canonical plan migration', () => {
  test('recovers a model-first plan previously wrapped in storage metadata without changing its hash', () => {
    const { buildPlanDocument } = require('../trailiePipelineUtils');
    const payload = { canonicalContract: 'trailie.itinerary.v2', parkName: 'Offline park', days: [{ dayNumber: 1, stops: [{ name: 'Known stop' }] }] };
    const identity = { responseId: 'wrapped', responseVersion: 1, itineraryHash: hashPayload(payload), contentHash: hashPayload('Ready') };
    const result = buildGuestTripMigrationPayload({ session: { messages: [{ role: 'assistant', content: 'Ready', ...identity,
      canonicalPlan: buildPlanDocument({ itineraryData: payload, identity }) }] }, userId: 'owner' });
    expect(result.plan.itineraryHash).toBe(identity.itineraryHash);
    expect(result.plan.days).toEqual(payload.days);
  });
  test('selects the latest valid owned canonical revision', () => {
    const itinerary1 = { days: [{ day: 1 }] };
    const itinerary2 = { days: [{ day: 1 }, { day: 2 }] };
    const messages = [
      { role: 'assistant', content: 'one', responseId: 'r1', responseVersion: 1, responseRevision: 2, itineraryHash: hashPayload(itinerary1), canonicalPlan: itinerary1 },
      { role: 'assistant', content: 'two early', responseId: 'r2', responseVersion: 2, responseRevision: 1, itineraryHash: hashPayload(itinerary2), canonicalPlan: itinerary2 },
      { role: 'assistant', content: 'two terminal', responseId: 'r2', responseVersion: 2, responseRevision: 2, itineraryHash: hashPayload(itinerary2), canonicalPlan: itinerary2 },
    ];

    expect(selectGuestCanonicalPlanForMigration(messages)).toMatchObject({
      responseId: 'r2', responseVersion: 2, responseRevision: 2, itineraryHash: hashPayload(itinerary2), days: itinerary2.days,
    });
  });

  test('rejects a plan whose response identity does not match its message owner', () => {
    const messages = [{
      role: 'assistant', content: 'bad', responseId: 'message', responseVersion: 1, responseRevision: 2, itineraryHash: 'wrong-hash',
      canonicalPlan: { days: [{ day: 1 }] },
    }];
    expect(selectGuestCanonicalPlanForMigration(messages)).toBeNull();
  });

  test('rejects a plan when a stored content hash disagrees with its owning response', () => {
    const canonicalPlan = { days: [{ day: 1 }] };
    expect(selectGuestCanonicalPlanForMigration([{
      role: 'assistant', content: 'visible terminal response', contentHash: hashPayload('different response'),
      responseId: 'r1', responseVersion: 1, responseRevision: 2,
      itineraryHash: hashPayload(canonicalPlan), canonicalPlan,
    }])).toBeNull();
  });

  test('builds a converted TripPlan with conversation, planning decision, and top-level plan ownership', () => {
    const canonicalPlan = { days: [{ day: 1 }, { day: 2 }] };
    const itineraryHash = hashPayload(canonicalPlan);
    const session = {
      parkName: 'Yellowstone National Park', parkCode: 'yell', formData: { groupSize: 2 },
      planningState: { lastTravelerJob: 'day_by_day_itinerary', activeDecision: { kind: 'day_by_day_itinerary' } },
      entryContext: { version: 1, source: 'compare', comparisonTargets: [{ parkCode: 'yell', name: 'Yellowstone National Park' }] },
      lastActivity: new Date('2026-08-13T12:00:00Z'),
      messages: [
        { role: 'user', content: 'Build two days', timestamp: new Date() },
        { role: 'assistant', content: 'Here is the plan', responseId: 'r2', responseVersion: 2, responseRevision: 2, itineraryHash, canonicalPlan },
      ],
    };
    const payload = buildGuestTripMigrationPayload({ session, userId: 'user-1' });
    expect(payload.plan).toMatchObject({ responseId: 'r2', responseVersion: 2, responseRevision: 2, itineraryHash, parkCode: 'yell', parkName: 'Yellowstone National Park', days: canonicalPlan.days });
    expect(payload.conversation[1].canonicalPlan).toEqual(canonicalPlan);
    expect(payload.planningState.activeDecision.kind).toBe('day_by_day_itinerary');
    expect(payload.entryContext.source).toBe('compare');
    expect(payload.summary.hasPlan).toBe(true);
  });
});
