'use strict';

/**
 * Stage 11 — Phase B prompt fragment: explain the FINALIZED itinerary.
 *
 * The finalized itinerary is authoritative. The prose model must not create a
 * second itinerary representation, emit [ITINERARY_JSON], add absent activities,
 * restore corrected-out stops, or change dates/difficulty/durations/sequencing.
 */

/** Compact, authoritative rendering of the finalized plan for the prose model. */
function renderFinalizedItinerary(itineraryData) {
  const lines = [];
  for (const day of itineraryData?.days || []) {
    lines.push(`${day.label || `Day ${day.dayNumber}`}:`);
    for (const stop of day.stops || []) {
      const bits = [];
      if (stop.timeWindow || stop.startTime) bits.push(stop.timeWindow || stop.startTime);
      if (stop.difficulty) bits.push(stop.difficulty);
      if (Number.isFinite(stop.duration)) bits.push(`${stop.duration}m`);
      if (Number.isFinite(stop.drivingTimeFromPreviousMin) && stop.drivingTimeFromPreviousMin > 0) {
        bits.push(`${stop.drivingTimeFromPreviousMin}m drive`);
      }
      const meta = bits.length ? ` [${bits.join(', ')}]` : '';
      const note = stop.note ? ` — ${stop.note}` : '';
      lines.push(`  - ${stop.name}${meta}${note}`);
    }
  }
  return lines.join('\n');
}

/**
 * @param {Object} params
 * @param {Object} params.finalizedItinerary  the FROZEN Phase A result
 * @param {string[]} [params.correctionsApplied]
 * @param {Object[]} [params.feasibilityIssues] structured issues
 * @returns {string} the Phase B system-prompt fragment
 */
function buildProseFromItineraryPrompt({
  finalizedItinerary,
  correctionsApplied = [],
  feasibilityIssues = [],
} = {}) {
  const corrected = Array.isArray(correctionsApplied) && correctionsApplied.length > 0;
  const warnings = (feasibilityIssues || [])
    .filter((i) => i && i.severity !== 'info')
    .map((i) => `- ${i.message}`)
    .join('\n');

  return `\n\n--- FINALIZED ITINERARY (AUTHORITATIVE) ---
The structured day-by-day plan below has already been built, validated, and corrected. It is the single source of truth. Write a natural, friendly explanation of THIS EXACT plan.

${renderFinalizedItinerary(finalizedItinerary)}
${corrected ? `\nAdjustments already applied during planning (acknowledge these naturally; do NOT claim the plan is unmodified):\n${correctionsApplied.map((c) => `- ${c}`).join('\n')}` : ''}
${warnings ? `\nThings the traveler should double-check (mention appropriately):\n${warnings}` : ''}

RULES:
- Explain the itinerary above naturally, in Trailie's voice.
- Preserve the days, stops, order, and major logistics exactly.
- Do NOT add activities or stops that are absent from the plan above.
- Do NOT restore any stop that was removed during correction.
- Do NOT change dates, difficulty, durations, or the drive sequence.
- Do NOT output JSON, tool calls, or an [ITINERARY_JSON] block — the structured plan already exists.
--- END FINALIZED ITINERARY ---\n`;
}

/**
 * Stage 12 — verified Phase B prompt. Generated from ONLY the frozen itinerary /
 * manifest (never the pre-correction draft). Requires internal alignment markers
 * so the deterministic verifier can associate prose with days/stops.
 */
function buildVerifiedProsePrompt({ manifest, correctionsApplied = [], feasibilityIssues = [] } = {}) {
  const days = manifest?.days || [];
  // Stage 13.7 — one compact marker skeleton. Each day/stop marker (with its
  // canonical name) appears exactly ONCE, in order. Long itineraries previously
  // dropped markers when the plan was restated in several forms; this is the
  // single authoritative structure the model must mirror.
  const skeleton = days
    .map((d) => {
      const stops = d.stops
        .map((s) => `  <!--TRAILIE_STOP:${s.stopId}--> ${s.canonicalName}`)
        .join('\n');
      return `<!--TRAILIE_DAY:${d.dayId}--> ${d.title || `Day ${d.dayNumber}`}\n${stops}`;
    })
    .join('\n');

  const corrected = Array.isArray(correctionsApplied) && correctionsApplied.length > 0;
  const warnings = (feasibilityIssues || [])
    .filter((i) => i && i.severity !== 'info')
    .map((i) => `- ${i.message}`)
    .join('\n');

  return `\n\n--- WRITE THE VERIFIED TRIP RESPONSE ---
Write a natural, friendly explanation of this finalized plan in Trailie's voice, emitting the internal alignment markers so it can be verified.

Marker skeleton — reproduce EVERY marker below exactly once, in this order:
${skeleton}

RULES:
- Copy each day and stop marker verbatim, exactly once, in the order shown; put each stop's prose right after its marker and each day's prose right after its day marker.
- Concise is good: a sentence or two per stop is plenty — do not pad every field into prose.
- Use the canonical stop names shown above; do NOT add, drop, reorder, or restore stops, and do NOT change dates, durations, difficulty, drives, or overnight locations.
- Write nothing before the first day marker (an optional <!--TRAILIE_INTRO--> may hold a one-line intro).
- Markers are internal metadata: never explain them, and never mention JSON or tools.
${corrected ? `- Adjustments were already applied during planning; acknowledge them naturally and do NOT claim the plan is unmodified.\n` : ''}${warnings ? `- Mention ONLY these final things-to-double-check where relevant:\n${warnings}\n` : ''}--- END VERIFIED TRIP RESPONSE ---\n`;
}

