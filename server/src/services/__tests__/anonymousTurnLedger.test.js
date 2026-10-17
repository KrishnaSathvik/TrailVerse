'use strict';

/**
 * Stage 14.8A.2 §3–§8 — completion-coupled anonymous quota semantics.
 *
 * A guest quota unit is ONE logical turn:
 *   one admitted user message + one successful terminal assistant response.
 *
 * These tests pin the canonical ledger: pending and failed turns consume zero
 * quota, completion is atomic and idempotent, and a crashed pending turn cannot
 * permanently block the guest. No provider is constructed or dispatched here.
 */

const AnonymousSession = require('../../models/AnonymousSession');
const {
  GUEST_TURN_ALLOWANCE,
  GUEST_TURN_FAILURE_CODES,
  STALE_PENDING_TURN_MS,
  admitGuestTurn,
  completeGuestTurn,
  countCompletedGuestTurns,
  detectCompletedTurnCounterDrift,
  failGuestTurn,
  readGuestQuota,
  releaseStalePendingTurns,
} = require('../anonymousTurnLedger');

const SESSION_DEFAULTS = {
  ipAddress: '127.0.0.1',
  userAgent: 'stage14_8a2-suite',
  browserFingerprint: 'fp-stage14_8a2',
};

let seq = 0;
const nextId = (prefix) => `${prefix}-${Date.now()}-${(seq += 1)}`;

async function createSession(anonymousId) {
  return AnonymousSession.findOrCreateSession(anonymousId, { ...SESSION_DEFAULTS });
}

async function completedTurn(anonymousId, n) {
  const admitted = await admitGuestTurn({
    anonymousId,
    clientTurnId: `ct-${anonymousId}-${n}`,
    userMessage: { role: 'user', content: `guest message ${n}` },
  });
  expect(admitted.ok).toBe(true);
  const done = await completeGuestTurn({
    anonymousId,
    turnId: admitted.turnId,
    assistantMessage: { role: 'assistant', content: `assistant response ${n}`, provider: 'synthetic' },
  });
  expect(done.completedTurnIncrement).toBe(1);
  return admitted.turnId;
}

