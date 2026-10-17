import { beforeEach, describe, expect, it } from 'vitest';

import {
  GUEST_TURN_REFUSAL_CODES,
  clearGuestPendingTurn,
  createGuestClientTurnId,
  isComposerEnabled,
  markGuestTurnFailed,
  readGuestPendingTurn,
  recordGuestPendingTurn,
  selectCompletedGuestHistory,
  shouldMirrorGuestHistory,
} from '../guestTurnLifecycle';
import { ANONYMOUS_MESSAGE_LIMIT, isAnonymousLimitReached } from '../anonymousChatLimits';
import { wasGuestTurnConsumedByServer } from '@/utils/trailieTurnOutcome';

const userMessage = (over = {}) => ({ id: 'u1', role: 'user', content: 'Plan Yosemite', ...over });
const assistantMessage = (over = {}) => ({ id: 'a1', role: 'assistant', content: 'Here you go', ...over });

describe('Stage 14.8A.2 §9 — guest client turn identity', () => {
  it('mints a distinct stable id per submission', () => {
    const a = createGuestClientTurnId();
    const b = createGuestClientTurnId();
    expect(typeof a).toBe('string');
    expect(a.length).toBeGreaterThan(8);
    expect(a).not.toBe(b);
  });
});

describe('Stage 14.8A.2 §9 — optimistic turn is never mistaken for completed', () => {
  it('marks the optimistic user message as failed rather than leaving it pending', () => {
    const messages = [userMessage({ clientTurnId: 'ct-1', isPending: true })];
    const next = markGuestTurnFailed(messages, { clientTurnId: 'ct-1' });

    expect(next[0].isPending).toBe(false);
    expect(next[0].guestTurnFailed).toBe(true);
    expect(next[0].role).toBe('user');
  });

  it('leaves other turns untouched when one fails', () => {
    const messages = [
      userMessage({ id: 'u0', clientTurnId: 'ct-0' }),
      assistantMessage({ id: 'a0' }),
      userMessage({ id: 'u1', clientTurnId: 'ct-1', isPending: true }),
    ];
    const next = markGuestTurnFailed(messages, { clientTurnId: 'ct-1' });

    expect(next[0]).toEqual(messages[0]);
    expect(next[1]).toEqual(messages[1]);
    expect(next[2].guestTurnFailed).toBe(true);
  });

  it('never leaves a permanent pending spinner after a failure', () => {
    const messages = [userMessage({ clientTurnId: 'ct-1', isPending: true })];
    const next = markGuestTurnFailed(messages, { clientTurnId: 'ct-1' });
    expect(next.some((m) => m.isPending)).toBe(false);
  });

  it('excludes a failed optimistic turn from the mirrored history', () => {
    const messages = [
      userMessage({ id: 'u0', clientTurnId: 'ct-0' }),
      assistantMessage({ id: 'a0' }),
      userMessage({ id: 'u1', clientTurnId: 'ct-1', guestTurnFailed: true }),
    ];

    expect(selectCompletedGuestHistory(messages)).toEqual([messages[0], messages[1]]);
  });

  it('excludes a still-pending optimistic turn from the mirrored history', () => {
    const messages = [
      userMessage({ id: 'u0', clientTurnId: 'ct-0' }),
      assistantMessage({ id: 'a0' }),
      userMessage({ id: 'u1', clientTurnId: 'ct-1', isPending: true }),
    ];

    expect(selectCompletedGuestHistory(messages)).toEqual([messages[0], messages[1]]);
  });

  it('drops a trailing user message with no assistant reply', () => {
    const messages = [userMessage({ id: 'u0', clientTurnId: 'ct-0' })];
    expect(selectCompletedGuestHistory(messages)).toEqual([]);
  });

  it('drops a streaming assistant placeholder', () => {
    const messages = [
      userMessage({ id: 'u0' }),
      assistantMessage({ id: 'a0', isStreaming: true, content: 'partial' }),
    ];
    expect(selectCompletedGuestHistory(messages)).toEqual([]);
  });

  it('drops an empty assistant bubble', () => {
    const messages = [userMessage({ id: 'u0' }), assistantMessage({ id: 'a0', content: '   ' })];
    expect(selectCompletedGuestHistory(messages)).toEqual([]);
  });
});

