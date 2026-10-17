'use strict';

const mongoose = require('mongoose');
const TripPlan = require('../../models/TripPlan');
const AnonymousSession = require('../../models/AnonymousSession');
const { buildCanonicalTrailieResponse } = require('../../utils/canonicalResponse');
const { prepareCanonicalStoreCommit } = require('../trailieCanonicalCommit');
const { createSimpleTripStore } = require('../trailieSimpleStore');
const { createSimpleGuestStore } = require('../trailieSimpleGuestStore');
const { openGuestTurn, GUEST_TURN_FAILURE_CODES } = require('../guestTurnScope');
const { mintGuestSessionId } = require('../../utils/anonymousIdGenerator');

const message = 'Compare Zion and Bryce for a weekend.';
const prose = 'Bryce is quieter for a short weekend; Zion needs more time.';

function responseFor(version = 1) {
  return buildCanonicalTrailieResponse({
    responseId: `resp-${version}`,
    responseVersion: version,
    processedContent: prose,
    itineraryData: null,
    provider: 'openai',
    model: 'gpt-6-sol',
  });
}

test('prepareCanonicalStoreCommit accepts the same prose turn for guest and auth create', () => {
  const response = responseFor(1);
  const auth = prepareCanonicalStoreCommit({
    snapshot: { userId: 'owner', conversation: [], plan: null },
    response,
    message,
    mutation: null,
    operation: 'create',
  });
  const guest = prepareCanonicalStoreCommit({
    snapshot: { userId: 'guest_x', conversation: [], plan: null },
    response,
    message,
    mutation: null,
    operation: 'create',
  });
  expect(auth).toMatchObject({ ok: true });
  expect(guest).toMatchObject({ ok: true });
  expect(auth.conversation.map(m => m.role)).toEqual(['user', 'assistant']);
  expect(guest.conversation.map(m => m.role)).toEqual(['user', 'assistant']);
  expect(auth.conversation[1].contentHash).toBe(response.contentHash);
  expect(guest.conversation[1].contentHash).toBe(response.contentHash);
});

test('prepareCanonicalStoreCommit rejects the same identity skip for guest and auth', () => {
  const prior = responseFor(1);
  const snapshot = {
    userId: 'owner',
    conversation: [
      { id: 1, role: 'user', content: 'Earlier' },
      { id: 2, role: 'assistant', content: prior.content, responseId: prior.responseId,
        responseVersion: 1, contentHash: prior.contentHash, itineraryHash: prior.itineraryHash },
    ],
    plan: null,
  };
  // Skipping responseVersion 2 → 4 must fail both stores identically.
  const bad = buildCanonicalTrailieResponse({
    responseId: 'resp-skip',
    responseVersion: 4,
    processedContent: prose,
    itineraryData: null,
    provider: 'openai',
    model: 'gpt-6-sol',
  });
  const auth = prepareCanonicalStoreCommit({
    snapshot, response: bad, message, mutation: null, operation: 'update', targetTripId: 'trip',
  });
  const guest = prepareCanonicalStoreCommit({
    snapshot: { ...snapshot, userId: 'guest_x' },
    response: bad, message, mutation: null, operation: 'update',
  });
  expect(auth).toMatchObject({ ok: false, status: 409 });
  expect(guest).toMatchObject({ ok: false, status: 409, code: auth.code });
});