describe('Stage 14.8A.2 §3 — canonical guest logical-turn contract', () => {
  it('allows five completed turns', () => {
    expect(GUEST_TURN_ALLOWANCE).toBe(5);
  });

  it('admits a turn as pending with explicit lifecycle fields', async () => {
    const anonymousId = nextId('anon');
    await createSession(anonymousId);

    const admitted = await admitGuestTurn({
      anonymousId,
      clientTurnId: 'ct-1',
      userMessage: { role: 'user', content: 'Plan me a Yosemite weekend' },
    });

    expect(admitted.ok).toBe(true);
    expect(typeof admitted.turnId).toBe('string');

    const session = await AnonymousSession.findOne({ anonymousId });
    expect(session.turns).toHaveLength(1);
    const turn = session.turns[0];
    expect(turn.turnId).toBe(admitted.turnId);
    expect(turn.clientTurnId).toBe('ct-1');
    expect(turn.status).toBe('pending');
    expect(turn.userMessage.content).toBe('Plan me a Yosemite weekend');
    expect(turn.assistantMessage).toBeFalsy();
    expect(turn.admittedAt).toBeInstanceOf(Date);
    expect(turn.completedAt).toBeFalsy();
    expect(turn.failedAt).toBeFalsy();
    expect(turn.failureCode).toBeFalsy();
  });

  it('does not write the user message into completed history at admission', async () => {
    const anonymousId = nextId('anon');
    await createSession(anonymousId);

    await admitGuestTurn({
      anonymousId,
      clientTurnId: 'ct-1',
      userMessage: { role: 'user', content: 'admitted only' },
    });

    const session = await AnonymousSession.findOne({ anonymousId });
    expect(session.messages).toHaveLength(0);
  });

  it('persists the canonical plan on the completed assistant response', async () => {
    const anonymousId = nextId('anon');
    await createSession(anonymousId);
    const admitted = await admitGuestTurn({
      anonymousId,
      clientTurnId: 'ct-plan',
      userMessage: { role: 'user', content: 'Plan a Zion day' },
    });
    const canonicalPlan = {
      parkName: 'Zion National Park',
      days: [{ dayNumber: 1, stops: [{ name: 'Pa’rus Trail' }] }],
    };

    await completeGuestTurn({
      anonymousId,
      turnId: admitted.turnId,
      assistantMessage: {
        role: 'assistant',
        content: 'Here is your Zion plan.',
        canonicalPlan,
        itineraryHash: 'hash-zion',
        responseId: 'response-zion',
      },
    });

    const session = await AnonymousSession.findOne({ anonymousId });
    const assistant = session.messages.find((message) => message.role === 'assistant');
    expect(assistant.canonicalPlan).toEqual(canonicalPlan);
    expect(assistant.itineraryHash).toBe('hash-zion');
    expect(assistant.responseId).toBe('response-zion');
  });

  // WP-TU Phase 3 Task 8B — activeTripPresentation (Task 7B's field) must
  // survive the real completion write (normalizeMessage + the
  // AnonymousSession schema), the same way intent/presentation already do
  // above, so a guest's header survives a cold reload.
  it('persists activeTripPresentation on the completed assistant response', async () => {
    const anonymousId = nextId('anon');
    await createSession(anonymousId);
    const admitted = await admitGuestTurn({
      anonymousId,
      clientTurnId: 'ct-active-trip-presentation',
      userMessage: { role: 'user', content: 'Actually plan Badlands instead' },
    });
    const activeTripPresentation = {
      destination: { parkCode: 'badl', parkName: 'Badlands National Park' },
      activeContextAction: 'set',
    };

    await completeGuestTurn({
      anonymousId,
      turnId: admitted.turnId,
      assistantMessage: {
        role: 'assistant',
        content: 'Actually plan Badlands instead.',
        activeTripPresentation,
      },
    });

    const session = await AnonymousSession.findOne({ anonymousId });
    const assistant = session.messages.find((message) => message.role === 'assistant');
    expect(assistant.activeTripPresentation).toEqual(activeTripPresentation);
  });
});

describe('Stage 14.8A.2 §4 — authoritative completed-turn quota', () => {
  it('counts a pending turn as zero completed quota', async () => {
    const anonymousId = nextId('anon');
    await createSession(anonymousId);
    await admitGuestTurn({ anonymousId, clientTurnId: 'ct-1', userMessage: { role: 'user', content: 'hi' } });

    const quota = await readGuestQuota(anonymousId);
    expect(quota.completedGuestTurns).toBe(0);
    expect(quota.remainingAllowance).toBe(5);
  });

  it('counts a failed turn as zero completed quota', async () => {
    const anonymousId = nextId('anon');
    await createSession(anonymousId);
    const admitted = await admitGuestTurn({
      anonymousId, clientTurnId: 'ct-1', userMessage: { role: 'user', content: 'hi' },
    });
    await failGuestTurn({
      anonymousId, turnId: admitted.turnId, failureCode: GUEST_TURN_FAILURE_CODES.PROVIDER_FAILURE,
    });

    const quota = await readGuestQuota(anonymousId);
    expect(quota.completedGuestTurns).toBe(0);
    expect(quota.remainingAllowance).toBe(5);
  });

  it('counts a completed turn as exactly one completed quota', async () => {
    const anonymousId = nextId('anon');
    await createSession(anonymousId);
    await completedTurn(anonymousId, 1);

    const quota = await readGuestQuota(anonymousId);
    expect(quota.completedGuestTurns).toBe(1);
    expect(quota.remainingAllowance).toBe(4);
  });

  it('ignores user-role messages that have no completed logical turn', async () => {
    const anonymousId = nextId('anon');
    const session = await createSession(anonymousId);
    // Simulate the previous defect shape: raw user messages with no turn record.
    session.messages.push(
      { role: 'user', content: 'orphan 1' },
      { role: 'user', content: 'orphan 2' },
      { role: 'user', content: 'orphan 3' }
    );
    await session.save();

    const quota = await readGuestQuota(anonymousId);
    expect(quota.completedGuestTurns).toBe(0);
    expect(quota.remainingAllowance).toBe(5);
  });

  it('never counts a completed turn that has no terminal assistant response', async () => {
    const anonymousId = nextId('anon');
    const session = await createSession(anonymousId);
    session.turns.push({
      turnId: 'forged',
      clientTurnId: 'ct-forged',
      status: 'completed',
      userMessage: { role: 'user', content: 'forged' },
      admittedAt: new Date(),
      completedAt: new Date(),
    });
    await session.save();

    expect(countCompletedGuestTurns(await AnonymousSession.findOne({ anonymousId }))).toBe(0);
  });

  it('detects drift between the cached counter and the explicit turn records', async () => {
    const anonymousId = nextId('anon');
    await createSession(anonymousId);
    await completedTurn(anonymousId, 1);

    const clean = await AnonymousSession.findOne({ anonymousId });
    expect(detectCompletedTurnCounterDrift(clean)).toEqual({
      drifted: false, cachedCompletedTurnCount: 1, authoritativeCompletedTurns: 1,
    });

    await AnonymousSession.updateOne({ anonymousId }, { $set: { completedTurnCount: 4 } });
    const dirty = await AnonymousSession.findOne({ anonymousId });
    expect(detectCompletedTurnCounterDrift(dirty)).toEqual({
      drifted: true, cachedCompletedTurnCount: 4, authoritativeCompletedTurns: 1,
    });
    // The explicit records stay authoritative even while the cache is wrong.
    expect((await readGuestQuota(anonymousId)).completedGuestTurns).toBe(1);
  });
});