describe('Stage 14.8A.2 §9 — localStorage mirrors completed history only', () => {
  it('mirrors only after a terminal successful response', () => {
    expect(shouldMirrorGuestHistory({ status: 'completed' })).toBe(true);
    expect(shouldMirrorGuestHistory({ status: 'pending' })).toBe(false);
    expect(shouldMirrorGuestHistory({ status: 'failed' })).toBe(false);
    expect(shouldMirrorGuestHistory({})).toBe(false);
  });

  it('is not an independent quota source — it carries no allowance decision', () => {
    // The mirror records what the SERVER completed; the remaining allowance is
    // always read back from the server response, never derived locally.
    const mirrored = selectCompletedGuestHistory([
      userMessage({ id: 'u0' }), assistantMessage({ id: 'a0' }),
      userMessage({ id: 'u1' }), assistantMessage({ id: 'a1' }),
    ]);
    expect(mirrored).toHaveLength(4);
    expect(isAnonymousLimitReached({ canSendMore: true, messageCount: 2 })).toBe(false);
    expect(isAnonymousLimitReached({ canSendMore: false, messageCount: 2 })).toBe(true);
  });
});

describe('Stage 14.8A.2 §9 — pending turn marker survives a refresh without becoming completed', () => {
  beforeEach(() => window.localStorage.clear());

  it('records and clears a pending turn marker', () => {
    recordGuestPendingTurn({ anonymousId: 'anon-1', clientTurnId: 'ct-1' });
    expect(readGuestPendingTurn()).toMatchObject({ anonymousId: 'anon-1', clientTurnId: 'ct-1' });

    clearGuestPendingTurn();
    expect(readGuestPendingTurn()).toBeNull();
  });

  it('does not leave a pending marker that could be mistaken for completed history', () => {
    recordGuestPendingTurn({ anonymousId: 'anon-1', clientTurnId: 'ct-1' });
    const stored = readGuestPendingTurn();
    expect(stored.status).toBe('pending');
    expect(shouldMirrorGuestHistory(stored)).toBe(false);
  });
});

describe('Stage 14.8A.2 §9 — the composer re-enables after bounded failure handling', () => {
  it('is enabled at rest with allowance remaining', () => {
    expect(isComposerEnabled({ isGenerating: false, canSendMore: true, hasPendingTurn: false })).toBe(true);
  });

  it('is disabled while a turn is generating', () => {
    expect(isComposerEnabled({ isGenerating: true, canSendMore: true, hasPendingTurn: false })).toBe(false);
  });

  it('re-enables after a failure clears the pending turn', () => {
    expect(isComposerEnabled({ isGenerating: false, canSendMore: true, hasPendingTurn: true })).toBe(false);
    expect(isComposerEnabled({ isGenerating: false, canSendMore: true, hasPendingTurn: false })).toBe(true);
  });

  it('stays disabled once the allowance is exhausted', () => {
    expect(isComposerEnabled({ isGenerating: false, canSendMore: false, hasPendingTurn: false })).toBe(false);
  });
});

