'use strict';

/**
 * Stage 13 §9 — hard correctness invariants. ANY occurrence is a rollout blocker.
 *
 * Each function returns violations for ONE run. The subset checkable in the
 * deterministic harness is enforced here; invariants that live at the transport,
 * persistence, or async-review layer (stale-write races, `done` waiting on async
 * review, cross-document version coupling) are asserted by their own route/
 * persistence tests and are listed as `coveredElsewhere` in the Stage 13 docs.
 */

const { MARKER_RE } = require('../../utils/proseAlignmentMarkers');

// Raw structured-tool argument leakage signatures that must never reach the user.
const RAW_TOOL_SIGNATURES = [
  /"create_itinerary"/i,
  /"tool_use"/i,
  /"input_schema"/i,
  /\bfunction\.arguments\b/i,
];

function userVisibleContent(record, selectedProse, sanitizedProse) {
  // What the user actually sees: the canonical (stripped) content. For streaming,
  // the replayed text is the same selected/sanitized prose.
  return sanitizedProse != null ? sanitizedProse : selectedProse;
}

/**
 * @returns {Array<{code:string, detail:string}>}
 */
function checkHardInvariants({ scenario, record, selectedProse, sanitizedProse, envelope, turn, anonymous, streaming, consistencyMode }) {
  const violations = [];
  const add = (code, detail) => violations.push({ code, detail });

  const visible = userVisibleContent(record, selectedProse, sanitizedProse) || '';
  const tf = turn.toolFirst || null;
  const finalItinerary = tf?.outcome === 'itinerary_ready' ? tf.itineraryData : null;

  // 1. Raw tool arguments / tool JSON shown to the user.
  for (const re of RAW_TOOL_SIGNATURES) {
    if (re.test(visible)) { add('raw_tool_arguments_visible', `matched ${re}`); break; }
  }

  // 2. [ITINERARY_JSON] shown in tool-first mode.
  if (record.generationMode === 'tool_first' && /\[ITINERARY_JSON\]/i.test(visible)) {
    add('itinerary_json_marker_visible', 'legacy [ITINERARY_JSON] present in tool-first output');
  }

  // 3. Alignment markers shown to the user.
  MARKER_RE.lastIndex = 0;
  if (MARKER_RE.test(visible)) add('alignment_markers_visible', 'TRAILIE_* marker survived into user-visible content');
  MARKER_RE.lastIndex = 0;
  // The canonical content must also be marker-free (it feeds shares/exports).
  if (MARKER_RE.test(envelope.content || '')) add('alignment_markers_in_canonical', 'marker present in canonical content');
  MARKER_RE.lastIndex = 0;

  // 4. Rejected prose persisted as canonical content (enforce mode). A failed
  //    first draft must resolve to retry_passed or deterministic fallback, never
  //    be selected. `failed_observed` is legal ONLY in verify (observation) mode.
  if (consistencyMode === 'enforce' && record.prose.consistencyStatus === 'failed_observed') {
    add('rejected_prose_persisted', 'failed_observed status under enforce mode');
  }

  // 5. Invalid draft streamed then replaced. In the buffered consistency path the
  //    selected prose is replayed at most once, never streamed-then-corrected.
  if (streaming && record.prose.consistencyStatus !== 'not_applicable' && Number(record.replayedProse) > 1) {
    add('invalid_draft_streamed', `replayed ${record.replayedProse} times`);
  }

  // 6. Invented fallback coordinates / 0,0 pins.
  if (finalItinerary) {
    for (const day of finalItinerary.days || []) {
      for (const stop of day.stops || []) {
        const { latitude: lat, longitude: lng, coordinateSource } = stop;
        if (lat === 0 && lng === 0) add('zero_zero_coordinate', `stop ${stop.id} at 0,0`);
        if ((lat != null || lng != null) && coordinateSource === 'unknown') {
          add('invented_coordinate', `stop ${stop.id} has coords with unknown source`);
        }
      }
    }
  }

  // 7. Itinerary mutation after freezing — the finalized plan is deep-frozen and
  //    its hash is stable regardless of prose attempts/retries.
  if (finalItinerary && !Object.isFrozen(finalItinerary)) {
    add('itinerary_not_frozen', 'finalized itinerary is not frozen');
  }

  // 8. User messages exposed in default public share content.
  const userPrompt = String(scenario.userPrompt || '').trim();
  if (userPrompt.length > 12 && (envelope.content || '').includes(userPrompt)) {
    add('user_message_in_canonical', 'raw user prompt present in canonical content');
  }

  // 9. Anonymous double-count proxy: one turn ⇒ exactly one canonical response
  //    version, regardless of internal Phase A/B attempt counts.
  if (anonymous && envelope.responseVersion !== 1) {
    add('anonymous_multi_version', `responseVersion=${envelope.responseVersion}`);
  }

  return violations;
}

module.exports = { checkHardInvariants, RAW_TOOL_SIGNATURES };