describe('Stage 14.8A.2 §5 — atomic turn admission', () => {
  it('refuses a second concurrent submission for the same session', async () => {
    const anonymousId = nextId('anon');
    await createSession(anonymousId);

    const [a, b] = await Promise.all([
      admitGuestTurn({ anonymousId, clientTurnId: 'ct-a', userMessage: { role: 'user', content: 'a' } }),
      admitGuestTurn({ anonymousId, clientTurnId: 'ct-b', userMessage: { role: 'user', content: 'b' } }),
    ]);

    const admitted = [a, b].filter((r) => r.ok);
    const refused = [a, b].filter((r) => !r.ok);
    expect(admitted).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect(refused[0].code).toBe('guest_turn_in_progress');

    const session = await AnonymousSession.findOne({ anonymousId });
    expect(session.turns.filter((t) => t.status === 'pending')).toHaveLength(1);
  });

  it('treats a duplicate clientTurnId as idempotent rather than a new turn', async () => {
    const anonymousId = nextId('anon');
    await createSession(anonymousId);

    const first = await admitGuestTurn({
      anonymousId, clientTurnId: 'ct-dupe', userMessage: { role: 'user', content: 'once' },
    });
    const second = await admitGuestTurn({
      anonymousId, clientTurnId: 'ct-dupe', userMessage: { role: 'user', content: 'once' },
    });

    expect(second.ok).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.turnId).toBe(first.turnId);

    const session = await AnonymousSession.findOne({ anonymousId });
    expect(session.turns).toHaveLength(1);
  });

  it('reports a completed duplicate clientTurnId without creating a second turn', async () => {
    const anonymousId = nextId('anon');
    await createSession(anonymousId);
    await completedTurn(anonymousId, 1);

    const replay = await admitGuestTurn({
      anonymousId, clientTurnId: `ct-${anonymousId}-1`, userMessage: { role: 'user', content: 'guest message 1' },
    });

    expect(replay.ok).toBe(false);
    expect(replay.duplicate).toBe(true);
    expect(replay.status).toBe('completed');
    expect((await readGuestQuota(anonymousId)).completedGuestTurns).toBe(1);
  });

  it('blocks admission once five turns have completed', async () => {
    const anonymousId = nextId('anon');
    await createSession(anonymousId);
    for (let n = 1; n <= 5; n += 1) await completedTurn(anonymousId, n);

    const sixth = await admitGuestTurn({
      anonymousId, clientTurnId: 'ct-6', userMessage: { role: 'user', content: 'sixth' },
    });

    expect(sixth.ok).toBe(false);
    expect(sixth.code).toBe('guest_allowance_exhausted');
    expect(sixth.completedGuestTurns).toBe(5);
    expect(sixth.remainingAllowance).toBe(0);

    const session = await AnonymousSession.findOne({ anonymousId });
    expect(session.turns).toHaveLength(5);
  });

  it('cannot admit past the allowance under concurrent pressure', async () => {
    const anonymousId = nextId('anon');
    await createSession(anonymousId);
    for (let n = 1; n <= 4; n += 1) await completedTurn(anonymousId, n);

    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        admitGuestTurn({ anonymousId, clientTurnId: `ct-race-${i}`, userMessage: { role: 'user', content: 'race' } })
      )
    );

    const admitted = results.filter((r) => r.ok);
    expect(admitted).toHaveLength(1);
    await completeGuestTurn({
      anonymousId, turnId: admitted[0].turnId,
      assistantMessage: { role: 'assistant', content: 'fifth', provider: 'synthetic' },
    });
    expect((await readGuestQuota(anonymousId)).completedGuestTurns).toBe(5);
  });
});