describe('Phase 6A.1 Part 2 — guest mirror aligned to the server ledger, not the display classification', () => {
  it('wasGuestTurnConsumedByServer: a real success was consumed', () => {
    expect(wasGuestTurnConsumedByServer({ trailieV2: { status: 'complete' } })).toBe(true);
  });

  it('wasGuestTurnConsumedByServer: a genuine failure was NOT consumed', () => {
    expect(wasGuestTurnConsumedByServer({ trailieV2: { status: 'failed' } })).toBe(false);
  });

  it('wasGuestTurnConsumedByServer: plan_target_unresolved was ALSO not consumed — the server ' +
    'calls guestTurn.fail() for every non-complete status, even the ones displayed as ordinary ' +
    'messages (see routes/ai.js)', () => {
    expect(wasGuestTurnConsumedByServer({
      trailieV2: { status: 'plan_target_unresolved', terminalReason: 'plan_target_not_found' },
    })).toBe(false);
    expect(wasGuestTurnConsumedByServer({
      trailieV2: { status: 'plan_target_unresolved', terminalReason: 'plan_target_ambiguous' },
    })).toBe(false);
  });

  it('wasGuestTurnConsumedByServer: no trailieV2 field defaults to consumed (conservative — unchanged prior behavior)', () => {
    expect(wasGuestTurnConsumedByServer({ content: 'hi' })).toBe(true);
    expect(wasGuestTurnConsumedByServer(null)).toBe(true);
  });

  // Refresh/restoration: this is what TripPlannerChat.jsx now does at the
  // point it previously called settleGuestOptimisticTurn('completed')
  // unconditionally — mirroring markGuestTurnFailed's real shape.
  function settleAsServerWouldRecord(messages, { clientTurnId, data }) {
    return wasGuestTurnConsumedByServer(data)
      ? messages.map((m) => (m.clientTurnId === clientTurnId ? { ...m, isPending: false } : m))
      : markGuestTurnFailed(messages, { clientTurnId });
  }

  it('a genuine V2 failure never survives a refresh as a completed exchange', () => {
    const messages = [
      userMessage({ id: 'u1', clientTurnId: 'ct-1', isPending: true }),
      assistantMessage({ id: 'a1', content: "I couldn't finish that one." }),
    ];
    const settled = settleAsServerWouldRecord(messages, {
      clientTurnId: 'ct-1',
      data: { trailieV2: { status: 'failed', terminalReason: 'routing_exhausted' } },
    });
    // LocalStorage still must not treat a retryable failure as completed history.
    expect(selectCompletedGuestHistory(settled)).toEqual([]);
  });

  it('restored retryable failures stay visible in UI state but are not mirrored as completed history', () => {
    const restored = [
      userMessage({ id: 'u1', content: 'Compare Zion and Bryce for a first-timer who wants easier hiking.' }),
      assistantMessage({
        id: 'a1',
        content: "I couldn't finish that one.",
        outcomeClass: 'retryable_failure',
        lifecycleStatus: 'failed',
      }),
    ];
    expect(selectCompletedGuestHistory(restored)).toEqual([]);
  });

  it('an ambiguous/not_found historical reference ALSO never survives a refresh, even though it displays as an ordinary message', () => {
    const messages = [
      userMessage({ id: 'u1', clientTurnId: 'ct-1', isPending: true }),
      assistantMessage({ id: 'a1', content: "I couldn't find a saved trip for that — nothing was changed." }),
    ];
    const settled = settleAsServerWouldRecord(messages, {
      clientTurnId: 'ct-1',
      data: { trailieV2: { status: 'plan_target_unresolved', terminalReason: 'plan_target_not_found' } },
    });
    expect(selectCompletedGuestHistory(settled)).toEqual([]);
  });

  it('a genuine success still survives a refresh exactly as before', () => {
    const messages = [
      userMessage({ id: 'u1', clientTurnId: 'ct-1', isPending: true }),
      assistantMessage({ id: 'a1', content: 'Here is your plan.' }),
    ];
    const settled = settleAsServerWouldRecord(messages, {
      clientTurnId: 'ct-1',
      data: { trailieV2: { status: 'complete' } },
    });
    expect(selectCompletedGuestHistory(settled)).toEqual([
      { ...messages[0], isPending: false },
      messages[1],
    ]);
  });

  it('an earlier, genuinely completed turn in the same conversation is untouched by a later failure', () => {
    const messages = [
      userMessage({ id: 'u0', clientTurnId: 'ct-0' }),
      assistantMessage({ id: 'a0', content: 'Earlier real answer.' }),
      userMessage({ id: 'u1', clientTurnId: 'ct-1', isPending: true }),
      assistantMessage({ id: 'a1', content: "I couldn't finish that one." }),
    ];
    const settled = settleAsServerWouldRecord(messages, {
      clientTurnId: 'ct-1',
      data: { trailieV2: { status: 'failed' } },
    });
    expect(selectCompletedGuestHistory(settled)).toEqual([messages[0], messages[1]]);
  });
});

describe('Stage 14.8A.2 §11 — bounded refusal codes the browser can act on', () => {
  it('pins the four codes', () => {
    expect(GUEST_TURN_REFUSAL_CODES).toEqual({
      IN_PROGRESS: 'guest_turn_in_progress',
      EXHAUSTED: 'guest_allowance_exhausted',
      FAILED: 'guest_turn_failed',
      ABANDONED: 'guest_turn_abandoned',
    });
  });
});

describe('Stage 14.8A.2 §4 — the limit helper follows completed turns', () => {
  it('treats the allowance as reached at exactly five completed turns', () => {
    expect(ANONYMOUS_MESSAGE_LIMIT).toBe(5);
    expect(isAnonymousLimitReached({ canSendMore: true, messageCount: 4 })).toBe(false);
    expect(isAnonymousLimitReached({ canSendMore: true, messageCount: 5 })).toBe(true);
  });

  it('does not treat a pending or failed attempt as consumed allowance', () => {
    // The server reports completed turns only; the browser never adds its own.
    expect(isAnonymousLimitReached({ canSendMore: true, messageCount: 0 })).toBe(false);
  });
});
