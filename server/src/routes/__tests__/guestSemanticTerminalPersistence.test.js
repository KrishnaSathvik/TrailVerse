'use strict';

/**
 * Phase 9C.1D.5B.2 — guest persistence of intentional semantic terminals.
 *
 * REAL `ai.js` router over HTTP (supertest), same harness as
 * trailieDisconnectCancellation.test.js: only `runTrailieV2FromPreparedContext`
 * is replaced. The named-experience case feeds the route the REAL result of
 * `executeTrailieV2Turn` on the exact 9C.1D.4 Mist Trail request (zero model
 * dispatch) and the REAL `renderV2Content` text — no hand-written terminal.
 */

jest.mock('../../middleware/auth', () => ({
  protect: (req, _res, next) => {
    req.user = { _id: 'phase5b2-user', id: 'phase5b2-user' };
    next();
  },
  optionalAuth: (req, _res, next) => next(),
}));

jest.mock('../../utils/conversationPlanContinuity', () => ({
  rememberConversationPlan: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/trailieV2RouteBridge', () => {
  const actual = jest.requireActual('../../services/trailieV2RouteBridge');
  return { ...actual, runTrailieV2FromPreparedContext: jest.fn() };
});

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const request = require('supertest');

const AnonymousSession = require('../../models/AnonymousSession');
const { rememberConversationPlan } = require('../../utils/conversationPlanContinuity');
const { runTrailieV2FromPreparedContext, renderV2Content } = require('../../services/trailieV2RouteBridge');
const { executeTrailieV2Turn } = require('../../services/trailieV2ExecutionService');
const { buildEvidenceBundle } = require('../../utils/evidenceBundle');
const {
  COMPLETED_SEMANTIC_TERMINAL_STATUSES,
  isCompletedSemanticTerminal,
} = require('../../utils/trailieV2TerminalOutcome');

process.env.TRAILIE_V2_RUNTIME_ENABLED = 'true';
// eslint-disable-next-line global-require
const aiRouter = require('../ai');

const MIST_TRAIL_REQUEST = 'Plan me a day in Yosemite Valley. I want to hike the Mist Trail in the morning, including Vernal Fall Footbridge and Vernal Fall as stops, then do one separate scenic experience later in the day.';
const YOSE = require(path.join(__dirname, '../../services/__tests__/fixtures/namedExperience/yose-activities-2026-09-15.json'));

function baseResult(over = {}) {
  return {
    status: 'complete', terminalReason: null, canonicalPlan: null, targetPlanMutation: null,
    travelLogistics: null, responseArtifacts: null, intent: null, presentation: null,
    activeTripPresentation: null, targetTripId: null, itineraryHash: null, attempts: [],
    ...over,
  };
}

/** The real execution result for the exact Mist Trail request — no model, no network. */
let MIST_TRAIL_TERMINAL;
let dispatchesForMistTrail = 0;
async function realMistTrailTerminal() {
  const result = await executeTrailieV2Turn({
    userMessage: MIST_TRAIL_REQUEST, conversationContext: { history: [] }, tripState: null, constraints: null, resolvedContext: {},
  }, {
    enabled: true,
    planRequirements: () => [{ requirementId: 'r1', topic: 'activities', criticality: 'optional', reasonCodes: ['itinerary_activity_support'] }],
    resolveDeterministicRender: () => ({ eligible: false }),
    detectContradiction: () => [],
    resolveEvidence: async ({ requirements = [], requestId }) => buildEvidenceBundle({
      requestId,
      resolutions: requirements.map((r) => ({ requirementId: r.requirementId, status: 'satisfied_fresh', evidenceIds: YOSE.candidates.map((c) => c.evidenceId) })),
      candidates: YOSE.candidates,
    }),
    now: () => new Date('2026-09-15T12:00:00.000Z'),
    newTurnId: () => 'turn-5b2-mist',
    streamGeneration: false,
    responseAdapters: {},
    executeResponses: async () => { dispatchesForMistTrail += 1; throw new Error('must not dispatch'); },
  });
  return { result, content: renderV2Content(result) };
}

const DRIVE_CAP = () => ({
  result: baseResult({ status: 'constraint_infeasible', terminalReason: 'route_leg_exceeds_daily_drive_cap' }),
  content: "I can't verify an itinerary that satisfies your hard driving limit with the requested route as written.",
});
const EVIDENCE_INCOMPLETE = () => {
  const result = baseResult({ status: 'evidence_incomplete', terminalReason: 'evidence_incomplete' });
  return { result, content: renderV2Content(result) };
};
const FAILED = () => ({ result: baseResult({ status: 'failed', terminalReason: 'routing_exhausted' }), content: "I couldn't complete this request. Please try again." });
const CANCELLED = () => ({ result: baseResult({ status: 'cancelled', terminalReason: 'cancelled' }), content: '' });

let app;
const nextAnonId = () => `guest_v2_${crypto.randomUUID()}`;

async function newGuest() {
  const anonymousId = nextAnonId();
  await AnonymousSession.findOrCreateSession(anonymousId, {
    ipAddress: '127.0.0.1', userAgent: 'phase5b2-suite', browserFingerprint: 'fp-phase5b2',
  });
  return anonymousId;
}

const ROUTES = [
  ['non-stream /chat-anonymous', '/api/ai/chat-anonymous'],
  ['stream /chat-anonymous-stream', '/api/ai/chat-anonymous-stream'],
];

async function submit(route, anonymousId, content = MIST_TRAIL_REQUEST) {
  return request(app).post(route).send({
    messages: [{ role: 'user', content }],
    metadata: { parkCode: 'yose', parkName: 'Yosemite National Park' },
    anonymousId,
  });
}

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use('/api/ai', aiRouter);
  MIST_TRAIL_TERMINAL = await realMistTrailTerminal();
});