describe('Stage 14.8A.2 §5 — trusted MCP admission is not guest-quota limited', () => {
  it('admits past the allowance and alongside a pending turn when trusted', async () => {
    const anonymousId = nextId('anon');
    await createSession(anonymousId);
    for (let n = 1; n <= 5; n += 1) await completedTurn(anonymousId, n);

    const trusted = await admitGuestTurn({
      anonymousId, clientTurnId: 'ct-mcp-1', userMessage: { role: 'user', content: 'mcp' }, trusted: true,
    });
    expect(trusted.ok).toBe(true);

    const concurrent = await admitGuestTurn({
      anonymousId, clientTurnId: 'ct-mcp-2', userMessage: { role: 'user', content: 'mcp 2' }, trusted: true,
    });
    expect(concurrent.ok).toBe(true);
  });

  it('still refuses a duplicate clientTurnId when trusted', async () => {
    const anonymousId = nextId('anon');
    await createSession(anonymousId);
    await admitGuestTurn({
      anonymousId, clientTurnId: 'ct-mcp', userMessage: { role: 'user', content: 'mcp' }, trusted: true,
    });
    const replay = await admitGuestTurn({
      anonymousId, clientTurnId: 'ct-mcp', userMessage: { role: 'user', content: 'mcp' }, trusted: true,
    });
    expect(replay.ok).toBe(false);
    expect(replay.duplicate).toBe(true);
  });

  it('does not let a trusted admission raise the untrusted guest allowance', async () => {
    const anonymousId = nextId('anon');
    await createSession(anonymousId);
    for (let n = 1; n <= 5; n += 1) await completedTurn(anonymousId, n);

    const trusted = await admitGuestTurn({
      anonymousId, clientTurnId: 'ct-mcp-1', userMessage: { role: 'user', content: 'mcp' }, trusted: true,
    });
    await completeGuestTurn({
      anonymousId, turnId: trusted.turnId, assistantMessage: { role: 'assistant', content: 'mcp answer' },
    });

    const guest = await admitGuestTurn({
      anonymousId, clientTurnId: 'ct-guest', userMessage: { role: 'user', content: 'guest' },
    });
    expect(guest.ok).toBe(false);
    expect(guest.code).toBe('guest_allowance_exhausted');
  });
});

