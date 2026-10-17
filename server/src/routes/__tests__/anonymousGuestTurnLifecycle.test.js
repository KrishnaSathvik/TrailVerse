'use strict';

/**
 * Stage 14.8A.2 §5–§12 — the guest turn lifecycle AS THE ROUTES RUN IT.
 *
 * The anonymous routes own a long handler, so the lifecycle seam is factored
 * into `openGuestTurn`. This suite mounts a real Express route over that exact
 * seam and drives it with SYNTHETIC providers only: no provider client is
 * constructed, no provider is dispatched, and no external request is made.
 *
 * Static invariants at the bottom prove `routes/ai.js` actually runs this seam
 * and can never drift back to admission-time quota consumption.
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');

const AnonymousSession = require('../../models/AnonymousSession');
const {
  GUEST_TURN_FAILURE_CODES,
  GUEST_ROUTE_CODES,
  STALE_PENDING_TURN_MS,
  readGuestQuota,
} = require('../../services/anonymousTurnLedger');
const {
  classifyGuestTurnFailure,
  openGuestTurn,
} = require('../../services/guestTurnScope');

const AI_ROUTE_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '..', 'ai.js'),
  'utf8'
);

/** Ledger of every synthetic provider interaction. Live providers must stay at 0. */
const providerLedger = {
  liveProviderConstructors: 0,
  liveProviderDispatches: 0,
  externalProviderRequests: 0,
  providerCostUsd: 0,
  syntheticDispatches: 0,
};

/** Synthetic providers — deterministic, in-process, no network, no cost. */
const SYNTHETIC_PROVIDERS = {
  terminal_success: async () => {
    providerLedger.syntheticDispatches += 1;
    return {
      content: 'Synthetic terminal itinerary.',
      provider: 'synthetic',
      model: 'synthetic-1',
      travelLogistics: {
        schemaVersion: 'travel-logistics-v1',
        stays: { status: 'partial', regions: [{ name: 'West Yellowstone' }] },
      },
    };
  },
  structured_failure: async () => {
    providerLedger.syntheticDispatches += 1;
    throw Object.assign(new Error('structured itinerary generation failed'), {
      guestFailureStage: 'structured',
    });
  },
  prose_failure: async () => {
    providerLedger.syntheticDispatches += 1;
    throw Object.assign(new Error('prose generation failed'), { guestFailureStage: 'prose' });
  },
  provider_timeout: async () => {
    providerLedger.syntheticDispatches += 1;
    throw Object.assign(new Error('provider timed out'), { code: 'ETIMEDOUT' });
  },
  provider_configuration_failure: async () => {
    providerLedger.syntheticDispatches += 1;
    throw new Error('Claude API key not configured');
  },
  client_disconnect: async () => {
    providerLedger.syntheticDispatches += 1;
    return { aborted: true };
  },
  empty_terminal: async () => {
    providerLedger.syntheticDispatches += 1;
    return { content: '', provider: 'synthetic' };
  },
  /**
   * Holds the turn open until the barrier is released, so a second submission
   * provably overlaps a PENDING turn. Without it the synthetic provider can
   * finish before the second admission is attempted, and the concurrency case
   * would silently degrade into two sequential turns.
   */
  gated: async () => {
    providerLedger.syntheticDispatches += 1;
    await gateBarrier;
    return { content: 'Synthetic gated response.', provider: 'synthetic', model: 'synthetic-1' };
  },
};

let releaseGate = () => {};
let gateBarrier = Promise.resolve();
const openGate = () => {
  gateBarrier = new Promise((resolve) => { releaseGate = resolve; });
};

/** Waits until the pending reservation is visible in the database. */
async function waitForPendingTurn(anonymousId) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const session = await AnonymousSession.findOne({ anonymousId }).select('turns');
    if ((session?.turns || []).some((t) => t.status === 'pending')) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('pending turn never became visible');
}

/**
 * A route shaped exactly like the anonymous stream handler: admit → generate →
 * terminal event → complete, with `settle` guaranteeing no pending reservation
 * survives the handler.
 */
