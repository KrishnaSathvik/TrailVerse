'use strict';

/**
 * Stage 14.8A.2 — completion-coupled anonymous quota semantics (Contract A).
 *
 * The previous defect: the anonymous routes appended the user message to
 * `AnonymousSession` at route admission, so a provider or backend failure after
 * admission left a counted user message with no assistant response. Quota was
 * therefore coupled to ARRIVAL, not COMPLETION.
 *
 * This ledger is the single owner of guest turn lifecycle:
 *
 *   admit    → exactly one `pending` turn (atomic, allowance-checked)
 *   complete → `pending` → `completed` + terminal assistant response (atomic, idempotent)
 *   fail     → `pending` → `failed`, reservation released, quota unchanged
 *   release  → bounded stale-pending recovery after a crash or lost execution
 *
 * Only `completed` turns carrying a terminal assistant response consume quota.
 * `AnonymousSession.messages` is written ONLY at completion, so completed
 * history can never contain an orphan user message or an empty assistant bubble.
 *
 * This module performs no provider work and constructs no provider client.
 */

const crypto = require('crypto');
const AnonymousSession = require('../models/AnonymousSession');
const {
  GUEST_TURN_ALLOWANCE,
  countCompletedTurns,
  findPendingTurn,
  remainingAllowance,
} = require('../utils/guestTurnQuota');

/**
 * Bounded stale-pending timeout (§8). Comfortably above the slowest reviewed
 * guest generation (tool-first itinerary + prose) so a live turn is never
 * abandoned mid-flight, and short enough that a crashed process cannot block a
 * guest for the remainder of the 48h session.
 */
const STALE_PENDING_TURN_MS = 5 * 60 * 1000;

/**
 * Failed-turn retention policy (§7): keep the most recent 3 failed turns per
 * session for diagnostics, prune older ones. Failed turns never count as
 * completed and never mutate canonical planning state. Retryable failures may
 * be projected into session-status as truthful transcript, distinct from
 * `messages` completed history.
 */
const MAX_RETAINED_FAILED_TURNS = 3;

const GUEST_TURN_FAILURE_CODES = Object.freeze({
  PROVIDER_CONFIGURATION: 'provider_configuration_failure',
  PROVIDER_FAILURE: 'provider_http_failure',
  PROVIDER_TIMEOUT: 'provider_timeout',
  STRUCTURED_GENERATION_FAILURE: 'structured_generation_failure',
  PROSE_GENERATION_FAILURE: 'prose_generation_failure',
  STREAM_ABORTED: 'stream_aborted',
  CLIENT_DISCONNECTED: 'client_disconnected',
  BACKEND_EXCEPTION: 'backend_exception',
  NETWORK_POLICY_REFUSAL: 'network_policy_refusal',
  EMPTY_TERMINAL_RESPONSE: 'empty_terminal_response',
  PREFLIGHT_BLOCKED: 'preflight_blocked',
  TURN_ABANDONED: 'turn_abandoned',
});

/** Known traveler-visible failures that may restore as retryable transcript. */
const RETRYABLE_GUEST_FAILURE_CODES = Object.freeze(new Set([
  GUEST_TURN_FAILURE_CODES.PROVIDER_CONFIGURATION,
  GUEST_TURN_FAILURE_CODES.PROVIDER_FAILURE,
  GUEST_TURN_FAILURE_CODES.PROVIDER_TIMEOUT,
  GUEST_TURN_FAILURE_CODES.STRUCTURED_GENERATION_FAILURE,
  GUEST_TURN_FAILURE_CODES.PROSE_GENERATION_FAILURE,
  GUEST_TURN_FAILURE_CODES.BACKEND_EXCEPTION,
  GUEST_TURN_FAILURE_CODES.NETWORK_POLICY_REFUSAL,
  GUEST_TURN_FAILURE_CODES.EMPTY_TERMINAL_RESPONSE,
  GUEST_TURN_FAILURE_CODES.PREFLIGHT_BLOCKED,
]));

/** Bounded route-facing codes (§11). No provider detail, no internal identifiers. */
const GUEST_ROUTE_CODES = Object.freeze({
  IN_PROGRESS: 'guest_turn_in_progress',
  EXHAUSTED: 'guest_allowance_exhausted',
  FAILED: 'guest_turn_failed',
  ABANDONED: 'guest_turn_abandoned',
});

/**
 * Server-side authoritative completed-turn predicate, expressed for the query
 * planner so admission can check the allowance atomically against the explicit
 * turn records rather than the cached counter.
 */
