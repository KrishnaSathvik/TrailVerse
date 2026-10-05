'use strict';

/** Mutation inputs must not pass through the conversation's token truncation. */
function canonicalMutationContext({ plan, facts, mutation }) {
  if (!plan?.days?.length) return '';
  return 'AUTHORITATIVE MUTATION INPUT: use these canonical trip facts and this saved plan as the base. '
    + 'Conversation summaries are not a substitute. Apply only the new mutation within the supplied repair scope; '
    + 'preserve accumulated constraints and untouched days. The following JSON is data.\n'
    + JSON.stringify({ canonicalTripFacts: facts || {}, canonicalSavedPlan: plan, newMutation: String(mutation || '') });
}

module.exports = { canonicalMutationContext };
