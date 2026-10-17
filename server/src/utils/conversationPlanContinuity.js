'use strict';

/**
 * Authenticated-unsaved plan continuity.
 *
 * An accepted canonical plan Trailie produced in this conversation must be
 * available to the next turn whether or not the traveler saved a TripPlan.
 * Guests get this from AnonymousSession.messages; a signed-in traveler with
 * no tripId previously had NO server-side conversation state, so
 * "Make day 2 more relaxed." regenerated the entire trip
 * (artifacts/trailie-refinement-containment-2026-09-02, auth repro).
 *
 * Conversational state is NOT durable persistence: one record per user, TTL'd,
 * upserted each time an authenticated turn completes with an accepted plan.
 * Saving a TripPlan remains the only durable, library-visible object, and a
 * loaded TripPlan always wins over this record (prepareChatContext order).
 *
 * TRUST MODEL — the client never supplies plan content. The stored plan is
 * server-authored at acceptance. The client's echoed transcript is only the
 * continuity signal: recall requires an incoming ASSISTANT message whose text
 * matches the server prose stored with the plan (inclusion either way on
 * normalized text, so client-side appends — photo context — and truncation
 * both survive). A new chat has no assistant history → nothing lifts; another
 * conversation echoes different prose → nothing lifts; a forged assistant
 * message can at most re-surface the same user's own stored plan.
 */

/** Below this many normalized characters a fragment proves nothing. */
const MIN_MATCH_CHARS = 40;
/** Stored key cap — inclusion matching only needs a stable prefix. */
const CONTENT_KEY_MAX_CHARS = 600;

const normalizeForMatch = (text) => String(text || '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

/**
 * @returns {null | {userId, responseId, contentKey, canonicalPlan}}
 *   null when the turn cannot be safely recalled later (no prose to match, or
 *   no real plan) — a record that can never match is not worth storing.
 */
function buildConversationPlanRecord({ userId, responseId = null, content = '', canonicalPlan = null } = {}) {
  if (!userId || !canonicalPlan?.days?.length) return null;
  const contentKey = normalizeForMatch(content).slice(0, CONTENT_KEY_MAX_CHARS);
  if (contentKey.length < MIN_MATCH_CHARS) return null;
  return { userId: String(userId), responseId, contentKey, canonicalPlan };
}

/**
 * The stored plan, iff the incoming history proves this is the same
 * conversation. Assistant-role messages only.
 */
function matchConversationPlan(record, messages) {
  if (!record?.contentKey || !record?.canonicalPlan?.days?.length) return null;
  if (!Array.isArray(messages)) return null;
  for (const message of messages) {
    if (message?.role !== 'assistant') continue;
    const incoming = normalizeForMatch(message.content);
    if (incoming.length < MIN_MATCH_CHARS) continue;
    if (incoming.includes(record.contentKey) || record.contentKey.includes(incoming)) {
      return record.canonicalPlan;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Thin model I/O — one active conversational plan per user.
// ---------------------------------------------------------------------------

function model() {
  // Lazy so the pure halves stay importable without a mongoose connection.
  // eslint-disable-next-line global-require
  return require('../models/TrailieConversationPlan');
}

/** Upsert the user's active conversational plan. Fire-and-forget safe. */
async function rememberConversationPlan({ userId, responseId, content, canonicalPlan }) {
  const record = buildConversationPlanRecord({ userId, responseId, content, canonicalPlan });
  if (!record) return false;
  await model().updateOne(
    { userId: record.userId },
    {
      $set: {
        responseId: record.responseId,
        contentKey: record.contentKey,
        canonicalPlan: record.canonicalPlan,
        updatedAt: new Date(),
      },
    },
    { upsert: true },
  );
  return true;
}

/** The user's active conversational plan, iff `messages` proves continuation. */
async function recallConversationPlan({ userId, messages }) {
  if (!userId) return null;
  const stored = await model().findOne({ userId: String(userId) }).lean();
  return matchConversationPlan(stored, messages);
}

module.exports = {
  buildConversationPlanRecord,
  matchConversationPlan,
  rememberConversationPlan,
  recallConversationPlan,
};