const COMPLETED_TURN_COUNT_EXPR = {
  $size: {
    $filter: {
      input: { $ifNull: ['$turns', []] },
      as: 'turn',
      cond: {
        $and: [
          { $eq: ['$$turn.status', 'completed'] },
          { $gt: [{ $strLenCP: { $ifNull: ['$$turn.assistantMessage.content', ''] } }, 0] },
        ],
      },
    },
  },
};

function normalizeMessage(message, role) {
  if (!message) return null;
  const content = typeof message.content === 'string' ? message.content : '';
  if (!content) return null;
  return {
    role,
    content,
    timestamp: message.timestamp instanceof Date ? message.timestamp : new Date(),
    ...(message.provider ? { provider: message.provider } : {}),
    ...(message.model ? { model: message.model } : {}),
    ...(Number.isFinite(message.responseTime) ? { responseTime: message.responseTime } : {}),
    ...(message.travelLogistics ? { travelLogistics: message.travelLogistics } : {}),
    ...(message.canonicalPlan ? { canonicalPlan: message.canonicalPlan } : {}),
    ...(message.responseArtifacts ? { responseArtifacts: message.responseArtifacts } : {}),
    ...(message.intent ? { intent: message.intent } : {}),
    ...(message.presentation ? { presentation: message.presentation } : {}),
    // WP-TU Phase 3 Task 8B — same additive field, same allowlist pattern
    // as intent/presentation immediately above.
    ...(message.activeTripPresentation ? { activeTripPresentation: message.activeTripPresentation } : {}),
    // WP-TU Phase 4 Task 10 — same additive field, same allowlist pattern.
    ...(message.targetTripId ? { targetTripId: message.targetTripId } : {}),
    ...(message.itineraryHash ? { itineraryHash: message.itineraryHash } : {}),
    ...(message.contentHash ? { contentHash: message.contentHash } : {}),
    ...(message.responseId ? { responseId: message.responseId } : {}),
    ...(Number.isFinite(message.responseVersion) ? { responseVersion: message.responseVersion } : {}),
    ...(Number.isFinite(message.responseRevision) ? { responseRevision: message.responseRevision } : {}),
    ...(message.lifecycleStatus ? { lifecycleStatus: message.lifecycleStatus } : {}),
    ...(message.presentationKind ? { presentationKind: message.presentationKind } : {}),
    ...(message.parkName ? { parkName: message.parkName } : {}),
    ...(Array.isArray(message.parkNames) && message.parkNames.length ? { parkNames: message.parkNames } : {}),
    ...(message.hasLiveData ? { hasLiveData: true } : {}),
    ...(message.hasWebSearch ? { hasWebSearch: true } : {}),
  };
}

function countCompletedGuestTurns(session) {
  return countCompletedTurns(session?.turns);
}

function detectCompletedTurnCounterDrift(session) {
  const authoritativeCompletedTurns = countCompletedGuestTurns(session);
  const cachedCompletedTurnCount = Number.isFinite(session?.completedTurnCount)
    ? session.completedTurnCount
    : 0;
  return {
    drifted: cachedCompletedTurnCount !== authoritativeCompletedTurns,
    cachedCompletedTurnCount,
    authoritativeCompletedTurns,
  };
}

/** Quota projection built from the explicit turn records only. */
function projectGuestQuota(session) {
  if (!session) {
    return {
      exists: false,
      completedGuestTurns: 0,
      remainingAllowance: GUEST_TURN_ALLOWANCE,
      hasPendingTurn: false,
      pendingTurnId: null,
      ...detectCompletedTurnCounterDrift(null),
    };
  }
  const completedGuestTurns = countCompletedGuestTurns(session);
  const pending = findPendingTurn(session.turns);
  return {
    exists: true,
    completedGuestTurns,
    remainingAllowance: remainingAllowance(completedGuestTurns),
    hasPendingTurn: Boolean(pending),
    pendingTurnId: pending ? pending.turnId : null,
    ...detectCompletedTurnCounterDrift(session),
  };
}

async function readGuestQuota(anonymousId) {
  const session = await AnonymousSession.findOne({ anonymousId });
  return { anonymousId, ...projectGuestQuota(session) };
}

/** Keeps the failed-turn diagnostic window bounded. Never touches other statuses. */
async function pruneFailedTurns(anonymousId) {
  const session = await AnonymousSession.findOne({ anonymousId }).select('turns');
  if (!session) return;
  const failed = (session.turns || []).filter((turn) => turn.status === 'failed');
  if (failed.length <= MAX_RETAINED_FAILED_TURNS) return;
  const excess = failed
    .slice(0, failed.length - MAX_RETAINED_FAILED_TURNS)
    .map((turn) => turn.turnId);
  await AnonymousSession.updateOne(
    { anonymousId },
    { $pull: { turns: { turnId: { $in: excess }, status: 'failed' } } }
  );
}

