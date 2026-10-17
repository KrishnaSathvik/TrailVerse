'use strict';

// An explicit planning outcome, never an escape for missing/malformed itinerary
// output or a claim that a saved plan was changed.
const REASONS = ['insufficient_time', 'incompatible_constraints', 'unworkable_logistics'];
const TRIP_PUSHBACK_TOOL = {
  name: 'recommend_trip_revision',
  description: 'Successfully answer an unrealistic trip request with candid pushback and an optional realistic recommendation. Does not create or change an itinerary.',
  input_schema: {
    type: 'object', additionalProperties: false,
    required: ['reason', 'explanation', 'recommendation'],
    properties: {
      reason: { type: 'string', enum: REASONS },
      explanation: { type: 'string', description: 'Explain the concrete conflict in ordinary traveler language. Acknowledge the full requested scope; do not silently drop destinations.' },
      recommendation: { type: 'string', description: 'An optional alternative clearly presented as a recommendation, not an accepted change. Empty string if none.' },
    },
  },
};
const PUSHBACK_INSTRUCTION = 'Planning outcome: use create_itinerary for a viable trip. If the requested trip is unrealistic because of time, incompatible constraints, or logistics, use recommend_trip_revision instead. This is a successful conversational answer and no itinerary is required. Explain the concrete conflict and acknowledge ALL requested destinations, including those outside the US. Offer a realistic alternative explicitly as a recommendation; never silently delete destinations. Do not use this outcome merely because one stop has unknown exposure: evaluate it from supplied evidence or replace only that stop with a confirmed compatible option. Use exactly one outcome tool.';

function parseTripPushback(result, userPrompt) {
  const fail = reason => ({ ok: false, reason });
  if (result?.refusal || !['complete', 'completed'].includes(result?.completionStatus)) return fail('Complete the planning decision before answering.');
  const calls = result?.toolCalls || [];
  if (calls.length !== 1 || calls[0].name !== TRIP_PUSHBACK_TOOL.name) return fail('Choose exactly one planning outcome; do not combine pushback and an itinerary.');
  let data;
  try { const raw = calls[0].input ?? calls[0].arguments; data = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) { return fail('Return a valid planning decision.'); }
  if (!data || Object.keys(data).some(k => !['reason', 'explanation', 'recommendation'].includes(k))
    || !REASONS.includes(data.reason) || typeof data.explanation !== 'string' || data.explanation.trim().length < 30
    || typeof data.recommendation !== 'string' || data.explanation.length + data.recommendation.length > 6000) return fail('Give a concrete explanation of the conflict and an optional recommendation.');
  // Pushback starts with the model's judgment — never a canned request echo.
  void userPrompt;
  return { ok: true, reasonCode: data.reason,
    text: [data.explanation.trim(), data.recommendation.trim()].filter(Boolean).join('\n\n') };
}

function recommendationContract(contract, reason) {
  return Object.freeze({ ...contract, originalRequestedArtifact: contract?.requestedArtifact,
    requestedArtifact: 'plain_answer', structurePolicy: 'optional', maxArtifact: 'plain_answer',
    allowsCanonicalPlanArtifact: false, requiresCanonicalPlanArtifact: false,
    patchRequested: false, patchExecutable: false,
    reasonCodes: [...(contract?.reasonCodes || []), 'validated_trip_pushback', reason],
  });
}
module.exports = { TRIP_PUSHBACK_TOOL, PUSHBACK_INSTRUCTION, parseTripPushback, recommendationContract };
