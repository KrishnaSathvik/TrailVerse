'use strict';

/**
 * WP-TU Phase 4 Task 10 — `targetTripId` (Task 9's resolved plan-mutation
 * target) must be declared on the SAME conversation/message subdocument
 * schemas that already round-trip `activeTripPresentation` (Task 8B) —
 * Mongoose silently strips any field not declared on the schema. Same
 * convention as `activeTripPresentationPersistence.test.js`.
 */

const mongoose = require('mongoose');
const AnonymousSession = require('../AnonymousSession');
const TripPlan = require('../TripPlan');

const TARGET_TRIP_ID = 'trip-redw-1';

describe('targetTripId embedded-message persistence (Task 10)', () => {
  test('TripPlan conversation retains targetTripId', () => {
    const trip = new TripPlan({
      userId: new mongoose.Types.ObjectId(),
      conversation: [{
        id: 1,
        role: 'assistant',
        content: 'Actually plan Badlands instead.',
        targetTripId: TARGET_TRIP_ID,
      }],
    });

    expect(trip.conversation[0].targetTripId).toBe(TARGET_TRIP_ID);
    expect(trip.toObject().conversation[0].targetTripId).toBe(TARGET_TRIP_ID);
  });

  test('AnonymousSession completed history AND the turn ledger both retain targetTripId', () => {
    const session = new AnonymousSession({
      anonymousId: 'anon-target-trip-id-round-trip',
      ipAddress: '127.0.0.1',
      userAgent: 'test',
      browserFingerprint: 'test-fingerprint',
      messages: [{
        role: 'assistant',
        content: 'For my Redwood trip, change Day 2.',
        targetTripId: TARGET_TRIP_ID,
      }],
      turns: [{
        turnId: 'turn-1',
        clientTurnId: 'client-turn-1',
        status: 'completed',
        admittedAt: new Date(),
        completedAt: new Date(),
        userMessage: { role: 'user', content: 'For my Redwood trip, change Day 2' },
        assistantMessage: {
          role: 'assistant',
          content: 'For my Redwood trip, change Day 2.',
          targetTripId: TARGET_TRIP_ID,
        },
      }],
    });

    const stored = session.toObject();
    expect(stored.messages[0].targetTripId).toBe(TARGET_TRIP_ID);
    expect(stored.turns[0].assistantMessage.targetTripId).toBe(TARGET_TRIP_ID);
  });

  // Old conversations (pre-Task-10) — no targetTripId on any subdocument.
  // Mongoose reading/constructing a document against a schema with one MORE
  // optional field must be a complete non-event: no migration, no error.
  test('old-record safety: a TripPlan conversation with no targetTripId deserializes cleanly', () => {
    const trip = new TripPlan({
      userId: new mongoose.Types.ObjectId(),
      conversation: [{ id: 1, role: 'assistant', content: 'A pre-Task-10 message.' }],
    });

    expect(() => trip.toObject()).not.toThrow();
    expect(trip.toObject().conversation[0].targetTripId).toBeUndefined();
  });

  test('old-record safety: an AnonymousSession with no targetTripId deserializes cleanly', () => {
    const session = new AnonymousSession({
      anonymousId: 'anon-old-record-safety-task10',
      ipAddress: '127.0.0.1',
      userAgent: 'test',
      browserFingerprint: 'test-fingerprint',
      messages: [{ role: 'assistant', content: 'A pre-Task-10 message.' }],
      turns: [{
        turnId: 'turn-1',
        clientTurnId: 'client-turn-1',
        status: 'completed',
        admittedAt: new Date(),
        completedAt: new Date(),
        userMessage: { role: 'user', content: 'hi' },
        assistantMessage: { role: 'assistant', content: 'A pre-Task-10 message.' },
      }],
    });

    expect(() => session.toObject()).not.toThrow();
    const stored = session.toObject();
    expect(stored.messages[0].targetTripId).toBeUndefined();
    expect(stored.turns[0].assistantMessage.targetTripId).toBeUndefined();
  });
});
