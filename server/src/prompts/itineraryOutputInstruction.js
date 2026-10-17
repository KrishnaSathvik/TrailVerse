'use strict';

/**
 * Stage 10 (F-QUAL-2) — the ONE authoritative itinerary-output instruction.
 *
 * The mandate "you MUST emit structured itinerary output for a planning request"
 * previously appeared several times in a single assembled prompt (a base-prompt
 * bullet, the format-block rule, and a conditional reminder). This module is the
 * single source of that mandate. The base prompts keep only the [ITINERARY_JSON]
 * FORMAT/schema (needed for extraction compatibility) — not the mandate — and
 * this fragment is injected once, only when an itinerary is actually requested.
 *
 * It also forbids inventing coordinates (F-ACC-2).
 */

/**
 * A normalized sentinel used by tests to count how many times the mandate
 * appears in an assembled prompt. Keep it stable.
 */
const ITINERARY_OUTPUT_SENTINEL = 'STRUCTURED_ITINERARY_OUTPUT_REQUIRED';

const CANONICAL_ITINERARY_OUTPUT_INSTRUCTION = `--- ITINERARY OUTPUT (REQUIRED) ---
This is a day-by-day planning request (${ITINERARY_OUTPUT_SENTINEL}). You MUST provide structured itinerary data: call the create_itinerary tool when it is available, otherwise include exactly one [ITINERARY_JSON] block at the end of your response as the fallback. Include your recommended safe plan even if there are conflicts or warnings — do NOT skip structured output for planning requests.
Never guess or estimate coordinates. Omit latitude/longitude you do not have from a trusted source; the system fills trusted coordinates deterministically.
--- END ITINERARY OUTPUT ---`;

/**
 * The single itinerary-output mandate to inject when (and only when) a planning
 * itinerary is requested. Provider-specific formatting is intentionally minimal —
 * the create_itinerary tool wiring is handled separately for architect+Claude.
 *
 * @param {{provider?: string, responseMode?: string}} [opts]
 * @returns {string}
 */
function buildItineraryOutputInstruction(_opts = {}) {
  return `\n\n${CANONICAL_ITINERARY_OUTPUT_INSTRUCTION}\n`;
}

/** Count occurrences of the mandate in an assembled prompt (test helper). */
function countItineraryOutputMandates(assembledPrompt = '') {
  if (typeof assembledPrompt !== 'string') return 0;
  return assembledPrompt.split(ITINERARY_OUTPUT_SENTINEL).length - 1;
}

module.exports = {
  ITINERARY_OUTPUT_SENTINEL,
  CANONICAL_ITINERARY_OUTPUT_INSTRUCTION,
  buildItineraryOutputInstruction,
  countItineraryOutputMandates,
};