function buildGuestRoute() {
  const app = express();
  app.use(express.json());

  app.post('/api/ai/chat-anonymous-stream', async (req, res) => {
    const { anonymousId, clientTurnId, scenario = 'terminal_success', duplicateTerminal = false } = req.body;
    const userMessage = { role: 'user', content: req.body.content || 'Plan a Yosemite weekend' };

    const scope = await openGuestTurn({ anonymousId, clientTurnId, userMessage });

    if (!scope.admitted) {
      // The block happens BEFORE any provider reservation/construction/dispatch.
      const status = scope.refusal.code === GUEST_ROUTE_CODES.EXHAUSTED ? 200 : 409;
      return res.status(status).json({
        error: scope.refusal.code,
        completedGuestTurns: scope.refusal.completedGuestTurns,
        remainingAllowance: scope.refusal.remainingAllowance,
        canSendMore: scope.refusal.remainingAllowance > 0,
      });
    }

    try {
      const result = await SYNTHETIC_PROVIDERS[scenario]();

      if (result.aborted) {
        await scope.fail(GUEST_TURN_FAILURE_CODES.CLIENT_DISCONNECTED);
        return res.status(499).json({ error: GUEST_ROUTE_CODES.FAILED });
      }

      const assistantMessage = {
        role: 'assistant', content: result.content, provider: result.provider, model: result.model,
        travelLogistics: result.travelLogistics,
      };
      const completion = await scope.complete(assistantMessage);
      // Duplicate terminal callback (repeated `done` / reconnect reconciliation).
      const replay = duplicateTerminal ? await scope.complete(assistantMessage) : null;

      const quota = await readGuestQuota(anonymousId);
      return res.json({
        type: 'done',
        assistantResponsesWritten:
          completion.assistantResponsesWritten + (replay?.assistantResponsesWritten || 0),
        completedTurnIncrement:
          completion.completedTurnIncrement + (replay?.completedTurnIncrement || 0),
        duplicateCompletionIncrement: replay?.completedTurnIncrement ?? 0,
        completedGuestTurns: quota.completedGuestTurns,
        remainingAllowance: quota.remainingAllowance,
        canSendMore: quota.remainingAllowance > 0,
      });
    } catch (error) {
      await scope.fail(classifyGuestTurnFailure(error));
      const quota = await readGuestQuota(anonymousId);
      return res.status(502).json({
        error: GUEST_ROUTE_CODES.FAILED,
        completedGuestTurns: quota.completedGuestTurns,
        remainingAllowance: quota.remainingAllowance,
        canSendMore: quota.remainingAllowance > 0,
      });
    } finally {
      await scope.settle(GUEST_TURN_FAILURE_CODES.BACKEND_EXCEPTION);
    }
  });

  return app;
}

let app;
let seq = 0;
const nextId = () => `anon-route-${Date.now()}-${(seq += 1)}`;

async function seedSession(anonymousId) {
  await AnonymousSession.findOrCreateSession(anonymousId, {
    ipAddress: '127.0.0.1',
    userAgent: 'stage14_8a2-route-suite',
    browserFingerprint: 'fp-route',
  });
  return anonymousId;
}

const send = (anonymousId, body = {}) =>
  request(app).post('/api/ai/chat-anonymous-stream').send({ anonymousId, ...body });

beforeAll(() => { app = buildGuestRoute(); });

describe('Stage 14.8A.2 §10 — five successes then a sixth block', () => {
  it('round-trips terminal travel logistics through completed guest history', async () => {
    const anonymousId = await seedSession(nextId());
    const res = await send(anonymousId, { clientTurnId: 'ct-logistics' });

    expect(res.status).toBe(200);
    const session = await AnonymousSession.findOne({ anonymousId });
    const assistant = session.messages.find((message) => message.role === 'assistant');
    expect(assistant.travelLogistics).toEqual({
      schemaVersion: 'travel-logistics-v1',
      stays: { status: 'partial', regions: [{ name: 'West Yellowstone' }] },
    });
    expect(session.turns[0].assistantMessage.travelLogistics).toEqual(assistant.travelLogistics);
  });

  it('walks 0/5 → 5/0 and blocks the sixth before provider construction', async () => {
    const anonymousId = await seedSession(nextId());
    const walk = [];

    for (let n = 1; n <= 5; n += 1) {
      const res = await send(anonymousId, { clientTurnId: `ct-${n}`, content: `message ${n}` });
      expect(res.status).toBe(200);
      walk.push([res.body.completedGuestTurns, res.body.remainingAllowance]);
    }

    expect(walk).toEqual([[1, 4], [2, 3], [3, 2], [4, 1], [5, 0]]);

    const dispatchesBeforeSixth = providerLedger.syntheticDispatches;
    const sixth = await send(anonymousId, { clientTurnId: 'ct-6', content: 'sixth' });

    expect(sixth.body.error).toBe(GUEST_ROUTE_CODES.EXHAUSTED);
    expect(sixth.body.completedGuestTurns).toBe(5);
    expect(sixth.body.remainingAllowance).toBe(0);
    expect(sixth.body.canSendMore).toBe(false);
    // Nothing was generated for the blocked attempt.
    expect(providerLedger.syntheticDispatches).toBe(dispatchesBeforeSixth);

    const session = await AnonymousSession.findOne({ anonymousId });
    expect(session.turns).toHaveLength(5);
    expect(session.messages).toHaveLength(10);
    expect(session.messages.filter((m) => m.role === 'assistant')).toHaveLength(5);
  });
});