describe('Stage 14.8A.2 §6 — atomic successful completion', () => {
  it('writes exactly one assistant response and increments once', async () => {
    const anonymousId = nextId('anon');
    await createSession(anonymousId);
    const admitted = await admitGuestTurn({
      anonymousId, clientTurnId: 'ct-1', userMessage: { role: 'user', content: 'hello' },
    });

    const result = await completeGuestTurn({
      anonymousId, turnId: admitted.turnId,
      assistantMessage: { role: 'assistant', content: 'terminal answer', provider: 'synthetic', model: 'synthetic-1' },
    });

    expect(result).toMatchObject({
      completed: true, assistantResponsesWritten: 1, completedTurnIncrement: 1,
    });

    const session = await AnonymousSession.findOne({ anonymousId });
    const turn = session.turns[0];
    expect(turn.status).toBe('completed');
    expect(turn.assistantMessage.content).toBe('terminal answer');
    expect(turn.completedAt).toBeInstanceOf(Date);
    expect(session.completedTurnCount).toBe(1);
    // Completed history gains the user/assistant pair exactly once.
    expect(session.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(session.messages[1].content).toBe('terminal answer');
  });

  it('is idempotent under a duplicate terminal callback', async () => {
    const anonymousId = nextId('anon');
    await createSession(anonymousId);
    const admitted = await admitGuestTurn({
      anonymousId, clientTurnId: 'ct-1', userMessage: { role: 'user', content: 'hello' },
    });

    const first = await completeGuestTurn({
      anonymousId, turnId: admitted.turnId,
      assistantMessage: { role: 'assistant', content: 'terminal answer' },
    });
    const second = await completeGuestTurn({
      anonymousId, turnId: admitted.turnId,
      assistantMessage: { role: 'assistant', content: 'terminal answer' },
    });

    expect(first.completedTurnIncrement).toBe(1);
    expect(second.completedTurnIncrement).toBe(0);
    expect(second.alreadyCompleted).toBe(true);
    expect(second.assistantResponsesWritten).toBe(0);

    const session = await AnonymousSession.findOne({ anonymousId });
    expect(session.turns).toHaveLength(1);
    expect(session.completedTurnCount).toBe(1);
    expect(session.messages).toHaveLength(2);
    expect((await readGuestQuota(anonymousId)).completedGuestTurns).toBe(1);
  });

  it('is idempotent under simultaneous duplicate terminal callbacks', async () => {
    const anonymousId = nextId('anon');
    await createSession(anonymousId);
    const admitted = await admitGuestTurn({
      anonymousId, clientTurnId: 'ct-1', userMessage: { role: 'user', content: 'hello' },
    });

    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        completeGuestTurn({
          anonymousId, turnId: admitted.turnId,
          assistantMessage: { role: 'assistant', content: 'terminal answer' },
        })
      )
    );

    expect(results.filter((r) => r.completedTurnIncrement === 1)).toHaveLength(1);
    const session = await AnonymousSession.findOne({ anonymousId });
    expect(session.completedTurnCount).toBe(1);
    expect(session.messages).toHaveLength(2);
  });

  it('refuses to complete a turn that already failed', async () => {
    const anonymousId = nextId('anon');
    await createSession(anonymousId);
    const admitted = await admitGuestTurn({
      anonymousId, clientTurnId: 'ct-1', userMessage: { role: 'user', content: 'hello' },
    });
    await failGuestTurn({
      anonymousId, turnId: admitted.turnId, failureCode: GUEST_TURN_FAILURE_CODES.PROVIDER_TIMEOUT,
    });

    const late = await completeGuestTurn({
      anonymousId, turnId: admitted.turnId,
      assistantMessage: { role: 'assistant', content: 'too late' },
    });

    expect(late.completed).toBe(false);
    expect(late.completedTurnIncrement).toBe(0);
    expect((await readGuestQuota(anonymousId)).completedGuestTurns).toBe(0);
    const session = await AnonymousSession.findOne({ anonymousId });
    expect(session.messages).toHaveLength(0);
  });
});

