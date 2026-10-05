'use strict';

const { buildPlanDocument } = require('../utils/trailiePipelineUtils');

// The existing guest turn ledger owns both history and memory atomically.
// There is no second guest collection or pre-model memory write.
function createSimpleGuestStore({ AnonymousSession, anonymousId, turn }) {
  return {
    async load() {
      const session = await AnonymousSession.findOne({ anonymousId }).lean();
      if (!session) throw Object.assign(new Error('Session unavailable'), { status: 404 });
      const planMessage = [...(session.messages || [])].reverse().find(m => m.role === 'assistant' && m.canonicalPlan?.days?.length);
      return { userId: anonymousId, conversation: session.messages || [],
        plan: planMessage ? buildPlanDocument({ itineraryData: planMessage.canonicalPlan, identity: planMessage }) : null,
        planningState: session.planningState || null };
    },
    async commit({ response, mutation, signal }) {
      if (signal?.aborted) return { ok: false, status: 499 };
      const canonicalPlan = mutation?.plan ? buildPlanDocument({ itineraryData: response.itineraryData, identity: response }) : null;
      const completed = await turn.complete({ role: 'assistant', ...response,
        // Persist the exact payload whose hash the response carries. Storage
        // metadata belongs on the plan document, not inside the hashed payload.
        ...(canonicalPlan ? { canonicalPlan: response.itineraryData } : {}) },
      { planningState: mutation?.planningState });
      return { ok: completed.completed === true, status: completed.completed ? 200 : 409, quota: completed, canonicalPlan };
    },
  };
}

module.exports = { createSimpleGuestStore };