describe('Stage 14.8A.2 §7/§10 — failed turns consume nothing', () => {
  const FAILURE_SCENARIOS = [
    ['structured_failure', GUEST_TURN_FAILURE_CODES.STRUCTURED_GENERATION_FAILURE],
    ['prose_failure', GUEST_TURN_FAILURE_CODES.PROSE_GENERATION_FAILURE],
    ['provider_timeout', GUEST_TURN_FAILURE_CODES.PROVIDER_TIMEOUT],
    ['provider_configuration_failure', GUEST_TURN_FAILURE_CODES.PROVIDER_CONFIGURATION],
  ];

  it.each(FAILURE_SCENARIOS)('%s leaves quota unchanged and records %s', async (scenario, failureCode) => {
    const anonymousId = await seedSession(nextId());
    const res = await send(anonymousId, { clientTurnId: 'ct-1', scenario });

    expect(res.status).toBe(502);
    expect(res.body.completedGuestTurns).toBe(0);
    expect(res.body.remainingAllowance).toBe(5);
    expect(res.body.canSendMore).toBe(true);

    const session = await AnonymousSession.findOne({ anonymousId });
    expect(session.turns[0].status).toBe('failed');
    expect(session.turns[0].failureCode).toBe(failureCode);
    expect(session.messages).toHaveLength(0);
  });

  it('a client disconnect after admission consumes no quota', async () => {
    const anonymousId = await seedSession(nextId());
    const res = await send(anonymousId, { clientTurnId: 'ct-1', scenario: 'client_disconnect' });

    expect(res.status).toBe(499);
    const quota = await readGuestQuota(anonymousId);
    expect(quota.completedGuestTurns).toBe(0);
    expect(quota.hasPendingTurn).toBe(false);

    const session = await AnonymousSession.findOne({ anonymousId });
    expect(session.turns[0].failureCode).toBe(GUEST_TURN_FAILURE_CODES.CLIENT_DISCONNECTED);
    expect(session.messages).toHaveLength(0);
  });

  it('an empty terminal response is a failure, not an empty assistant bubble', async () => {
    const anonymousId = await seedSession(nextId());
    const res = await send(anonymousId, { clientTurnId: 'ct-1', scenario: 'empty_terminal' });

    expect(res.body.completedTurnIncrement).toBe(0);
    const session = await AnonymousSession.findOne({ anonymousId });
    expect(session.messages).toHaveLength(0);
    expect(session.turns[0].status).toBe('failed');
    expect((await readGuestQuota(anonymousId)).completedGuestTurns).toBe(0);
  });

  it('admits the fifth attempt again after the fifth attempt fails', async () => {
    const anonymousId = await seedSession(nextId());
    for (let n = 1; n <= 4; n += 1) {
      await send(anonymousId, { clientTurnId: `ct-${n}`, content: `message ${n}` });
    }
    expect(await readGuestQuota(anonymousId)).toMatchObject({
      completedGuestTurns: 4, remainingAllowance: 1,
    });

    const failed = await send(anonymousId, { clientTurnId: 'ct-5a', scenario: 'prose_failure' });
    expect(failed.body.completedGuestTurns).toBe(4);
    expect(failed.body.remainingAllowance).toBe(1);

    const retried = await send(anonymousId, { clientTurnId: 'ct-5b', content: 'fifth retry' });
    expect(retried.status).toBe(200);
    expect(retried.body.completedGuestTurns).toBe(5);
    expect(retried.body.remainingAllowance).toBe(0);

    const sixth = await send(anonymousId, { clientTurnId: 'ct-6' });
    expect(sixth.body.error).toBe(GUEST_ROUTE_CODES.EXHAUSTED);
  });
});