describe('Stage 14.8A.2 §7 — failure and abort behavior', () => {
  const FAILURE_PATHS = [
    GUEST_TURN_FAILURE_CODES.PROVIDER_CONFIGURATION,
    GUEST_TURN_FAILURE_CODES.PROVIDER_FAILURE,
    GUEST_TURN_FAILURE_CODES.PROVIDER_TIMEOUT,
    GUEST_TURN_FAILURE_CODES.STRUCTURED_GENERATION_FAILURE,
    GUEST_TURN_FAILURE_CODES.PROSE_GENERATION_FAILURE,
    GUEST_TURN_FAILURE_CODES.STREAM_ABORTED,
    GUEST_TURN_FAILURE_CODES.CLIENT_DISCONNECTED,
    GUEST_TURN_FAILURE_CODES.BACKEND_EXCEPTION,
    GUEST_TURN_FAILURE_CODES.NETWORK_POLICY_REFUSAL,
  ];

  it.each(FAILURE_PATHS)('%s releases the reservation and consumes no quota', async (failureCode) => {
    const anonymousId = nextId('anon');
    await createSession(anonymousId);
    const admitted = await admitGuestTurn({
      anonymousId, clientTurnId: 'ct-1', userMessage: { role: 'user', content: 'hello' },
    });

    const failed = await failGuestTurn({ anonymousId, turnId: admitted.turnId, failureCode });
    expect(failed.failed).toBe(true);

    const quota = await readGuestQuota(anonymousId);
    expect(quota.completedGuestTurns).toBe(0);
    expect(quota.remainingAllowance).toBe(5);
    expect(quota.hasPendingTurn).toBe(false);

    // The composer becomes available again: a fresh turn is admissible.
    const retry = await admitGuestTurn({
      anonymousId, clientTurnId: 'ct-retry', userMessage: { role: 'user', content: 'retry' },
    });
    expect(retry.ok).toBe(true);
  });

  it('never restores a failed turn as an assistant response in completed history', async () => {
    const anonymousId = nextId('anon');
    await createSession(anonymousId);
    const admitted = await admitGuestTurn({
      anonymousId, clientTurnId: 'ct-1', userMessage: { role: 'user', content: 'hello' },
    });
    await failGuestTurn({
      anonymousId, turnId: admitted.turnId, failureCode: GUEST_TURN_FAILURE_CODES.PROSE_GENERATION_FAILURE,
    });

    const session = await AnonymousSession.findOne({ anonymousId });
    expect(session.messages).toHaveLength(0);
    const turn = session.turns[0];
    expect(turn.status).toBe('failed');
    expect(turn.failedAt).toBeInstanceOf(Date);
    expect(turn.failureCode).toBe(GUEST_TURN_FAILURE_CODES.PROSE_GENERATION_FAILURE);
    expect(turn.assistantMessage).toBeFalsy();
  });

  it('projects a retryable failure into session transcript without planning mutation or quota', async () => {
    const { projectGuestConversationForStatus, RETRYABLE_FAILURE_PUBLIC_MESSAGE } = require('../../utils/anonymousSessionStatusMessages');
    const anonymousId = nextId('anon');
    await createSession(anonymousId);
    const admitted = await admitGuestTurn({
      anonymousId,
      clientTurnId: 'ct-q1',
      userMessage: {
        role: 'user',
        content: 'Compare Zion and Bryce for a first-timer who wants easier hiking.',
      },
    });
    await failGuestTurn({
      anonymousId,
      turnId: admitted.turnId,
      failureCode: GUEST_TURN_FAILURE_CODES.PROVIDER_FAILURE,
    });

    const session = await AnonymousSession.findOne({ anonymousId });
    expect(session.messages).toHaveLength(0);
    expect(session.planningState == null || Object.keys(session.planningState).length === 0).toBe(true);
    expect((await readGuestQuota(anonymousId)).completedGuestTurns).toBe(0);

    const projected = projectGuestConversationForStatus({
      messages: session.messages,
      turns: session.turns,
    });
    expect(projected).toHaveLength(2);
    expect(projected[0].content).toMatch(/Compare Zion and Bryce/);
    expect(projected[1]).toMatchObject({
      role: 'assistant',
      content: RETRYABLE_FAILURE_PUBLIC_MESSAGE,
      outcomeClass: 'retryable_failure',
    });
    expect(projected[1].canonicalPlan).toBeUndefined();
  });

  it('retains at most the bounded diagnostic window of failed turns', async () => {
    const anonymousId = nextId('anon');
    await createSession(anonymousId);

    for (let n = 0; n < 8; n += 1) {
      const admitted = await admitGuestTurn({
        anonymousId, clientTurnId: `ct-fail-${n}`, userMessage: { role: 'user', content: `fail ${n}` },
      });
      await failGuestTurn({
        anonymousId, turnId: admitted.turnId, failureCode: GUEST_TURN_FAILURE_CODES.PROVIDER_FAILURE,
      });
    }

    const session = await AnonymousSession.findOne({ anonymousId });
    const failed = session.turns.filter((t) => t.status === 'failed');
    expect(failed.length).toBeLessThanOrEqual(3);
    expect(failed.map((t) => t.clientTurnId)).toEqual(['ct-fail-5', 'ct-fail-6', 'ct-fail-7']);
    expect((await readGuestQuota(anonymousId)).completedGuestTurns).toBe(0);
  });

  it('does not permanently block a guest after eight consecutive failures', async () => {
    const anonymousId = nextId('anon');
    await createSession(anonymousId);
    for (let n = 0; n < 8; n += 1) {
      const admitted = await admitGuestTurn({
        anonymousId, clientTurnId: `ct-fail-${n}`, userMessage: { role: 'user', content: `fail ${n}` },
      });
      await failGuestTurn({
        anonymousId, turnId: admitted.turnId, failureCode: GUEST_TURN_FAILURE_CODES.BACKEND_EXCEPTION,
      });
    }

    await completedTurn(anonymousId, 99);
    expect((await readGuestQuota(anonymousId)).completedGuestTurns).toBe(1);
  });
});

