'use strict';

/**
 * Phase 6B.2 — route-level pins for the corrected disconnect-cancellation
 * seam, using REAL HTTP (supertest against the actual mounted `ai.js`
 * router) and a DELAYED, INJECTED fake in place of
 * `runTrailieV2FromPreparedContext` (the one seam all four Trailie V2 chat
 * routes call through) — never a live model call, and never a source-text
 * assertion standing in for behavior.
 *
 * The fake mimics exactly what the real router already does (proven in
 * Phase 6B/6B.1): check `signal.aborted` once the "generation" is done and
 * return a `status: 'cancelled'` shape instead of `'complete'`. That
 * downstream gating is NOT re-tested here — it was already proven from the
 * real router's own source. What IS tested here, for real, is the NEW
 * plumbing: does the route actually construct a signal from a genuine
 * client disconnect and pass it through, and does the route's OWN
 * completion-gated side effects (`guestTurn.complete`, quota, persisted
 * guest history, `rememberConversationPlan`) correctly stay unreached when
 * that happens.
 *
 * Provider-billing qualification (unchanged from Phase 6B/6B.1): an aborted
 * SDK request is a best-effort cancellation signal to the provider, never
 * proof the provider stopped billing. Nothing here or in production code
 * claims otherwise.
 */

jest.mock('../../../../../src/middleware/auth', () => ({
  protect: (req, _res, next) => {
    req.user = { _id: 'phase6b2-user', id: 'phase6b2-user' };
    next();
  },
  optionalAuth: (req, _res, next) => next(),
}));