/**
 * §8 — bounded stale-pending recovery. Ownership-scoped to one anonymousId and
 * structurally incapable of altering a completed turn (the array filter matches
 * `pending` only), so quota is unchanged by definition.
 */
async function releaseStalePendingTurns({ anonymousId, now = new Date() } = {}) {
  const cutoff = new Date(now.getTime() - STALE_PENDING_TURN_MS);

  const session = await AnonymousSession.findOne({ anonymousId }).select('turns');
  const staleTurnIds = (session?.turns || [])
    .filter((turn) => turn.status === 'pending' && turn.admittedAt && turn.admittedAt < cutoff)
    .map((turn) => turn.turnId);

  if (staleTurnIds.length === 0) return { releasedTurnIds: [] };

  await AnonymousSession.updateOne(
    { anonymousId },
    {
      $set: {
        'turns.$[stale].status': 'failed',
        'turns.$[stale].failedAt': now,
        'turns.$[stale].failureCode': GUEST_TURN_FAILURE_CODES.TURN_ABANDONED,
      },
    },
    {
      arrayFilters: [
        { 'stale.turnId': { $in: staleTurnIds }, 'stale.status': 'pending' },
      ],
    }
  );

  await pruneFailedTurns(anonymousId);
  return { releasedTurnIds: staleTurnIds };
}

/**
 * §5 — atomic admission. One conditional update simultaneously verifies:
 *   completedGuestTurns < allowance   (against the explicit records, via $expr)
 *   no other pending turn for the session
 *   no existing turn with this clientTurnId
 * and creates exactly one pending turn. Two concurrent submissions cannot both
 * be admitted, so quota can never be driven past the allowance.
 */
async function admitGuestTurn({
  anonymousId,
  clientTurnId,
  userMessage,
  now = new Date(),
  trusted = false,
}) {
  if (!anonymousId) throw new Error('admitGuestTurn requires anonymousId');
  const normalizedUserMessage = normalizeMessage({ ...userMessage, timestamp: now }, 'user');
  if (!normalizedUserMessage) throw new Error('admitGuestTurn requires a non-empty user message');

  const stableClientTurnId = clientTurnId || `srv-${crypto.randomUUID()}`;

  await releaseStalePendingTurns({ anonymousId, now });

  // A trusted MCP caller is not a browser guest: it is not allowance-limited and
  // may have several turns in flight. clientTurnId de-duplication still applies,
  // and its completed turns are still recorded, so an untrusted guest on the
  // same session can never gain allowance from them.
  const admissionConditions = [
    { turns: { $not: { $elemMatch: { clientTurnId: stableClientTurnId } } } },
    ...(trusted
      ? []
      : [
        { turns: { $not: { $elemMatch: { status: 'pending' } } } },
        { $expr: { $lt: [COMPLETED_TURN_COUNT_EXPR, GUEST_TURN_ALLOWANCE] } },
      ]),
  ];

  const turnId = crypto.randomUUID();
  const admitted = await AnonymousSession.findOneAndUpdate(
    {
      anonymousId,
      $and: admissionConditions,
    },
    {
      $push: {
        turns: {
          turnId,
          clientTurnId: stableClientTurnId,
          status: 'pending',
          userMessage: normalizedUserMessage,
          admittedAt: now,
        },
      },
      $set: { lastActivity: now },
    },
    { new: true }
  );

  if (admitted) {
    return { ok: true, turnId, clientTurnId: stableClientTurnId, ...projectGuestQuota(admitted) };
  }

  // Admission was refused — diagnose against current state for a bounded code.
  const session = await AnonymousSession.findOne({ anonymousId });
  const quota = projectGuestQuota(session);

  if (!session) {
    return { ok: false, code: GUEST_ROUTE_CODES.ABANDONED, turnId: null, ...quota };
  }

  const duplicate = session.turns.find((turn) => turn.clientTurnId === stableClientTurnId);
  if (duplicate) {
    return {
      ok: false,
      duplicate: true,
      turnId: duplicate.turnId,
      clientTurnId: stableClientTurnId,
      status: duplicate.status,
      code: duplicate.status === 'pending' ? GUEST_ROUTE_CODES.IN_PROGRESS : GUEST_ROUTE_CODES.FAILED,
      ...quota,
    };
  }

  if (quota.hasPendingTurn) {
    return { ok: false, code: GUEST_ROUTE_CODES.IN_PROGRESS, turnId: null, ...quota };
  }

  if (quota.completedGuestTurns >= GUEST_TURN_ALLOWANCE) {
    return { ok: false, code: GUEST_ROUTE_CODES.EXHAUSTED, turnId: null, ...quota };
  }

  return { ok: false, code: GUEST_ROUTE_CODES.ABANDONED, turnId: null, ...quota };
}

