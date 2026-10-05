'use strict';

/**
 * Stage 8 — public share payload builder (privacy default).
 *
 * F-PERSIST-2: the old share endpoint returned the ENTIRE conversation (every
 * user message: home location, dates, budget, family/health notes). Sharing a
 * trip must not mean publishing the whole AI conversation.
 *
 * The default scope is `plan_only`. Broader exposure is an explicit, per-trip
 * opt-in chosen by the owner when creating the share link.
 */

const {
  PUBLIC_NOTES_STATUS,
  VIEWER_CONTEXT,
  deriveTrailieStoredPresentation,
} = require('./trailieStoredPresentation');

const { projectPublicPlan } = require('./planProjection');

const SHARE_SCOPE = {
  PLAN_ONLY: 'plan_only',
  PLAN_PLUS_EXPLANATION: 'plan_plus_explanation',
  FULL_CONVERSATION: 'full_conversation',
};

function normalizeShareScope(scope) {
  return Object.values(SHARE_SCOPE).includes(scope) ? scope : SHARE_SCOPE.PLAN_ONLY;
}

/**
 * Stage 14.7F5 §11 — ALLOWLIST, not denylist.
 *
 * This used to delete a list of known-internal keys. The plan is
 * `Schema.Types.Mixed`, so any internal field added later became public
 * automatically and silently. Now a key survives only by being named in
 * `PUBLIC_PLAN_FIELDS`; canonical identity, lifecycle and reviewer/audit
 * metadata are all absent by construction, and the recipient gets the coarse
 * `notesStatus` instead.
 */
function sanitizePlan(plan) {
  if (!plan || typeof plan !== 'object') return plan || null;
  if (Array.isArray(plan)) return [...plan];
  return projectPublicPlan(plan);
}

/** Public messages carry only role + content — no provider/model/reviewMeta/feedback. */
function sanitizeMessage(message) {
  return { role: message.role, content: message.content };
}

/**
 * Stage 14.5 — decide what a stored assistant turn contributes to a share.
 *
 * A revision-1 turn has `content: ''`. Publishing it as-is would render an empty
 * assistant bubble for the recipient, which is exactly the "valid itinerary looks
 * broken" failure this stage exists to remove. It is dropped instead, and the
 * coarse `notesStatus` carries the fact that notes are not available yet.
 */
function selectSharedAssistantMessages(conversation, plan) {
  const out = [];
  for (const message of conversation) {
    if (message.role !== 'assistant') {
      out.push(message);
      continue;
    }
    const presentation = deriveTrailieStoredPresentation({
      response: message,
      canonicalPlan: plan,
      viewerContext: VIEWER_CONTEXT.SHARED,
      recoveryCapability: false,
    });
    // Only prose the resolver considers safe to display is published.
    if (presentation.showProse) out.push(message);
  }
  return out;
}

function selectConversation(conversation = [], scope, plan = null) {
  if (scope === SHARE_SCOPE.FULL_CONVERSATION) {
    return selectSharedAssistantMessages(conversation, plan).map(sanitizeMessage);
  }
  if (scope === SHARE_SCOPE.PLAN_PLUS_EXPLANATION) {
    return selectSharedAssistantMessages(
      conversation.filter((m) => m.role === 'assistant'),
      plan
    ).map(sanitizeMessage);
  }
  return []; // plan_only
}

/**
 * The coarse public notes state, derived from the LATEST assistant turn. Bounded
 * to `complete` | `not_available` — never the internal lifecycle enum, and it
 * never overrides the share scope.
 */
function deriveNotesStatus(conversation = [], plan = null) {
  const assistants = conversation.filter((m) => m.role === 'assistant');
  const latest = assistants[assistants.length - 1];
  if (!latest) return PUBLIC_NOTES_STATUS.NOT_AVAILABLE;

  return deriveTrailieStoredPresentation({
    response: latest,
    canonicalPlan: plan,
    viewerContext: VIEWER_CONTEXT.SHARED,
    recoveryCapability: false,
  }).publicNotesStatus;
}

/**
 * @param {Object} trip - stored TripPlan (or plain object)
 * @param {{scope?: string, sharedBy?: Object|null}} options
 */
function buildSharedTripPayload(trip, { scope, sharedBy = null } = {}) {
  const resolvedScope = normalizeShareScope(scope);

  const payload = {
    title: trip.title,
    parkName: trip.parkName,
    plan: sanitizePlan(trip.plan),
    conversation: selectConversation(trip.conversation, resolvedScope, trip.plan),
    // Stage 14.5 — coarse, public-safe. Tells a recipient that an itinerary
    // without notes is intentional, not broken.
    notesStatus: deriveNotesStatus(trip.conversation, trip.plan),
    createdAt: trip.createdAt,
    scope: resolvedScope,
    sharedBy,
  };

  // Private planning inputs (home city, budget, dates) are only shared when the
  // owner explicitly opts into full-conversation sharing.
  if (resolvedScope === SHARE_SCOPE.FULL_CONVERSATION && trip.formData) {
    payload.formData = trip.formData;
  }

  return payload;
}

module.exports = {
  SHARE_SCOPE,
  normalizeShareScope,
  sanitizePlan,
  deriveNotesStatus,
  buildSharedTripPayload,
};
