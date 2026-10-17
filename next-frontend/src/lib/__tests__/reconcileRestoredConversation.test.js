import { describe, it, expect } from 'vitest';
import { reconcileRestoredConversation } from '@/lib/reconcileRestoredConversation';
import { createUiWelcomeMessage } from '@/lib/messageOwnership';

/**
 * P0-2 (audit 2026-08-31): restore must reconcile, not replace or append.
 * Server restore is authoritative history, but applying it must be idempotent
 * and must never destroy live client turns. Identity is structural
 * (responseId for assistant turns, clientTurnId for live user turns, turn
 * pairing for restored user turns) — never raw message text, because two
 * legitimate identical prompts can exist.
 */

const serverTurn = (responseId, userText, assistantText, t0) => ([
  { id: `restored-u-${responseId}`, role: 'user', content: userText, timestamp: new Date(t0) },
  {
    id: `restored-a-${responseId}`,
    role: 'assistant',
    content: assistantText,
    timestamp: new Date(t0 + 1000),
    responseId,
  },
]);

describe('reconcileRestoredConversation', () => {
  it('adopts restored history wholesale over an empty transcript', () => {
    const restored = serverTurn('r1', 'Plan me 3 days in Canyonlands.', 'Here is the plan.', 1000);
    expect(reconcileRestoredConversation([], restored)).toEqual(restored);
  });

  it('adopts restored history wholesale over welcome-only chrome', () => {
    const welcome = [createUiWelcomeMessage({ id: 1, content: 'Hey, I’m Trailie.' })];
    const restored = serverTurn('r1', 'Plan me 3 days in Canyonlands.', 'Here is the plan.', 1000);
    expect(reconcileRestoredConversation(welcome, restored)).toEqual(restored);
  });

  it('is idempotent — restoring the same history repeatedly yields one copy of each turn', () => {
    const restored = serverTurn('r1', 'Plan me 3 days in Canyonlands.', 'Here is the plan.', 1000);
    const once = reconcileRestoredConversation([], restored);
    const twice = reconcileRestoredConversation(once, restored);
    const thrice = reconcileRestoredConversation(twice, restored);
    expect(thrice).toEqual(once);
    expect(thrice.filter((m) => m.role === 'user')).toHaveLength(1);
  });

  it('keeps the existing copy of an already-present turn (no duplicate by responseId)', () => {
    const live = [
      { id: 10, role: 'user', content: 'Plan me 3 days in Canyonlands.', timestamp: new Date(1000), clientTurnId: 'ct-1' },
      { id: 11, role: 'assistant', content: 'Here is the plan.', timestamp: new Date(2000), responseId: 'r1', userFeedback: 'up' },
    ];
    const restored = serverTurn('r1', 'Plan me 3 days in Canyonlands.', 'Here is the plan.', 1000);
    const result = reconcileRestoredConversation(live, restored);
    expect(result).toHaveLength(2);
    // Existing copy wins — it may carry UI state the restored copy lacks.
    expect(result[1].userFeedback).toBe('up');
    expect(result[1].id).toBe(11);
  });

  it('never destroys a live in-flight turn that the server does not know yet', () => {
    const live = [
      { id: 10, role: 'user', content: 'Plan me 3 days in Canyonlands.', timestamp: new Date(1000), clientTurnId: 'ct-1' },
      { id: 11, role: 'assistant', content: 'Here is the plan.', timestamp: new Date(2000), responseId: 'r1' },
      { id: 12, role: 'user', content: 'Make the second morning more relaxed.', timestamp: new Date(3000), clientTurnId: 'ct-2', isPending: true },
    ];
    const restored = serverTurn('r1', 'Plan me 3 days in Canyonlands.', 'Here is the plan.', 1000);
    const result = reconcileRestoredConversation(live, restored);
    expect(result.map((m) => m.id)).toEqual([10, 11, 12]);
  });

  it('appends a restored turn the client has not seen', () => {
    const live = [
      { id: 10, role: 'user', content: 'Plan me 3 days in Canyonlands.', timestamp: new Date(1000), clientTurnId: 'ct-1' },
      { id: 11, role: 'assistant', content: 'Here is the plan.', timestamp: new Date(2000), responseId: 'r1' },
    ];
    const restored = [
      ...serverTurn('r1', 'Plan me 3 days in Canyonlands.', 'Here is the plan.', 1000),
      ...serverTurn('r2', 'Make the second morning more relaxed.', 'Done — slower Day 2.', 3000),
    ];
    const result = reconcileRestoredConversation(live, restored);
    expect(result).toHaveLength(4);
    expect(result[2].role).toBe('user');
    expect(result[3].responseId).toBe('r2');
  });

  it('does not dedupe by text — two identical prompts with distinct identities both survive', () => {
    const restored = [
      ...serverTurn('r1', 'Plan me 3 days in Canyonlands.', 'Plan A.', 1000),
      ...serverTurn('r2', 'Plan me 3 days in Canyonlands.', 'Plan B.', 3000),
    ];
    const result = reconcileRestoredConversation([], restored);
    expect(result.filter((m) => m.role === 'user')).toHaveLength(2);
    expect(result.filter((m) => m.role === 'assistant')).toHaveLength(2);
  });
});