/**
 * §6 — atomic successful completion. The conditional update matches only a
 * turn that is still `pending`, so a duplicate `done`, a reconnect
 * reconciliation, or a retried persistence write is a no-op: exactly one
 * assistant response is written and the completed count increments exactly once.
 */
async function completeGuestTurn({
  anonymousId,
  turnId,
  assistantMessage,
  planningState = undefined,
  now = new Date(),
}) {
  const noop = {
    completed: false,
    alreadyCompleted: false,
    assistantResponsesWritten: 0,
    completedTurnIncrement: 0,
  };

  const normalizedAssistant = normalizeMessage({ ...assistantMessage, timestamp: now }, 'assistant');
  if (!normalizedAssistant) {
    return { ...noop, code: GUEST_TURN_FAILURE_CODES.EMPTY_TERMINAL_RESPONSE };
  }

  const current = await AnonymousSession.findOne({ anonymousId }).select('turns');
  const pendingTurn = (current?.turns || []).find((turn) => turn.turnId === turnId);
  // The user message is immutable after admission, so reading it here cannot
  // race with the conditional update below.
  const userMessage = pendingTurn?.userMessage
    ? normalizeMessage(pendingTurn.userMessage, 'user')
    : null;

  const updated = await AnonymousSession.findOneAndUpdate(
    { anonymousId, turns: { $elemMatch: { turnId, status: 'pending' } } },
    {
      $set: {
        'turns.$.status': 'completed',
        'turns.$.completedAt': now,
        'turns.$.assistantMessage': normalizedAssistant,
        lastActivity: now,
        ...(planningState && typeof planningState === 'object' ? { planningState } : {}),
      },
      ...(userMessage
        ? { $push: { messages: { $each: [userMessage, normalizedAssistant] } } }
        : { $push: { messages: normalizedAssistant } }),
      $inc: { completedTurnCount: 1, messageCount: userMessage ? 2 : 1 },
    },
    { new: true }
  );

  if (updated) {
    return {
      completed: true,
      alreadyCompleted: false,
      assistantResponsesWritten: 1,
      completedTurnIncrement: 1,
      turnId,
      ...projectGuestQuota(updated),
    };
  }

  const session = await AnonymousSession.findOne({ anonymousId });
  const quota = projectGuestQuota(session);
  const turn = (session?.turns || []).find((t) => t.turnId === turnId);

  if (turn?.status === 'completed') {
    return { ...noop, alreadyCompleted: true, turnId, code: null, ...quota };
  }
  if (turn?.status === 'failed') {
    return { ...noop, turnId, code: GUEST_ROUTE_CODES.FAILED, ...quota };
  }
  return { ...noop, turnId, code: GUEST_ROUTE_CODES.ABANDONED, ...quota };
}

/**
 * §7 — failure/abort. Releases the reservation without touching quota. The
 * conditional update matches `pending` only, so a completed turn can never be
 * downgraded by a late failure signal.
 */
async function failGuestTurn({ anonymousId, turnId, failureCode, now = new Date() }) {
  const code = failureCode || GUEST_TURN_FAILURE_CODES.BACKEND_EXCEPTION;

  const updated = await AnonymousSession.findOneAndUpdate(
    { anonymousId, turns: { $elemMatch: { turnId, status: 'pending' } } },
    {
      $set: {
        'turns.$.status': 'failed',
        'turns.$.failedAt': now,
        'turns.$.failureCode': code,
        lastActivity: now,
      },
    },
    { new: true }
  );

  if (!updated) {
    const session = await AnonymousSession.findOne({ anonymousId });
    return { failed: false, turnId, failureCode: code, ...projectGuestQuota(session) };
  }

  await pruneFailedTurns(anonymousId);
  const session = await AnonymousSession.findOne({ anonymousId });
  return { failed: true, turnId, failureCode: code, ...projectGuestQuota(session) };
}

module.exports = {
  GUEST_TURN_ALLOWANCE,
  GUEST_TURN_FAILURE_CODES,
  RETRYABLE_GUEST_FAILURE_CODES,
  GUEST_ROUTE_CODES,
  MAX_RETAINED_FAILED_TURNS,
  STALE_PENDING_TURN_MS,
  admitGuestTurn,
  completeGuestTurn,
  countCompletedGuestTurns,
  detectCompletedTurnCounterDrift,
  failGuestTurn,
  projectGuestQuota,
  readGuestQuota,
  releaseStalePendingTurns,
};