jest.mock('../../../../../src/utils/conversationPlanContinuity', () => ({
  rememberConversationPlan: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../../../src/services/trailieV2RouteBridge', () => {
  const actual = jest.requireActual('../../../../../src/services/trailieV2RouteBridge');
  return {
    ...actual,
    runTrailieV2FromPreparedContext: jest.fn(),
  };
});

const express = require('express');
const request = require('supertest');
const crypto = require('crypto');

const AnonymousSession = require('../../../../../src/models/AnonymousSession');
const { rememberConversationPlan } = require('../../../../../src/utils/conversationPlanContinuity');
const { runTrailieV2FromPreparedContext } = require('../../../../../src/services/trailieV2RouteBridge');

process.env.TRAILIE_V2_RUNTIME_ENABLED = 'true';
// eslint-disable-next-line global-require
const aiRouter = require('../../../../../src/routes/ai');

const GENERATION_DELAY_MS = 220;
const DISCONNECT_TIMEOUT_MS = 40;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The exact shape `runTrailieV2FromPreparedContext` returns — mirrors the
 * REAL router's own proven behavior (Phase 6B): check the signal once
 * "generation" is done, and only ever report `'complete'` when it wasn't
 * aborted along the way. */
function makeDelayedFake() {
  return jest.fn(async ({ signal } = {}) => {
    await delay(GENERATION_DELAY_MS);
    if (signal?.aborted) {
      return {
        result: {
          status: 'cancelled',
          terminalReason: 'cancelled',
          canonicalPlan: null,
          targetPlanMutation: null,
          travelLogistics: null,
          responseArtifacts: null,
          intent: null,
          presentation: null,
          activeTripPresentation: null,
          targetTripId: null,
          itineraryHash: null,
          attempts: [],
        },
        content: '',
      };
    }
    return {
      result: {
        status: 'complete',
        terminalReason: null,
        canonicalPlan: null,
        targetPlanMutation: null,
        travelLogistics: null,
        responseArtifacts: null,
        intent: { primaryIntent: 'general_qa' },
        presentation: null,
        activeTripPresentation: null,
        targetTripId: null,
        itineraryHash: null,
        attempts: [],
      },
      content: 'A real synthetic answer, well over the fallback length threshold used elsewhere in this suite.',
    };
  });
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/ai', aiRouter);
  return app;
}

let app;
const nextAnonId = () => `guest_v2_${crypto.randomUUID()}`;

async function seedGuestSession(anonymousId) {
  await AnonymousSession.findOrCreateSession(anonymousId, {
    ipAddress: '127.0.0.1',
    userAgent: 'phase6b2-suite',
    browserFingerprint: 'fp-phase6b2',
  });
}

beforeAll(() => {
  app = buildApp();
});

beforeEach(() => {
  runTrailieV2FromPreparedContext.mockReset();
  runTrailieV2FromPreparedContext.mockImplementation(makeDelayedFake());
  rememberConversationPlan.mockClear();
});

describe('Phase 8D.1 — anonymous identity at the actual HTTP route', () => {
  const sharedHeaders = {
    'User-Agent': 'Identical Browser/1.0',
    'Accept-Language': 'en-US',
  };

  test('two missing IDs under identical request fingerprints mint independent sessions', async () => {
    const payload = {
      messages: [{ role: 'user', content: 'Give me one Acadia tip.' }],
      metadata: { parkCode: 'acad', parkName: 'Acadia National Park' },
    };

    const first = await request(app).post('/api/ai/chat-anonymous').set(sharedHeaders).send(payload);
    const second = await request(app).post('/api/ai/chat-anonymous').set(sharedHeaders).send(payload);
    const firstAnonymousId = first.body.data?.anonymousId || first.body.anonymousId;
    const secondAnonymousId = second.body.data?.anonymousId || second.body.anonymousId;

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstAnonymousId).toMatch(/^guest_v2_/);
    expect(secondAnonymousId).toMatch(/^guest_v2_/);
    expect(firstAnonymousId).not.toBe(secondAnonymousId);

    const sessions = await AnonymousSession.find({
      anonymousId: { $in: [firstAnonymousId, secondAnonymousId] },
    });
    expect(sessions).toHaveLength(2);
    expect(sessions[0].browserFingerprint).toBe(sessions[1].browserFingerprint);
  });

  test('an invalid legacy ID rotates without importing the legacy conversation', async () => {
    const legacyId = 'anon_0123456789abcdef_012345';
    const legacy = await AnonymousSession.findOrCreateSession(legacyId, {
      ipAddress: '127.0.0.1',
      userAgent: 'legacy-browser',
      browserFingerprint: 'legacy-fingerprint',
      planningState: { activeTripPresentation: { parkName: 'Olympic National Park' } },
    });
    legacy.messages = [
      { role: 'user', content: 'Plan Olympic' },
      { role: 'assistant', content: 'Legacy Olympic plan' },
    ];
    await legacy.save();

    const response = await request(app)
      .post('/api/ai/chat-anonymous')
      .set(sharedHeaders)
      .send({
        anonymousId: legacyId,
        messages: [{ role: 'user', content: 'Tell me about Acadia.' }],
        metadata: { parkCode: 'acad', parkName: 'Acadia National Park' },
      });
    const rotatedAnonymousId = response.body.data?.anonymousId || response.body.anonymousId;

    expect(response.status).toBe(200);
    expect(rotatedAnonymousId).not.toBe(legacyId);
    expect(rotatedAnonymousId).toMatch(/^guest_v2_/);

    const rotated = await AnonymousSession.findOne({ anonymousId: rotatedAnonymousId });
    expect(rotated.messages.map((message) => message.content)).not.toContain('Legacy Olympic plan');
    expect(rotated.planningState?.activeTripPresentation?.parkName).not.toBe('Olympic National Park');

    const untouchedLegacy = await AnonymousSession.findOne({ anonymousId: legacyId });
    expect(untouchedLegacy.messages.map((message) => message.content)).toContain('Legacy Olympic plan');
  });

  test('session-status rejects a legacy bearer instead of looking up its state', async () => {
    const legacyId = 'anon_aaaaaaaaaaaaaaaa_bbbbbb';
    await seedGuestSession(legacyId);

    const response = await request(app).get(`/api/ai/session-status/${legacyId}`);

    expect(response.status).toBe(404);
    expect(response.body.messageCount).toBe(0);
  });

  test('messages, active trip, pending turn, and quota remain isolated by the V2 bearer', async () => {
    const guestA = nextAnonId();
    const guestB = nextAnonId();
    const sessionA = await AnonymousSession.findOrCreateSession(guestA, {
      ipAddress: '203.0.113.42',
      userAgent: 'Identical Browser/1.0',
      browserFingerprint: 'identical-fingerprint',
      planningState: { activeTripPresentation: { parkName: 'Olympic National Park' } },
    });
    await AnonymousSession.findOrCreateSession(guestB, {
      ipAddress: '203.0.113.42',
      userAgent: 'Identical Browser/1.0',
      browserFingerprint: 'identical-fingerprint',
    });

    const admittedAt = new Date();
    sessionA.messages = [
      { role: 'user', content: 'Plan Olympic' },
      { role: 'assistant', content: 'Olympic itinerary' },
    ];
    sessionA.turns = [
      {
        turnId: 'turn-a-complete',
        clientTurnId: 'client-a-complete',
        status: 'completed',
        userMessage: { role: 'user', content: 'Plan Olympic' },
        assistantMessage: { role: 'assistant', content: 'Olympic itinerary' },
        admittedAt,
        completedAt: admittedAt,
      },
      {
        turnId: 'turn-a-pending',
        clientTurnId: 'client-a-pending',
        status: 'pending',
        userMessage: { role: 'user', content: 'Make Day 2 easier' },
        admittedAt,
      },
    ];
    sessionA.completedTurnCount = 1;
    await sessionA.save();

    const [statusA, statusB] = await Promise.all([
      request(app).get(`/api/ai/session-status/${guestA}`),
      request(app).get(`/api/ai/session-status/${guestB}`),
    ]);

    expect(statusA.status).toBe(200);
    expect(statusA.body.messageCount).toBe(1);
    expect(statusA.body.hasPendingTurn).toBe(true);
    expect(statusA.body.messages.map((message) => message.content)).toContain('Olympic itinerary');
    expect(statusA.body.planningState.activeTripPresentation.parkName).toBe('Olympic National Park');

    expect(statusB.status).toBe(200);
    expect(statusB.body.messageCount).toBe(0);
    expect(statusB.body.remainingAllowance).toBeGreaterThan(0);
    expect(statusB.body.hasPendingTurn).toBe(false);
    expect(statusB.body.messages).toEqual([]);
    expect(statusB.body.planningState).toBeNull();
  });
});