describe('Stage 14.8A.2 §8 — stale pending-turn recovery', () => {
  it('leaves a fresh pending turn alone', async () => {
    const anonymousId = nextId('anon');
    await createSession(anonymousId);
    await admitGuestTurn({ anonymousId, clientTurnId: 'ct-1', userMessage: { role: 'user', content: 'hi' } });

    const released = await releaseStalePendingTurns({ anonymousId });
    expect(released.releasedTurnIds).toEqual([]);
    expect((await readGuestQuota(anonymousId)).hasPendingTurn).toBe(true);
  });

  it('abandons a pending turn after the bounded timeout and releases the reservation', async () => {
    const anonymousId = nextId('anon');
    await createSession(anonymousId);
    const admitted = await admitGuestTurn({
      anonymousId, clientTurnId: 'ct-1', userMessage: { role: 'user', content: 'hi' },
    });

    const now = new Date(Date.now() + STALE_PENDING_TURN_MS + 1000);
    const released = await releaseStalePendingTurns({ anonymousId, now });
    expect(released.releasedTurnIds).toEqual([admitted.turnId]);

    const session = await AnonymousSession.findOne({ anonymousId });
    expect(session.turns[0].status).toBe('failed');
    expect(session.turns[0].failureCode).toBe(GUEST_TURN_FAILURE_CODES.TURN_ABANDONED);
    const quota = await readGuestQuota(anonymousId);
    expect(quota.completedGuestTurns).toBe(0);
    expect(quota.hasPendingTurn).toBe(false);
  });

  it('admits a new turn after a crashed pending turn goes stale', async () => {
    const anonymousId = nextId('anon');
    await createSession(anonymousId);
    await admitGuestTurn({ anonymousId, clientTurnId: 'ct-crashed', userMessage: { role: 'user', content: 'hi' } });

    const blocked = await admitGuestTurn({
      anonymousId, clientTurnId: 'ct-next', userMessage: { role: 'user', content: 'next' },
    });
    expect(blocked.code).toBe('guest_turn_in_progress');

    const now = new Date(Date.now() + STALE_PENDING_TURN_MS + 1000);
    const recovered = await admitGuestTurn({
      anonymousId, clientTurnId: 'ct-next', userMessage: { role: 'user', content: 'next' }, now,
    });
    expect(recovered.ok).toBe(true);
    expect((await readGuestQuota(anonymousId)).completedGuestTurns).toBe(0);
  });

  it('is ownership-scoped and never alters another session or a completed turn', async () => {
    const mine = nextId('anon');
    const theirs = nextId('anon');
    await createSession(mine);
    await createSession(theirs);
    await completedTurn(mine, 1);
    await admitGuestTurn({ anonymousId: mine, clientTurnId: 'ct-mine-stale', userMessage: { role: 'user', content: 'x' } });
    await admitGuestTurn({ anonymousId: theirs, clientTurnId: 'ct-theirs', userMessage: { role: 'user', content: 'y' } });

    const now = new Date(Date.now() + STALE_PENDING_TURN_MS + 1000);
    await releaseStalePendingTurns({ anonymousId: mine, now });

    const mineSession = await AnonymousSession.findOne({ anonymousId: mine });
    expect(mineSession.turns.find((t) => t.clientTurnId === `ct-${mine}-1`).status).toBe('completed');
    expect(mineSession.completedTurnCount).toBe(1);

    const theirSession = await AnonymousSession.findOne({ anonymousId: theirs });
    expect(theirSession.turns[0].status).toBe('pending');
  });
});

