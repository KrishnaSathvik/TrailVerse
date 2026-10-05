/**
 * User-facing copy for the REAL lifecycle stages the server emits as
 * `{ type: 'thinking', stage }` (legacy) / `{ type: 'progress', stage }` (v2).
 *
 * ── THE RULE THIS FILE EXISTS TO ENFORCE ────────────────────────────────────
 *
 * Progress copy corresponds to a state transition that actually happened.
 * It never advances because time passed.
 *
 * Until 2026-08-27 the client also ran a 1 Hz `setInterval` in TripPlannerChat
 * that rewrote the thinking message from elapsed wall-clock seconds and
 * overwrote real server stages within a second of their arrival. It announced
 * "Checking the plan for timing and tradeoffs…" at 20 s on turns where
 * validation had not started, and it is deleted. A stage shown here is a stage
 * the server reached.
 *
 * This is presentation copy ONLY. It must never surface internal consistency
 * issue codes, queue/job IDs, verifier verdicts, model or provider identity,
 * attempt counts, retries, or a "reviewed" label (async shadow review being
 * merely queued is not "reviewed").
 *
 * Keys are the strings that arrive on the wire. Stages added in the honest-
 * progress pass are emitted under their PRODUCT name and so appear here under
 * that name; the four older stages keep their internal names, which legacy
 * carries verbatim and the normalizer maps v2 back onto.
 */

export const STAGE_THINKING_COPY = Object.freeze({
  // Product-named lifecycle stages.
  understanding_request: 'Thinking through your question…',
  checking_park_information: 'Checking park details…',
  checking_current_conditions: 'Checking current conditions…',
  checking_permits: 'Checking permits and reservations…',
  finding_places: 'Finding places worth exploring…',
  checking_weather: 'Checking the weather…',
  checking_sources: 'Looking up travel information…',
  locating_places: 'Locating places on the map…',
  checking_routes: 'Checking routes and travel times…',
  saving_response: 'Saving your conversation…',
  checking_transport: 'Checking access and getting around…',

  // Internal-named stages that predate this pass.
  building_structured_itinerary: 'Building a realistic plan...',
  validating_trip: 'Checking the plan for timing and tradeoffs...',
  writing_response: 'Putting your answer together…',
  // The Stage 12/13 buffered-verification state.
  checking_response_matches_plan: 'Checking that the response matches your plan…',
});

const ORDINAL_DAY = Object.freeze({
  1: 'first', 2: 'second', 3: 'third', 4: 'fourth',
  5: 'fifth', 6: 'sixth', 7: 'seventh',
});

/**
 * Copy for a refinement whose target the SERVER resolved deterministically from
 * the persisted plan, before any model call.
 *
 * Says what is being worked on, never what will change: "Adjusting the second
 * morning…" is true the moment the scope resolves and stays true whatever patch
 * the model proposes. "Moving your morning hike…" would be a prediction, and a
 * rejected patch would make it a lie.
 *
 * Internal scope terminology (`daypart`, `whole_plan`, stop ids) is never shown.
 *
 * @returns {string|null} null when the target cannot be described specifically,
 *   so the caller falls back to the generic stage copy.
 */
export function resolveRefinementTargetCopy(target) {
  if (!target || typeof target !== 'object') return null;
  const stopName = typeof target.stopName === 'string' ? target.stopName.trim() : '';
  if (stopName) return `Adjusting ${stopName}…`;

  const ordinal = ORDINAL_DAY[target.dayNumber] || null;
  if (target.level === 'daypart' && ordinal && target.daypart) {
    return `Adjusting the ${ordinal} ${target.daypart}…`;
  }
  if (target.level === 'day' && Number.isInteger(target.dayNumber)) {
    return `Reworking day ${target.dayNumber}…`;
  }
  if (target.level === 'whole_plan') return 'Adjusting the itinerary…';
  return null;
}

/**
 * @param {string} stage  the wire stage string
 * @param {object} [refinementTarget]  bounded, server-resolved refinement target
 * @returns {string|null} display copy, or null for an unknown/absent stage so the
 *   caller can leave the current copy in place.
 */
export function resolveThinkingStageCopy(stage, refinementTarget = null) {
  if (!stage || typeof stage !== 'string') return null;
  const base = STAGE_THINKING_COPY[stage] || null;
  if (!base) return null;
  // A resolved target only sharpens the stage that spans the long wait; it must
  // not relabel "checking permits" as "adjusting day 2".
  if (stage === 'building_structured_itinerary') {
    return resolveRefinementTargetCopy(refinementTarget) || base;
  }
  return base;
}
