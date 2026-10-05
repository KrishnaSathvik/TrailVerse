'use strict';

const mongoose = require('mongoose');
const AnonymousSession = require('../AnonymousSession');
const TripPlan = require('../TripPlan');

const travelLogistics = {
  schemaVersion: 'travel-logistics-v1',
  gettingThere: {
    status: 'complete',
    routes: [{ origin: 'Bozeman', destination: 'Yellowstone' }],
  },
  stays: {
    status: 'partial',
    regions: [{ name: 'West Yellowstone' }],
  },
};

const intent = {
  primaryIntent: 'full_trip',
  verticals: ['itinerary', 'flights'],
  reasonCodes: ['explicit_itinerary_request'],
  depth: 'planning',
};

const presentation = {
  schemaVersion: 1,
  presentationKind: 'itinerary',
  refinement: { isRefinement: false, changes: [] },
  primaryArtifact: { kind: 'itinerary', source: 'canonicalPlan' },
  supportingModules: [],
  prosePolicy: 'supplemental_only',
  ending: { caveat: null, beforeYouGo: null, followups: [] },
};

describe('travelLogistics embedded-message persistence', () => {
  test('TripPlan conversation retains the schema-versioned object', () => {
    const trip = new TripPlan({
      userId: new mongoose.Types.ObjectId(),
      conversation: [{
        id: 1,
        role: 'assistant',
        content: 'Use Bozeman as your gateway.',
        travelLogistics,
        intent,
        presentation,
      }],
    });

    expect(trip.conversation[0].travelLogistics).toEqual(travelLogistics);
    expect(trip.toObject().conversation[0].travelLogistics).toEqual(travelLogistics);
    expect(trip.toObject().conversation[0].intent).toEqual(intent);
    expect(trip.toObject().conversation[0].presentation).toEqual(presentation);
  });

  test('AnonymousSession completed history retains the schema-versioned object', () => {
    const canonicalPlan = {
      parkName: 'Yellowstone National Park',
      days: [{ dayNumber: 1, stops: [{ name: 'Old Faithful' }] }],
    };
    const session = new AnonymousSession({
      anonymousId: 'anon-logistics-round-trip',
      ipAddress: '127.0.0.1',
      userAgent: 'test',
      browserFingerprint: 'test-fingerprint',
      messages: [{
        role: 'assistant',
        content: 'Stay near the west entrance.',
        travelLogistics,
        canonicalPlan,
        itineraryHash: 'itinerary-hash',
        intent,
        presentation,
      }],
      turns: [{
        turnId: 'turn-1',
        clientTurnId: 'client-turn-1',
        status: 'completed',
        admittedAt: new Date(),
        completedAt: new Date(),
        userMessage: { role: 'user', content: 'Where should I stay?' },
        assistantMessage: {
          role: 'assistant',
          content: 'Stay near the west entrance.',
          travelLogistics,
          canonicalPlan,
          itineraryHash: 'itinerary-hash',
          intent,
          presentation,
        },
      }],
    });

    const stored = session.toObject();
    expect(stored.messages[0].travelLogistics).toEqual(travelLogistics);
    expect(stored.turns[0].assistantMessage.travelLogistics).toEqual(travelLogistics);
    expect(stored.messages[0].canonicalPlan).toEqual(canonicalPlan);
    expect(stored.turns[0].assistantMessage.canonicalPlan).toEqual(canonicalPlan);
    expect(stored.messages[0].itineraryHash).toBe('itinerary-hash');
    expect(stored.messages[0].intent).toEqual(intent);
    expect(stored.turns[0].assistantMessage.presentation).toEqual(presentation);
  });
});
