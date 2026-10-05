/**
 * Stage 14.8A.2 §9 — the browser side of the completion-coupled guest contract.
 *
 * The browser MAY optimistically show a user message while a request is active,
 * but that optimistic turn is not history and is not quota:
 *
 *   pending  → visible in the thread, never mirrored to localStorage
 *   failed   → visible (including after a server restore of a retryable
 *              failure), never mirrored as completed history, composer freed
 *   completed→ mirrored, and ONLY because the server said the turn completed
 *
 * The remaining allowance always comes back from the server response. Nothing
 * here derives allowance locally, so localStorage can never become an
 * independent quota source.
 */

import { TRAILIE_TURN_OUTCOME } from '@/utils/trailieTurnOutcome';

export const GUEST_TURN_REFUSAL_CODES = Object.freeze({
  IN_PROGRESS: 'guest_turn_in_progress',
  EXHAUSTED: 'guest_allowance_exhausted',
  FAILED: 'guest_turn_failed',
  ABANDONED: 'guest_turn_abandoned',
});

const PENDING_TURN_KEY = 'trailverse_guest_pending_turn';

/** Stable per-submission id so a retry or a second tab is de-duplicated server-side. */
export function createGuestClientTurnId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `ct-${crypto.randomUUID()}`;
  }
  return `ct-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Marks the optimistic turn as failed. It stays visible so the guest can see
 * what happened, but it can never be mistaken for a completed turn and it never
 * leaves a permanent spinner behind.
 */
export function markGuestTurnFailed(messages, { clientTurnId } = {}) {
  if (!Array.isArray(messages)) return [];
  return messages.map((message) => {
    if (!clientTurnId || message.clientTurnId !== clientTurnId) return message;
    return { ...message, isPending: false, isStreaming: false, guestTurnFailed: true };
  });
}

function hasRenderableContent(message) {
  return typeof message?.content === 'string' && message.content.trim().length > 0;
}

function isMirrorableUser(message) {
  return (
    message?.role === 'user' &&
    !message.isPending &&
    !message.guestTurnFailed &&
    hasRenderableContent(message)
  );
}

function isMirrorableAssistant(message) {
  return (
    message?.role === 'assistant' &&
    !message.isStreaming &&
    !message.isFinalizing &&
    !message.guestTurnFailed &&
    message.outcomeClass !== TRAILIE_TURN_OUTCOME.RETRYABLE_FAILURE &&
    hasRenderableContent(message)
  );
}

/**
 * Keeps only user/assistant pairs that actually completed. A trailing user
 * message with no reply, a pending or failed optimistic turn, a streaming
 * placeholder, and an empty assistant bubble are all dropped — so a refresh can
 * never surface a failed attempt as completed history.
 */
export function selectCompletedGuestHistory(messages) {
  if (!Array.isArray(messages)) return [];

  const completed = [];
  for (let i = 0; i < messages.length; i += 1) {
    const current = messages[i];
    if (!isMirrorableUser(current)) continue;

    const reply = messages[i + 1];
    if (!isMirrorableAssistant(reply)) continue;

    completed.push(current, reply);
    i += 1;
  }
  return completed;
}

/** The mirror is written only for a terminal successful response. */
export function shouldMirrorGuestHistory(turn) {
  return turn?.status === 'completed';
}

export function recordGuestPendingTurn({ anonymousId, clientTurnId }) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      PENDING_TURN_KEY,
      JSON.stringify({ anonymousId, clientTurnId, status: 'pending', startedAt: Date.now() })
    );
  } catch {
    // A full or unavailable store must never block a turn.
  }
}

export function readGuestPendingTurn() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PENDING_TURN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearGuestPendingTurn() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PENDING_TURN_KEY);
  } catch {
    // Non-fatal: the marker is a hint, never a quota source.
  }
}

/**
 * The composer is available whenever nothing is in flight and the server still
 * reports remaining allowance. Bounded failure handling clears `hasPendingTurn`,
 * so a failed turn always gives the composer back.
 */
export function isComposerEnabled({ isGenerating, canSendMore, hasPendingTurn }) {
  return !isGenerating && !hasPendingTurn && canSendMore !== false;
}