describe('Phase 6B.2 — guest non-stream /chat-anonymous', () => {
  test('normal completion: guestTurn.complete runs, quota is consumed, history is persisted', async () => {
    const anonymousId = await (async () => {
      const id = nextAnonId();
      await seedGuestSession(id);
      return id;
    })();

    const res = await request(app)
      .post('/api/ai/chat-anonymous')
      .send({
        messages: [{ role: 'user', content: 'Is October a good time to visit Acadia?' }],
        metadata: { parkCode: 'acad', parkName: 'Acadia National Park' },
        anonymousId,
      });

    expect(res.status).toBe(200);

    const session = await AnonymousSession.findOne({ anonymousId });
    expect(session.completedTurnCount).toBe(1);
    expect(session.messages).toHaveLength(2); // user + assistant
    expect(session.turns.find((t) => t.status === 'completed')).toBeTruthy();
  });

  test('premature client disconnect: guestTurn.complete never runs, quota is NOT consumed, nothing is persisted', async () => {
    const anonymousId = await (async () => {
      const id = nextAnonId();
      await seedGuestSession(id);
      return id;
    })();

    await expect(
      request(app)
        .post('/api/ai/chat-anonymous')
        .timeout({ response: DISCONNECT_TIMEOUT_MS })
        .send({
          messages: [{ role: 'user', content: 'Is October a good time to visit Acadia?' }],
          metadata: { parkCode: 'acad', parkName: 'Acadia National Park' },
          anonymousId,
        })
    ).rejects.toThrow();

    // Give the SERVER-SIDE handler (still running — the client leaving does
    // not stop the in-flight JS) time to finish past the fake's delay and
    // reach its own guestTurn.fail()/settle() path.
    await delay(GENERATION_DELAY_MS + 300);

    const session = await AnonymousSession.findOne({ anonymousId });
    expect(session.completedTurnCount).toBe(0);
    expect(session.messages).toHaveLength(0);
    expect(session.turns.find((t) => t.status === 'completed')).toBeFalsy();
    // The mock itself must have actually observed the abort — proving the
    // signal really propagated from the disconnect into the call, not just
    // that the route happened to fail for some unrelated reason.
    const calls = runTrailieV2FromPreparedContext.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const passedSignal = calls[calls.length - 1][0].signal;
    expect(passedSignal).toBeTruthy();
    expect(passedSignal.aborted).toBe(true);
  });
});

describe('Phase 6B.2 — guest streaming /chat-anonymous-stream (the primary real-world path)', () => {
  test('normal completion: guestTurn.complete runs, quota is consumed, history is persisted', async () => {
    const anonymousId = nextAnonId();
    await seedGuestSession(anonymousId);

    const res = await request(app)
      .post('/api/ai/chat-anonymous-stream')
      .send({
        messages: [{ role: 'user', content: 'Is October a good time to visit Acadia?' }],
        metadata: { parkCode: 'acad', parkName: 'Acadia National Park' },
        anonymousId,
      });

    expect(res.status).toBe(200);

    const session = await AnonymousSession.findOne({ anonymousId });
    expect(session.completedTurnCount).toBe(1);
    expect(session.messages).toHaveLength(2);
  });

  test('premature client disconnect mid-stream: guestTurn.complete never runs, nothing is persisted', async () => {
    const anonymousId = nextAnonId();
    await seedGuestSession(anonymousId);

    await expect(
      request(app)
        .post('/api/ai/chat-anonymous-stream')
        // A streaming response sends its first SSE bytes almost immediately
        // (transport.responseStarted(), before the fake's delay even
        // begins), so a response-only timeout is satisfied instantly and
        // never disconnects. `deadline` is a hard overall cutoff regardless
        // of stream activity — this is the one that actually severs the
        // connection mid-generation, which is the scenario under test.
        .timeout({ response: DISCONNECT_TIMEOUT_MS, deadline: DISCONNECT_TIMEOUT_MS })
        .send({
          messages: [{ role: 'user', content: 'Is October a good time to visit Acadia?' }],
          metadata: { parkCode: 'acad', parkName: 'Acadia National Park' },
          anonymousId,
        })
    ).rejects.toThrow();

    await delay(GENERATION_DELAY_MS + 300);

    const session = await AnonymousSession.findOne({ anonymousId });
    expect(session.completedTurnCount).toBe(0);
    expect(session.messages).toHaveLength(0);

    const calls = runTrailieV2FromPreparedContext.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const passedSignal = calls[calls.length - 1][0].signal;
    expect(passedSignal).toBeTruthy();
    expect(passedSignal.aborted).toBe(true);
  });
});