beforeEach(() => {
  runTrailieV2FromPreparedContext.mockReset();
  rememberConversationPlan.mockClear();
});

describe('fixture sanity — the Mist Trail terminal is the real 5B one', () => {
  test('real execution: constraint_infeasible / requested_experience_unavailable with zero dispatch', () => {
    expect(MIST_TRAIL_TERMINAL.result.status).toBe('constraint_infeasible');
    expect(MIST_TRAIL_TERMINAL.result.terminalReason).toBe('requested_experience_unavailable');
    expect(MIST_TRAIL_TERMINAL.result.canonicalPlan).toBeNull();
    expect(MIST_TRAIL_TERMINAL.content).toContain('Mist Trail');
    expect(dispatchesForMistTrail).toBe(0);
  });
});

describe.each(ROUTES)('%s', (_label, route) => {
  test('(1)(4)(5) named-experience unavailable persists as a completed turn and restores via session-status with no plan', async () => {
    runTrailieV2FromPreparedContext.mockResolvedValue(MIST_TRAIL_TERMINAL);
    const anonymousId = await newGuest();
    const res = await submit(route, anonymousId);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Mist Trail');

    const session = await AnonymousSession.findOne({ anonymousId });
    expect(session.completedTurnCount).toBe(1);
    expect(session.turns.map((t) => t.status)).toEqual(['completed']);
    expect(session.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(session.messages[1].content).toBe(MIST_TRAIL_TERMINAL.content);
    expect(session.messages[1].canonicalPlan).toBeFalsy();

    const status = await request(app).get(`/api/ai/session-status/${anonymousId}`);
    expect(status.status).toBe(200);
    expect(status.body.completedGuestTurns).toBe(1);
    expect(status.body.remainingAllowance).toBe(4);
    expect(status.body.hasPendingTurn).toBe(false);
    expect(status.body.messages).toHaveLength(2);
    expect(status.body.messages[0].content).toBe(MIST_TRAIL_REQUEST);
    expect(status.body.messages[1].content).toBe(MIST_TRAIL_TERMINAL.content);
    expect(JSON.stringify(status.body.messages)).not.toMatch(/"canonicalPlan":\{|"itineraryData":\{/);
  });

  test('(2) drive-cap constraint_infeasible persists', async () => {
    runTrailieV2FromPreparedContext.mockResolvedValue(DRIVE_CAP());
    const anonymousId = await newGuest();
    await submit(route, anonymousId, 'Road trip from RMNP to Dinosaur, max four hours driving daily');
    const session = await AnonymousSession.findOne({ anonymousId });
    expect(session.completedTurnCount).toBe(1);
    expect(session.messages).toHaveLength(2);
  });

  test('(3) evidence_incomplete persists with its real traveler copy', async () => {
    const terminal = EVIDENCE_INCOMPLETE();
    runTrailieV2FromPreparedContext.mockResolvedValue(terminal);
    const anonymousId = await newGuest();
    await submit(route, anonymousId, 'Is Tioga Road open right now?');
    const session = await AnonymousSession.findOne({ anonymousId });
    expect(session.completedTurnCount).toBe(1);
    expect(session.messages[1].content).toBe(terminal.content);
  });

  test('(9) a streamed/finalized semantic terminal writes exactly one assistant message', async () => {
    runTrailieV2FromPreparedContext.mockResolvedValue(MIST_TRAIL_TERMINAL);
    const anonymousId = await newGuest();
    await submit(route, anonymousId);
    const session = await AnonymousSession.findOne({ anonymousId });
    expect(session.messages.filter((m) => m.role === 'assistant')).toHaveLength(1);
    expect(session.turns.filter((t) => t.status === 'completed')).toHaveLength(1);
  });

  test('(6) a genuine `failed` result keeps the failure path: no history, no quota', async () => {
    runTrailieV2FromPreparedContext.mockResolvedValue(FAILED());
    const anonymousId = await newGuest();
    const res = await submit(route, anonymousId);
    expect(res.status).toBe(200);
    const session = await AnonymousSession.findOne({ anonymousId });
    expect(session.completedTurnCount).toBe(0);
    expect(session.messages).toHaveLength(0);
    expect(session.turns.every((t) => t.status === 'failed')).toBe(true);
    const status = await request(app).get(`/api/ai/session-status/${anonymousId}`);
    expect(status.body.remainingAllowance).toBe(5);
  });

  test('(7) a thrown infrastructure failure (timeout) stays a retryable failure', async () => {
    runTrailieV2FromPreparedContext.mockRejectedValue(Object.assign(new Error('provider timed out'), { code: 'ETIMEDOUT' }));
    const anonymousId = await newGuest();
    await submit(route, anonymousId);
    const session = await AnonymousSession.findOne({ anonymousId });
    expect(session.completedTurnCount).toBe(0);
    expect(session.messages).toHaveLength(0);
    const status = await request(app).get(`/api/ai/session-status/${anonymousId}`);
    expect(status.body.remainingAllowance).toBe(5);
    expect(status.body.canSendMore).toBe(true);
  });

  test('(8) a cancelled (disconnect/abort) result never completes the turn', async () => {
    runTrailieV2FromPreparedContext.mockResolvedValue(CANCELLED());
    const anonymousId = await newGuest();
    await submit(route, anonymousId);
    const session = await AnonymousSession.findOne({ anonymousId });
    expect(session.completedTurnCount).toBe(0);
    expect(session.messages).toHaveLength(0);
  });

  test('a semantic status with no traveler-facing text is not an answer and is not persisted', async () => {
    runTrailieV2FromPreparedContext.mockResolvedValue({ result: baseResult({ status: 'constraint_infeasible' }), content: '   ' });
    const anonymousId = await newGuest();
    await submit(route, anonymousId);
    const session = await AnonymousSession.findOne({ anonymousId });
    expect(session.completedTurnCount).toBe(0);
    expect(session.messages).toHaveLength(0);
  });
});

describe('(10) authenticated /chat is unchanged', () => {
  test('a semantic terminal is returned as a response and does not remember a plan', async () => {
    runTrailieV2FromPreparedContext.mockResolvedValue(MIST_TRAIL_TERMINAL);
    const res = await request(app).post('/api/ai/chat').send({
      messages: [{ role: 'user', content: MIST_TRAIL_REQUEST }],
      metadata: { parkCode: 'yose', parkName: 'Yosemite National Park' },
    });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Mist Trail');
    expect(rememberConversationPlan).not.toHaveBeenCalled();
  });
});

describe('predicate', () => {
  test.each([
    ['constraint_infeasible', 'text', true],
    ['evidence_incomplete', 'text', true],
    ['plan_target_unresolved', 'text', true],
    ['constraint_infeasible', '', false],
    ['failed', 'text', false],
    ['cancelled', 'text', false],
    ['disabled', 'text', false],
    ['complete', 'text', false],
    ['some_future_status', 'text', false],
  ])('%s with %j → %s', (status, content, expected) => {
    expect(isCompletedSemanticTerminal({ status }, content)).toBe(expected);
  });

  test('agrees with the frontend classifier: no completed semantic status is a frontend generation failure', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../../../next-frontend/src/utils/trailieTurnOutcome.js'), 'utf8');
    const failureSet = src.match(/GENERATION_FAILURE_STATUSES = new Set\(\[([\s\S]*?)\]\)/)[1];
    const failureStatuses = [...failureSet.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(failureStatuses.length).toBeGreaterThan(0);
    for (const status of COMPLETED_SEMANTIC_TERMINAL_STATUSES) {
      expect(failureStatuses).not.toContain(status);
    }
  });
});
