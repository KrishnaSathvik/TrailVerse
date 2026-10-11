'use strict';

const { selectGuestConversation } = require('../utils/guestConversationScope');
const { buildPlanDocument } = require('../utils/trailiePipelineUtils');
const { prepareCanonicalStoreCommit } = require('./trailieCanonicalCommit');

// The existing guest turn ledger owns both history and memory atomically.
// There is no second guest collection or pre-model memory write.
// Before durable completion, the same write-candidate + response-identity
// contract as TripPlan runs via prepareCanonicalStoreCommit.
function createSimpleGuestStore({ AnonymousSession, anonymousId, turn, conversationId = null }) {
  return {
    async load() {
      const session = await AnonymousSession.findOne({ anonymousId }).lean();
      if (!session) throw Object.assign(new Error('Session unavailable'), { status: 404 });
      if (conversationId && session.conversationConversions?.[conversationId]) throw Object.assign(new Error('Conversation already saved to an account'), { status: 409 });
      const scoped = selectGuestConversation(session, conversationId);
      const planMessage = [...scoped.messages].reverse().find(m => m.role === 'assistant' && m.canonicalPlan?.days?.length);
      // Same plain-JSON snapshot as the account store: stored Dates (e.g.
      // sourceReferences[].observedAt) must not hash differently from the
      // JSON clones the guard compares untouched days against.
      return JSON.parse(JSON.stringify({ userId: anonymousId, conversation: scoped.messages,
        plan: planMessage ? buildPlanDocument({ itineraryData: planMessage.canonicalPlan, identity: planMessage }) : null,
        planningState: scoped.planningState }));
    },
    async commit({ response, mutation, snapshot, message, signal }) {
      if (signal?.aborted) return { ok: false, status: 499 };
      const prepared = prepareCanonicalStoreCommit({
        snapshot,
        response,
        message: typeof message === 'string' ? message : '',
        mutation,
        operation: (snapshot.conversation || []).length ? 'update' : 'create',
        targetTripId: null,
      });
      if (!prepared.ok) return prepared;
      const completed = await turn.complete({ role: 'assistant', ...response, conversationId,
        planningState: mutation?.planningState || snapshot?.planningState || null,
        // Persist the exact payload whose hash the response carries. Storage
        // metadata belongs on the plan document, not inside the hashed payload.
        ...(prepared.plan ? { canonicalPlan: response.itineraryData } : {}) },
      { planningState: mutation?.planningState });
      return {
        ok: completed.completed === true,
        status: completed.completed ? 200 : 409,
        code: completed.completed ? undefined : (completed.code || 'canonical_write_conflict'),
        quota: completed,
        canonicalPlan: prepared.plan,
      };
    },
  };
}

module.exports = { createSimpleGuestStore };