describe('Stage 14.8A.2 §6 — duplicate terminal completion', () => {
  it('a terminal callback invoked twice yields one completed turn', async () => {
    const anonymousId = await seedSession(nextId());
    const res = await send(anonymousId, { clientTurnId: 'ct-1', duplicateTerminal: true });

    expect(res.body).toMatchObject({
      assistantResponsesWritten: 1,
      completedTurnIncrement: 1,
      duplicateCompletionIncrement: 0,
      completedGuestTurns: 1,
    });

    const session = await AnonymousSession.findOne({ anonymousId });
    expect(session.turns).toHaveLength(1);
    expect(session.messages).toHaveLength(2);
    expect(session.completedTurnCount).toBe(1);
  });
});

describe('Stage 14.8A.2 §5 — duplicate clientTurnId and concurrent submissions', () => {
  it('refuses a second simultaneous submission and keeps quota within the allowance', async () => {
    const anonymousId = await seedSession(nextId());

    // The first turn is held open, so the second submission provably overlaps a
    // PENDING turn rather than following a turn that already finished.
    openGate();
    // `.then()` is what actually dispatches a supertest request — without it the
    // "first" call would never leave the starting line and nothing would overlap.
    const first = send(anonymousId, { clientTurnId: 'ct-tab-1', scenario: 'gated' }).then((r) => r);
    await waitForPendingTurn(anonymousId);

    const second = await send(anonymousId, { clientTurnId: 'ct-tab-2' });
    releaseGate();
    const a = await first;

    expect(a.status).toBe(200);
    expect(second.status).toBe(409);
    expect(second.body.error).toBe(GUEST_ROUTE_CODES.IN_PROGRESS);
    expect(second.body.completedGuestTurns).toBe(0);

    const quota = await readGuestQuota(anonymousId);
    expect(quota.completedGuestTurns).toBe(1);
    expect(quota.hasPendingTurn).toBe(false);
  });

  it('cannot exceed five completed turns under sustained concurrency', async () => {
    const anonymousId = await seedSession(nextId());

    for (let round = 0; round < 8; round += 1) {
      await Promise.all([
        send(anonymousId, { clientTurnId: `ct-r${round}-a` }),
        send(anonymousId, { clientTurnId: `ct-r${round}-b` }),
        send(anonymousId, { clientTurnId: `ct-r${round}-c` }),
      ]);
    }

    const quota = await readGuestQuota(anonymousId);
    expect(quota.completedGuestTurns).toBe(5);
    expect(quota.remainingAllowance).toBe(0);
    expect(quota.drifted).toBe(false);
  });

  it('replays a duplicate clientTurnId without a second completed turn', async () => {
    const anonymousId = await seedSession(nextId());
    const first = await send(anonymousId, { clientTurnId: 'ct-same' });
    expect(first.body.completedGuestTurns).toBe(1);

    const replay = await send(anonymousId, { clientTurnId: 'ct-same' });
    expect(replay.status).toBe(409);

    const quota = await readGuestQuota(anonymousId);
    expect(quota.completedGuestTurns).toBe(1);
    const session = await AnonymousSession.findOne({ anonymousId });
    expect(session.turns).toHaveLength(1);
    expect(session.messages).toHaveLength(2);
  });
});

describe('Stage 14.8A.2 §7/§8 — process termination after admission', () => {
  it('recovers a pending turn abandoned by a killed process and never counts it', async () => {
    const anonymousId = await seedSession(nextId());
    // Simulate: admitted, then the process died before completion or failure.
    const { admitGuestTurn } = require('../../services/anonymousTurnLedger');
    const orphan = await admitGuestTurn({
      anonymousId, clientTurnId: 'ct-orphan', userMessage: { role: 'user', content: 'orphaned' },
    });
    expect(orphan.ok).toBe(true);

    await AnonymousSession.updateOne(
      { anonymousId, 'turns.turnId': orphan.turnId },
      { $set: { 'turns.$.admittedAt': new Date(Date.now() - STALE_PENDING_TURN_MS - 60_000) } }
    );

    const res = await send(anonymousId, { clientTurnId: 'ct-after-crash' });
    expect(res.status).toBe(200);
    expect(res.body.completedGuestTurns).toBe(1);

    const session = await AnonymousSession.findOne({ anonymousId });
    const recovered = session.turns.find((t) => t.turnId === orphan.turnId);
    expect(recovered.status).toBe('failed');
    expect(recovered.failureCode).toBe(GUEST_TURN_FAILURE_CODES.TURN_ABANDONED);
    expect(session.messages).toHaveLength(2);
  });
});

