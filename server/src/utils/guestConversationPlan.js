'use strict';

/**
 * The latest canonical plan a conversation's ASSISTANT messages carry.
 *
 * Guest conversations persist each accepted plan on the AnonymousSession's
 * assistant messages (`canonicalPlan`), but that plan never reached the
 * prepared-context's `existingCanonicalPlan` — so a continuation like
 * "Make day 2 more relaxed." was classified as a brand-new itinerary request
 * and regenerated the whole trip. Every downstream layer (turn understanding,
 * traveler-job resolution, artifact floor, plan patching) is already
 * prior-plan-aware; this helper is how the guest path shows them the plan.
 *
 * Server-persisted messages only: a plan is taken exclusively from an
 * assistant-role message, so client-supplied user content can never inject
 * one. Returns null when no assistant message carries a plan with days —
 * including after a fresh-entry reset clears the session's messages.
 */
function latestCanonicalPlanFromMessages(messages) {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role !== 'assistant') continue;
    const plan = message.canonicalPlan;
    if (plan?.days?.length) return plan;
  }
  return null;
}

module.exports = { latestCanonicalPlanFromMessages };