test('TripPlan and guest stores both refuse a skipped response version before durable write', async () => {
  const userId = new mongoose.Types.ObjectId();
  const prior = responseFor(1);
  const trip = await TripPlan.create({
    userId,
    conversation: [
      { id: 1, role: 'user', content: 'Earlier' },
      { id: 2, role: 'assistant', content: prior.content, responseId: prior.responseId,
        responseVersion: 1, contentHash: prior.contentHash, itineraryHash: prior.itineraryHash },
    ],
  });
  const bad = buildCanonicalTrailieResponse({
    responseId: 'resp-skip',
    responseVersion: 4,
    processedContent: prose,
    itineraryData: null,
    provider: 'openai',
    model: 'gpt-6-sol',
  });

  const authStore = createSimpleTripStore({ TripPlan });
  const authSnapshot = await authStore.load({ userId: String(userId), tripId: String(trip._id) });
  const authCommit = await authStore.commit({
    userId: String(userId), tripId: String(trip._id), snapshot: authSnapshot,
    response: bad, message, mutation: null,
  });
  expect(authCommit).toMatchObject({ ok: false, status: 409 });
  expect((await TripPlan.findById(trip._id).lean()).conversation).toHaveLength(2);

  const anonymousId = mintGuestSessionId();
  await AnonymousSession.findOrCreateSession(anonymousId, {
    ipAddress: '127.0.0.1', browserFingerprint: 'parity', userAgent: 'parity',
  });
  // Seed matching completed history so guest update path sees the same prior version.
  await AnonymousSession.updateOne({ anonymousId }, {
    $set: {
      messages: [
        { role: 'user', content: 'Earlier', timestamp: new Date() },
        { role: 'assistant', content: prior.content, responseId: prior.responseId,
          responseVersion: 1, contentHash: prior.contentHash, itineraryHash: prior.itineraryHash,
          timestamp: new Date() },
      ],
      completedTurnCount: 1,
      messageCount: 2,
      turns: [{ turnId: 'seed', status: 'completed', clientTurnId: 'seed',
        admittedAt: new Date(), completedAt: new Date(),
        userMessage: { role: 'user', content: 'Earlier' },
        assistantMessage: { role: 'assistant', content: prior.content, responseId: prior.responseId,
          responseVersion: 1, contentHash: prior.contentHash, itineraryHash: prior.itineraryHash } }],
    },
  });
  const turn = await openGuestTurn({
    anonymousId, clientTurnId: 'parity-bad', userMessage: { role: 'user', content: message },
  });
  expect(turn.admitted).toBe(true);
  const guestStore = createSimpleGuestStore({ AnonymousSession, anonymousId, turn });
  const guestSnapshot = await guestStore.load();
  const guestCommit = await guestStore.commit({
    snapshot: guestSnapshot, response: bad, message, mutation: null,
  });
  expect(guestCommit).toMatchObject({ ok: false, status: 409, code: authCommit.code });
  const session = await AnonymousSession.findOne({ anonymousId }).lean();
  expect(session.messages).toHaveLength(2);
  expect(session.completedTurnCount).toBe(1);
  await turn.fail(GUEST_TURN_FAILURE_CODES.BACKEND_EXCEPTION);
});

test('TripPlan and guest stores accept the same prose commit through one contract', async () => {
  const userId = new mongoose.Types.ObjectId();
  const response = responseFor(1);
  const authStore = createSimpleTripStore({ TripPlan });
  const authSnapshot = await authStore.load({ userId: String(userId) });
  const authCommit = await authStore.commit({
    userId: String(userId), snapshot: authSnapshot, response, message, mutation: null,
  });
  expect(authCommit).toMatchObject({ ok: true, tripId: expect.any(String) });
  const savedTrip = await TripPlan.findById(authCommit.tripId).lean();
  expect(savedTrip.conversation).toHaveLength(2);
  expect(savedTrip.conversation[1].contentHash).toBe(response.contentHash);

  const anonymousId = mintGuestSessionId();
  await AnonymousSession.findOrCreateSession(anonymousId, {
    ipAddress: '127.0.0.1', browserFingerprint: 'parity', userAgent: 'parity',
  });
  const turn = await openGuestTurn({
    anonymousId, clientTurnId: 'parity-ok', userMessage: { role: 'user', content: message },
  });
  expect(turn.admitted).toBe(true);
  const guestStore = createSimpleGuestStore({ AnonymousSession, anonymousId, turn });
  const guestSnapshot = await guestStore.load();
  const guestCommit = await guestStore.commit({
    snapshot: guestSnapshot, response, message, mutation: null,
  });
  expect(guestCommit).toMatchObject({ ok: true, status: 200 });
  const session = await AnonymousSession.findOne({ anonymousId }).lean();
  expect(session.messages).toHaveLength(2);
  expect(session.messages[1].contentHash).toBe(response.contentHash);
  expect(session.completedTurnCount).toBe(1);
});