describe('Phase 6B.2 — authenticated non-stream /chat', () => {
  test('normal completion: rememberConversationPlan is NOT reached here (no canonicalPlan in this fixture) but the turn completes normally', async () => {
    const res = await request(app)
      .post('/api/ai/chat')
      .send({
        messages: [{ role: 'user', content: 'Is October a good time to visit Acadia?' }],
        metadata: { parkCode: 'acad', parkName: 'Acadia National Park' },
      });

    expect(res.status).toBe(200);
    expect(res.body?.data?.content).toContain('synthetic answer');
  });

  test('premature client disconnect: the route observes the same aborted signal it was given', async () => {
    await expect(
      request(app)
        .post('/api/ai/chat')
        .timeout({ response: DISCONNECT_TIMEOUT_MS })
        .send({
          messages: [{ role: 'user', content: 'Is October a good time to visit Acadia?' }],
          metadata: { parkCode: 'acad', parkName: 'Acadia National Park' },
        })
    ).rejects.toThrow();

    await delay(GENERATION_DELAY_MS + 300);

    const calls = runTrailieV2FromPreparedContext.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const passedSignal = calls[calls.length - 1][0].signal;
    expect(passedSignal).toBeTruthy();
    expect(passedSignal.aborted).toBe(true);

    // rememberConversationPlan is complete-gated on v2Result.status ===
    // 'complete' && canonicalPlan && req.user?._id (routes/ai.js). The fake
    // observed the abort and returned 'cancelled', so this must never run —
    // the exact invariant the coordinator asked to be pinned.
    expect(rememberConversationPlan).not.toHaveBeenCalled();
  });

  test('normal completion WITH a canonicalPlan: rememberConversationPlan DOES run (contrast case, proves the gate is real, not just always-off)', async () => {
    runTrailieV2FromPreparedContext.mockReset();
    runTrailieV2FromPreparedContext.mockImplementation(async () => ({
      result: {
        status: 'complete',
        terminalReason: null,
        canonicalPlan: { days: [{ dayNumber: 1, stops: [{ name: 'Cadillac Mountain' }] }] },
        targetPlanMutation: null,
        travelLogistics: null,
        responseArtifacts: null,
        intent: { primaryIntent: 'simple_itinerary' },
        presentation: null,
        activeTripPresentation: null,
        targetTripId: null,
        itineraryHash: null,
        attempts: [],
      },
      content: 'Here is a real synthetic itinerary.',
    }));

    const res = await request(app)
      .post('/api/ai/chat')
      .send({
        messages: [{ role: 'user', content: 'Plan me 3 days in Acadia.' }],
        metadata: { parkCode: 'acad', parkName: 'Acadia National Park' },
      });

    expect(res.status).toBe(200);
    expect(rememberConversationPlan).toHaveBeenCalledTimes(1);
  });
});

describe('Phase 6B.2 — authenticated streaming /chat-stream (fourth and last of the four routes)', () => {
  test('premature client disconnect mid-stream: rememberConversationPlan never runs', async () => {
    runTrailieV2FromPreparedContext.mockReset();
    runTrailieV2FromPreparedContext.mockImplementation(makeDelayedFake());

    await expect(
      request(app)
        .post('/api/ai/chat-stream')
        .timeout({ response: DISCONNECT_TIMEOUT_MS, deadline: DISCONNECT_TIMEOUT_MS })
        .send({
          messages: [{ role: 'user', content: 'Is October a good time to visit Acadia?' }],
          metadata: { parkCode: 'acad', parkName: 'Acadia National Park' },
        })
    ).rejects.toThrow();

    await delay(GENERATION_DELAY_MS + 300);

    const calls = runTrailieV2FromPreparedContext.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const passedSignal = calls[calls.length - 1][0].signal;
    expect(passedSignal).toBeTruthy();
    expect(passedSignal.aborted).toBe(true);
    expect(rememberConversationPlan).not.toHaveBeenCalled();
  });
});