describe('Stage 14.8A.2 §10 — guest-limit boundary behavior', () => {
  it('walks 0/5 → 5/0 and blocks the sixth admission', async () => {
    const anonymousId = nextId('anon');
    await createSession(anonymousId);

    const walk = [];
    walk.push(await readGuestQuota(anonymousId));
    for (let n = 1; n <= 5; n += 1) {
      await completedTurn(anonymousId, n);
      walk.push(await readGuestQuota(anonymousId));
    }

    expect(walk.map((q) => [q.completedGuestTurns, q.remainingAllowance])).toEqual([
      [0, 5], [1, 4], [2, 3], [3, 2], [4, 1], [5, 0],
    ]);

    const sixth = await admitGuestTurn({
      anonymousId, clientTurnId: 'ct-6', userMessage: { role: 'user', content: 'sixth' },
    });
    expect(sixth.ok).toBe(false);
    expect(sixth.code).toBe('guest_allowance_exhausted');
  });

  it('lets a failed fifth attempt be retried and still complete as the fifth turn', async () => {
    const anonymousId = nextId('anon');
    await createSession(anonymousId);
    for (let n = 1; n <= 4; n += 1) await completedTurn(anonymousId, n);
    expect(await readGuestQuota(anonymousId)).toMatchObject({ completedGuestTurns: 4, remainingAllowance: 1 });

    const attempt = await admitGuestTurn({
      anonymousId, clientTurnId: 'ct-5a', userMessage: { role: 'user', content: 'fifth' },
    });
    expect(attempt.ok).toBe(true);
    await failGuestTurn({
      anonymousId, turnId: attempt.turnId, failureCode: GUEST_TURN_FAILURE_CODES.PROVIDER_FAILURE,
    });
    expect(await readGuestQuota(anonymousId)).toMatchObject({ completedGuestTurns: 4, remainingAllowance: 1 });

    const retry = await admitGuestTurn({
      anonymousId, clientTurnId: 'ct-5b', userMessage: { role: 'user', content: 'fifth' },
    });
    expect(retry.ok).toBe(true);
    await completeGuestTurn({
      anonymousId, turnId: retry.turnId, assistantMessage: { role: 'assistant', content: 'fifth answer' },
    });
    expect(await readGuestQuota(anonymousId)).toMatchObject({ completedGuestTurns: 5, remainingAllowance: 0 });

    const sixth = await admitGuestTurn({
      anonymousId, clientTurnId: 'ct-6', userMessage: { role: 'user', content: 'sixth' },
    });
    expect(sixth.code).toBe('guest_allowance_exhausted');
  });
});

test('completion inherits scope from admission and does not overwrite another conversation memory', async () => {
  const anonymousId = nextId('scope');
  await createSession(anonymousId);
  await AnonymousSession.updateOne({ anonymousId }, { $set: { planningState: { dates: { durationDays: 3 } } } });
  const admitted = await admitGuestTurn({ anonymousId, clientTurnId: 'glacier', userMessage: { role: 'user', content: 'Five days in Glacier', conversationId: 'glacier' } });
  await completeGuestTurn({ anonymousId, turnId: admitted.turnId, assistantMessage: { role: 'assistant', content: 'Five days', conversationId: 'wrong-model-scope' }, planningState: { dates: { durationDays: 5 } } });
  const saved = await AnonymousSession.findOne({ anonymousId }).lean();
  expect(saved.messages.every(m => m.conversationId === 'glacier')).toBe(true);
  expect(saved.messages.at(-1).planningState.dates.durationDays).toBe(5);
  expect(saved.planningState.dates.durationDays).toBe(3);
});