/**
 * Stage 13.7 — compact single-retry correction list. Names ONLY the exact IDs
 * and hard-conflict codes the retry must fix, so the retry prompt does not repeat
 * the full manifest or unrelated verifier detail. There is only ever one retry.
 *
 * @param {Object} c
 * @param {string[]} [c.missingDayIds]
 * @param {string[]} [c.missingStopIds]
 * @param {string[]} [c.misplacedStopIds]
 * @param {string[]} [c.duplicateIds]
 * @param {string[]} [c.hardConflictCodes]
 * @returns {string}
 */
function buildProseRetryHint({
  missingDayIds = [],
  missingStopIds = [],
  misplacedStopIds = [],
  duplicateIds = [],
  hardConflictCodes = [],
} = {}) {
  const line = (label, ids) => (ids && ids.length ? `- ${label}: ${ids.join(', ')}` : null);
  const fixes = [
    line('Missing day markers', missingDayIds),
    line('Missing stop markers', missingStopIds),
    line('Stops under the wrong day', misplacedStopIds),
    line('Duplicated markers', duplicateIds),
    line('Resolve these conflicts', hardConflictCodes),
  ].filter(Boolean);
  const body = fixes.length ? fixes.join('\n') : '- Emit every day and stop marker exactly once, in order.';
  return `\n\n--- CONSISTENCY RETRY (fix ONLY these; keep the plan and marker order unchanged) ---\n${body}\n--- END CONSISTENCY RETRY ---\n`;
}

/**
 * Stage 13.8 §2 — strip the legacy inline [ITINERARY_JSON] mandate from an
 * assembled base prompt so tool-first Phase B never inherits a conflicting
 * instruction. In tool-first mode Phase A already produced the structured plan
 * via the create_itinerary tool; Phase B must forbid JSON, not require it.
 *
 * Legacy mode never calls this (it does not run buildVerifiedProsePrompt), so
 * legacy [ITINERARY_JSON] compatibility is untouched.
 *
 * @param {string} prompt
 * @returns {{ prompt: string, changed: boolean }}
 */
function stripLegacyItineraryJsonInstruction(prompt) {
  let p = String(prompt || '');
  let changed = false;
  const cut = (re) => {
    p = p.replace(re, () => { changed = true; return '\n'; });
  };
  // 1. The MANDATORY intro + the full [ITINERARY_JSON] schema block.
  cut(/\n*STRUCTURED OUTPUT INSTRUCTION \(MANDATORY\):[\s\S]*?\[\/ITINERARY_JSON\]\s*/g);
  // 2. The trailing "Format rules …" contiguous bullet list.
  cut(/\n*Format rules \(when you DO produce a day-by-day plan[^\n]*\n(?:[ \t]*-[^\n]*\n?)*/g);
  // 3. Stray inline mention (e.g. "… 400-800 words + the [ITINERARY_JSON] block").
  p = p.replace(/\s*\+ the \[ITINERARY_JSON\] block/g, () => { changed = true; return ''; });
  // 4. Defense-in-depth: drop any remaining line that still names the token, so
  //    the tool-first Phase B contract carries ZERO inline-JSON instructions.
  p = p.replace(/^.*\[\/?ITINERARY_JSON\].*$\n?/gim, () => { changed = true; return ''; });
  return { prompt: p.replace(/\n{3,}/g, '\n\n'), changed };
}

/**
 * Stage 13.8A §2 — prohibited legacy instructions in a tool-first Phase B prompt.
 *
 * Tool-first Phase B is assembled by STRIPPING the legacy mandate out of a large
 * base prompt. A future prompt edit could reintroduce it in a shape the stripper
 * does not recognize, silently restoring "also emit the structured block" — the
 * exact contract break Stage 13.8 closed. These patterns are matched against the
 * NORMALIZED prompt (lowercased, whitespace collapsed) so a line-wrapped or
 * re-indented mandate cannot slip through.
 */
const PROHIBITED_PHASE_B_PATTERNS = [
  { code: 'itinerary_json', pattern: /itinerary_json/ },
  { code: 'structured_data_block', pattern: /append(?:ing|s)? a structured data block/ },
  { code: 'mandatory_structured_output', pattern: /mandatory structured output/ },
  { code: 'structured_output_instruction', pattern: /structured output instruction \(mandatory\)/ },
];

/** Lowercase + collapse whitespace so wrapping/indentation cannot hide a mandate. */
function normalizePromptForContract(prompt) {
  return String(prompt || '').toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Fail-closed contract check for the fully assembled tool-first Phase B prompt.
 * Returns violation CODES only — never prompt text, so the result is safe to log
 * and persist as telemetry.
 *
 * @param {string} prompt
 * @returns {{ ok: boolean, violations: string[] }}
 */
function validateToolFirstPhaseBPrompt(prompt) {
  const normalized = normalizePromptForContract(prompt);
  const violations = PROHIBITED_PHASE_B_PATTERNS
    .filter(({ pattern }) => pattern.test(normalized))
    .map(({ code }) => code);
  return { ok: violations.length === 0, violations };
}

module.exports = {
  renderFinalizedItinerary,
  PROHIBITED_PHASE_B_PATTERNS,
  validateToolFirstPhaseBPrompt,
  buildProseFromItineraryPrompt,
  buildVerifiedProsePrompt,
  buildProseRetryHint,
  stripLegacyItineraryJsonInstruction,
};