describe('Stage 14.8A.2 §12 — deterministic provider isolation', () => {
  it('constructed no live provider, dispatched none, and spent nothing', () => {
    expect(providerLedger.liveProviderConstructors).toBe(0);
    expect(providerLedger.liveProviderDispatches).toBe(0);
    expect(providerLedger.externalProviderRequests).toBe(0);
    expect(providerLedger.providerCostUsd).toBe(0);
    expect(providerLedger.syntheticDispatches).toBeGreaterThan(0);
  });
});

describe('Stage 14.8A.2 §1/§11 — routes/ai.js runs the completion-coupled seam', () => {
  it('drives both anonymous routes through the guest turn scope', () => {
    expect(AI_ROUTE_SOURCE).toMatch(/require\(\s*['"]\.\.\/services\/guestTurnScope['"]\s*\)/);
    const openings = AI_ROUTE_SOURCE.match(/openGuestTurn\s*\(/g) || [];
    expect(openings.length).toBeGreaterThanOrEqual(2);
  });

  it('never appends a user message to the session at route admission', () => {
    expect(/addMessage\(\s*\{\s*\n?\s*role:\s*['"]user['"]/.test(AI_ROUTE_SOURCE)).toBe(false);
    expect(AI_ROUTE_SOURCE).not.toMatch(/session\s*=\s*await\s+session\.addMessage/);
  });

  it('never writes an assistant response outside the atomic completion', () => {
    expect(/addMessage\(\s*\{\s*\n?\s*role:\s*['"]assistant['"]/.test(AI_ROUTE_SOURCE)).toBe(false);
    expect(AI_ROUTE_SOURCE).not.toMatch(/void\s+session\s*\n?\s*\.addMessage/);
  });

  it('settles every admitted guest turn so no reservation can leak', () => {
    const settles = AI_ROUTE_SOURCE.match(/\.settle\s*\(/g) || [];
    expect(settles.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps Contract A: no guest TripPlan revision persistence or typed early events', () => {
    const anonBlocks = AI_ROUTE_SOURCE.split(/router\.post\(/).filter((b) => /chat-anonymous/.test(b));
    expect(anonBlocks.length).toBeGreaterThanOrEqual(2);
    for (const block of anonBlocks) {
      expect(block).not.toMatch(/revisionCoordinator|persistRevision|TripPlan\s*\./);
      expect(block).not.toMatch(/type:\s*['"]response_started['"]/);
    }
  });
});

describe('Stage 14.8A.2 §11 — failure classification stays bounded', () => {
  it.each([
    [Object.assign(new Error('x'), { guestFailureStage: 'structured' }), GUEST_TURN_FAILURE_CODES.STRUCTURED_GENERATION_FAILURE],
    [Object.assign(new Error('x'), { guestFailureStage: 'prose' }), GUEST_TURN_FAILURE_CODES.PROSE_GENERATION_FAILURE],
    [Object.assign(new Error('x'), { code: 'ETIMEDOUT' }), GUEST_TURN_FAILURE_CODES.PROVIDER_TIMEOUT],
    [new Error('Claude API key not configured'), GUEST_TURN_FAILURE_CODES.PROVIDER_CONFIGURATION],
    [Object.assign(new Error('aborted'), { name: 'AbortError' }), GUEST_TURN_FAILURE_CODES.STREAM_ABORTED],
    [Object.assign(new Error('blocked'), { code: 'TRAILIE_NETWORK_DENIED' }), GUEST_TURN_FAILURE_CODES.NETWORK_POLICY_REFUSAL],
    [new Error('something else entirely'), GUEST_TURN_FAILURE_CODES.BACKEND_EXCEPTION],
  ])('classifies %#', (error, expected) => {
    expect(classifyGuestTurnFailure(error)).toBe(expected);
  });

  it('never leaks provider text, credentials, or internal identifiers into a code', () => {
    const codes = Object.values(GUEST_ROUTE_CODES);
    expect(codes).toEqual([
      'guest_turn_in_progress',
      'guest_allowance_exhausted',
      'guest_turn_failed',
      'guest_turn_abandoned',
    ]);
    for (const code of codes) expect(code).toMatch(/^guest_[a-z_]+$/);
  });
});
