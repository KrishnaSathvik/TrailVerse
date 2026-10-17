'use strict';

/**
 * WP-TU Phase 3 Task 8B — `activeTripPresentation` (Task 7B's additive field)
 * must be declared on the SAME conversation/message subdocument schemas that
 * already round-trip `intent`/`presentation` — Mongoose silently strips any
 * field not declared on the schema, regardless of what every write site
 * sends. Same convention as `travelLogisticsPersistence.test.js`.
 */

const mongoose = require('mongoose');
const AnonymousSession = require('../AnonymousSession');
const TripPlan = require('../TripPlan');

const activeTripPresentation = {
  destination: { parkCode: 'badl', parkName: 'Badlands National Park' },
  activeContextAction: 'set',
};

describe('activeTripPresentation embedded-message persistence (Task 8B)', () => {
  test('TripPlan conversation retains activeTripPresentation', () => {
    const trip = new TripPlan({
      userId: new mongoose.Types.ObjectId(),
      conversation: [{
        id: 1,
        role: 'assistant',
        content: 'Actually plan Badlands instead.',
        activeTripPresentation,
      }],
    });

    expect(trip.conversation[0].activeTripPresentation).toEqual(activeTripPresentation);
    expect(trip.toObject().conversation[0].activeTripPresentation).toEqual(activeTripPresentation);
  });

  test('AnonymousSession completed history AND the turn ledger both retain activeTripPresentation', () => {
    const session = new AnonymousSession({
      anonymousId: 'anon-active-trip-presentation-round-trip',
      ipAddress: '127.0.0.1',
      userAgent: 'test',
      browserFingerprint: 'test-fingerprint',
      messages: [{
        role: 'assistant',
        content: 'Actually plan Badlands instead.',
        activeTripPresentation,
      }],
      turns: [{
        turnId: 'turn-1',
        clientTurnId: 'client-turn-1',
        status: 'completed',
        admittedAt: new Date(),
        completedAt: new Date(),
        userMessage: { role: 'user', content: 'Actually plan Badlands instead' },
        assistantMessage: {
          role: 'assistant',
          content: 'Actually plan Badlands instead.',
          activeTripPresentation,
        },
      }],
    });

    const stored = session.toObject();
    expect(stored.messages[0].activeTripPresentation).toEqual(activeTripPresentation);
    expect(stored.turns[0].assistantMessage.activeTripPresentation).toEqual(activeTripPresentation);
  });

  // Old conversations (pre-8B) — no activeTripPresentation on any subdocument.
  // Mongoose reading/constructing a document against a schema with one MORE
  // optional Mixed field must be a complete non-event: no migration, no error.
  test('old-record safety: a TripPlan conversation with no activeTripPresentation deserializes cleanly', () => {
    const trip = new TripPlan({
      userId: new mongoose.Types.ObjectId(),
      conversation: [{
        id: 1,
        role: 'assistant',
        content: 'A pre-Task-8B message.',
        parkName: 'Glacier National Park',
      }],
    });

    expect(() => trip.toObject()).not.toThrow();
    expect(trip.toObject().conversation[0].activeTripPresentation).toBeUndefined();
    expect(trip.toObject().conversation[0].parkName).toBe('Glacier National Park');
  });

  test('old-record safety: an AnonymousSession with no activeTripPresentation deserializes cleanly', () => {
    const session = new AnonymousSession({
      anonymousId: 'anon-old-record-safety',
      ipAddress: '127.0.0.1',
      userAgent: 'test',
      browserFingerprint: 'test-fingerprint',
      messages: [{ role: 'assistant', content: 'A pre-Task-8B message.', parkName: 'Glacier National Park' }],
      turns: [{
        turnId: 'turn-1',
        clientTurnId: 'client-turn-1',
        status: 'completed',
        admittedAt: new Date(),
        completedAt: new Date(),
        userMessage: { role: 'user', content: 'hi' },
        assistantMessage: { role: 'assistant', content: 'A pre-Task-8B message.', parkName: 'Glacier National Park' },
      }],
    });

    expect(() => session.toObject()).not.toThrow();
    const stored = session.toObject();
    expect(stored.messages[0].activeTripPresentation).toBeUndefined();
    expect(stored.turns[0].assistantMessage.activeTripPresentation).toBeUndefined();
    expect(stored.messages[0].parkName).toBe('Glacier National Park');
  });
});
