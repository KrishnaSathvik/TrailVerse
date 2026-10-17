import { isDeclaredUiOnly } from '@/lib/messageOwnership';

/**
 * P0-2 (audit 2026-08-31) — restore reconciliation.
 *
 * Server restore is authoritative history, but applying it must be idempotent
 * and must never destroy live client state. The old behavior replaced the
 * whole transcript with whatever the restore source produced, which could
 * erase an in-flight turn (mid-generation) or stack duplicate conversations.
 *
 * Rules:
 * - An empty or chrome-only transcript adopts the restored history wholesale.
 * - Otherwise the existing transcript is the base and is never mutated or
 *   reordered; restored turns are added only when provably absent.
 * - Identity is structural: an assistant turn is identified by responseId,
 *   and a restored user message travels with the assistant turn it precedes
 *   (server history stores completed turns as user/assistant pairs).
 *   Message text is never used as identity — two legitimate identical
 *   prompts must both survive.
 * - A restored turn without a usable identity is skipped when the client
 *   already has a conversation: it cannot be proven absent, and risking a
 *   duplicate of a live turn is worse than waiting for the next
 *   authoritative restore.
 */

const hasRealUserTurn = (messages = []) =>
  messages.some((m) => m?.role === 'user' && !isDeclaredUiOnly(m));

/** Groups a flat restored history into turns: [{ userMessages, assistant }]. */
const groupRestoredTurns = (restored = []) => {
  const turns = [];
  let pendingUsers = [];
  for (const message of restored) {
    if (message?.role === 'assistant') {
      turns.push({ userMessages: pendingUsers, assistant: message });
      pendingUsers = [];
    } else if (message?.role === 'user') {
      pendingUsers.push(message);
    }
  }
  if (pendingUsers.length > 0) {
    turns.push({ userMessages: pendingUsers, assistant: null });
  }
  return turns;
};

export function reconcileRestoredConversation(existing = [], restored = []) {
  const existingList = Array.isArray(existing) ? existing : [];
  const restoredList = Array.isArray(restored) ? restored : [];

  if (!hasRealUserTurn(existingList)) {
    return restoredList;
  }

  const knownResponseIds = new Set(
    existingList
      .filter((m) => m?.role === 'assistant' && m.responseId)
      .map((m) => m.responseId)
  );

  const additions = [];
  for (const turn of groupRestoredTurns(restoredList)) {
    const responseId = turn.assistant?.responseId;
    if (!responseId) continue; // unidentifiable against a live transcript
    if (knownResponseIds.has(responseId)) continue; // already present — existing copy wins
    additions.push(...turn.userMessages, turn.assistant);
  }

  if (additions.length === 0) return existingList;
  return [...existingList, ...additions];
}
