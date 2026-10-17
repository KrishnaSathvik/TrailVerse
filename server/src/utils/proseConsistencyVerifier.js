'use strict';

/**
 * Stage 12 — deterministic prose ↔ itinerary consistency verifier.
 *
 * Pure and model-free. Verifies buffered Phase B prose (with alignment markers)
 * against the manifest built from the frozen itinerary. Conservative by design:
 * it must not fail concise-but-accurate prose or generic safety advice.
 */

const { parseAlignmentMarkers, stripAlignmentMarkers } = require('./proseAlignmentMarkers');
const { stripItineraryArtifacts } = require('./itineraryArtifacts');
const {
  normalizeName,
  deriveAliases,
  detectActivityDifficulty,
  detectActivityDuration,
} = require('./proseTextNormalize');

// Removal context words that make a mention historical rather than an instruction.
const REMOVAL_CONTEXT = /\b(removed|not included|excluded|skipped|unavailable|couldn't include|could not include|left out|instead of|dropped|omitted|had to cut|cut from)\b/i;

// Strong additive plan instructions (conservative — omits ambiguous verbs). The
// phrase matches case-insensitively; the destination must be a Capitalized
// proper noun (checked below) to avoid flagging generic advice.
const ADDITIVE_RE = /\b(?:add a stop at|also visit|also stop at|detour to|make a detour to|add a visit to|squeeze in)\s+([A-Za-z][A-Za-z0-9'’\- ]{2,40})/gi;

// Stage 13.1 — explicit overnight-location language followed by a Capitalized
// place name. Conservative: only these unambiguous overnight phrases count; a
// drive-through mention ("drive through X") or generic lodging advice ("find a
// hotel near the park") has no phrase match and is never treated as an overnight.
const OVERNIGHT_RE = /\b(?:stay overnight in|stay overnight at|spend the night in|spend the night at|spend the night near|check in for the night in|check in for the night at|stay the night in|stay the night at|camp overnight in|camp overnight at|overnight in|overnight at)\s+([A-Z][A-Za-z0-9'’\- ]{2,40})/gi;

/** Distinctive (length ≥ 4) tokens of a place name, ignoring short/state words. */
function significantTokens(value) {
  return new Set(normalizeName(value).split(' ').filter((t) => t.length >= 4));
}

/** Two place names are related if they share any distinctive token. */
function locationsRelated(a, b) {
  const at = significantTokens(a);
  for (const t of significantTokens(b)) if (at.has(t)) return true;
  return false;
}

function toSentences(text) {
  return String(text || '').split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

/**
 * @param {Object} params
 * @param {string} params.proseWithMarkers
 * @param {Object} params.manifest
 * @returns {Object} verification result
 */
function verifyProseAgainstItinerary({ proseWithMarkers, manifest } = {}) {
  const parsed = parseAlignmentMarkers(proseWithMarkers);
  const sanitizedProse = stripAlignmentMarkers(proseWithMarkers).trim();

  const result = {
    status: 'passed',
    issueCodes: [],
    missingDayIds: [], duplicateDayIds: [], unknownDayIds: [],
    missingStopIds: [], duplicateStopIds: [], unknownStopIds: [],
    orderViolations: [], wrongDayAssignments: [], removedStopMentions: [],
    conflictingDates: [], conflictingDurations: [], conflictingDifficulty: [], conflictingTransitions: [],
    conflictingOvernight: [],
    unsupportedPlanActions: [],
    // Stage 13.8 §4 — a legacy [ITINERARY_JSON] artifact in tool-first Phase B is
    // model-contract noncompliance and BLOCKS (never displayed).
    forbiddenItineraryArtifacts: [],
    // Stage 13.7 — non-blocking diagnostics. Present in issueCodes for telemetry
    // but NEVER cause status:'failed' (see the `failers` aggregate below).
    ambiguousDifficultyContext: [], ambiguousDurationContext: [],
    sanitizedProse,
  };
  const fail = (code) => { if (!result.issueCodes.includes(code)) result.issueCodes.push(code); };
  const diagnostic = (code) => { if (!result.issueCodes.includes(code)) result.issueCodes.push(code); };

  if (parsed.malformed) {
    parsed.malformedReasons.forEach(fail);
    result.status = 'failed';
    // Continue collecting other findings, but a malformed structure is terminal.
  }

  const manifestDays = manifest?.days || [];
  const manifestDayIds = manifestDays.map((d) => d.dayId);
  // Day-scoped identity (Phase 9C.1D.1): `stop.id` is only unique WITHIN a
  // day (fastItineraryPlannerService mints `stop-${order}`, reset per day),
  // so a flat Map keyed by bare stopId let day 2's `stop-1` silently
  // overwrite day 1's `stop-1`. Key by the same `dayId::stopId` composite
  // convention geoResolutionArtifact already uses safely.
  const compositeStopKey = (dayId, stopId) => `${dayId}::${stopId}`;
  const manifestStopByKey = new Map(); // `${dayId}::${stopId}` → stop
  const stopIdToDayIds = new Map(); // bare stopId → Set(dayId) it exists under
  for (const d of manifestDays) {
    for (const s of d.stops) {
      manifestStopByKey.set(compositeStopKey(d.dayId, s.stopId), s);
      if (!stopIdToDayIds.has(s.stopId)) stopIdToDayIds.set(s.stopId, new Set());
      stopIdToDayIds.get(s.stopId).add(d.dayId);
    }
  }

  // --- Structural coverage: days ---
  const markerDayIds = parsed.days.map((d) => d.dayId).filter(Boolean);
  const daySeen = new Map();
  for (const id of markerDayIds) daySeen.set(id, (daySeen.get(id) || 0) + 1);
  result.duplicateDayIds = [...daySeen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  result.unknownDayIds = markerDayIds.filter((id) => !manifestDayIds.includes(id));
  result.missingDayIds = manifestDayIds.filter((id) => !markerDayIds.includes(id));

  // Day order must follow the manifest order.
  const markerDayOrder = markerDayIds.filter((id) => manifestDayIds.includes(id));
  const expectedDayOrder = manifestDayIds.filter((id) => markerDayOrder.includes(id));
  if (markerDayOrder.join('>') !== expectedDayOrder.join('>')) result.orderViolations.push('day_order');

  // --- Structural coverage: stops + assignment + order ---
  // Both `stopSeen` (duplicate detection) and the eventual missing-stop check
  // are keyed by the day-scoped composite key — the same id string legitimately
  // repeating once per day (per the plan's own day-scoped id convention) must
  // never itself read as a duplicate or a false "unknown" reference.
  const stopSeen = new Map(); // `${dayId}::${stopId}` → count
  for (const day of parsed.days) {
    const stopIds = day.stops.map((s) => s.stopId).filter(Boolean);
    for (const id of stopIds) {
      const key = compositeStopKey(day.dayId, id);
      stopSeen.set(key, (stopSeen.get(key) || 0) + 1);
    }

    for (const id of stopIds) {
      const key = compositeStopKey(day.dayId, id);
      if (manifestStopByKey.has(key)) continue; // correct (day, stopId) reference
      const daysWithId = stopIdToDayIds.get(id);
      if (!daysWithId || daysWithId.size === 0) {
        result.unknownStopIds.push(id);
      } else {
        // The id is real, just attributed to the wrong day marker.
        const expectedDay = [...daysWithId][0];
        result.wrongDayAssignments.push({ stopId: id, underDay: day.dayId, expectedDay });
      }
    }

    // Stop order within a day must follow the manifest order for that day.
    const manifestDay = manifestDays.find((d) => d.dayId === day.dayId);
    if (manifestDay) {
      const manifestOrder = manifestDay.stops.map((s) => s.stopId);
      const present = stopIds.filter((id) => manifestOrder.includes(id));
      const expected = manifestOrder.filter((id) => present.includes(id));
      if (present.join('>') !== expected.join('>')) result.orderViolations.push(`stop_order:${day.dayId}`);
    }
  }
  result.duplicateStopIds = [...stopSeen.entries()]
    .filter(([, n]) => n > 1)
    .map(([key]) => key.slice(key.indexOf('::') + 2));
  const allMarkerKeys = new Set([...stopSeen.keys()]);
  result.missingStopIds = [...manifestStopByKey.entries()]
    .filter(([key]) => !allMarkerKeys.has(key))
    .map(([, stop]) => stop.stopId);

  // --- Per-stop difficulty / duration conflicts (scoped to the stop's segment) ---
  for (const day of parsed.days) {
    for (const stopSeg of day.stops) {
      const stop = manifestStopByKey.get(compositeStopKey(day.dayId, stopSeg.stopId));
      if (!stop) continue;
      const seg = String(stopSeg.text || '');

      // Difficulty — a hard conflict requires the difficulty term to modify or
      // predicate an activity noun (Stage 13.7). Unbound hard-end usage such as
      // "permits can be difficult to obtain" is ambiguous, not a contradiction.
      if (stop.difficulty) {
        const d = detectActivityDifficulty(seg);
        if (d.difficulty && d.difficulty !== stop.difficulty) {
          result.conflictingDifficulty.push({ stopId: stop.stopId, claimed: d.difficulty, expected: stop.difficulty });
        } else if (!d.difficulty && d.ambiguous) {
          result.ambiguousDifficultyContext.push(stop.stopId);
        }
      }

      // Duration — a hard conflict requires an activity-duration construction
      // ("spend 2 hours at…", "the hike takes 3 hours"). Frequencies, offsets,
      // drives, and waits are not the activity duration (Stage 13.7).
      if (Number.isFinite(stop.durationMinutes) && stop.durationMinutes > 0) {
        const dur = detectActivityDuration(seg);
        if (dur.minutes != null) {
          const tol = Math.max(20, stop.durationMinutes * 0.3); // generous
          if (Math.abs(dur.minutes - stop.durationMinutes) > tol) {
            result.conflictingDurations.push({ stopId: stop.stopId, claimed: dur.minutes, expected: stop.durationMinutes });
          }
        } else if (dur.ambiguous) {
          result.ambiguousDurationContext.push(stop.stopId);
        }
      }
    }
  }

  // --- Removed-stop mentions (allow clearly-historical explanations) ---
  const removedAliases = manifest?.removedStopAliases || [];
  if (removedAliases.length) {
    for (const sentence of toSentences(sanitizedProse)) {
      const norm = ' ' + normalizeName(sentence) + ' ';
      const hit = removedAliases.find((alias) => norm.includes(' ' + alias + ' '));
      if (hit && !REMOVAL_CONTEXT.test(sentence)) {
        result.removedStopMentions.push(hit);
      }
    }
  }

  // --- Strong additive plan instructions referencing non-itinerary places ---
  const allowed = new Set();
  for (const s of manifestStopByKey.values()) for (const a of s.acceptedAliases || []) allowed.add(a);
  for (const name of manifest?.trip?.destinationNames || []) allowed.add(normalizeName(name));
  for (const match of sanitizedProse.matchAll(ADDITIVE_RE)) {
    const captured = match[1].trim();
    // Require a Capitalized proper-noun destination to stay conservative.
    if (!/^[A-Z]/.test(captured)) continue;
    const target = normalizeName(captured);
    if (!target) continue;
    // Known only on EXACT alias membership (target or its derived aliases). A
    // loose substring match would let a generic word like "canyon" absorb an
    // unrelated proper noun ("Bryce Canyon").
    const candidateAliases = new Set([target, ...deriveAliases(captured)]);
    const known = [...candidateAliases].some((a) => allowed.has(a));
    if (!known) result.unsupportedPlanActions.push(captured);
  }

  // --- Conflicting overnight location (conservative) ---
  // Only evaluated when the frozen itinerary actually defines overnight ground
  // truth. A stated overnight place that is not related (no shared distinctive
  // token) to ANY defined overnight location is a conflict.
  const overnightLocations = manifestDays.map((d) => d.overnightLocation).filter(Boolean);
  if (overnightLocations.length) {
    for (const match of sanitizedProse.matchAll(OVERNIGHT_RE)) {
      const captured = (match[1] || '').trim();
      if (!/^[A-Z]/.test(captured) || !normalizeName(captured)) continue;
      const relatedToAny = overnightLocations.some((loc) => locationsRelated(captured, loc));
      // Also accept an overnight named after an itinerary stop/destination (e.g.
      // "spend the night at Zion Lodge" when Zion is a destination).
      const relatedToPlace = [...manifestStopByKey.values()].some((s) => locationsRelated(captured, s.canonicalName))
        || (manifest?.trip?.destinationNames || []).some((n) => locationsRelated(captured, n));
      if (!relatedToAny && !relatedToPlace) result.conflictingOvernight.push(captured);
    }
  }

  // --- Forbidden legacy itinerary artifact (Stage 13.8 §4) ---
  // Tool-first Phase B produced the plan via the create_itinerary tool, so any
  // [ITINERARY_JSON] block / orphan marker / bare label / fenced variant in the
  // prose is a contract violation that must block (retry → fallback), never show.
  const artifactScan = stripItineraryArtifacts(sanitizedProse);
  if (artifactScan.changed) result.forbiddenItineraryArtifacts = artifactScan.artifactTypes;

  // --- Aggregate status ---
  const failers = [
    result.missingDayIds, result.duplicateDayIds, result.unknownDayIds,
    result.missingStopIds, result.duplicateStopIds, result.unknownStopIds,
    result.orderViolations, result.wrongDayAssignments, result.removedStopMentions,
    result.conflictingDates, result.conflictingDurations, result.conflictingDifficulty,
    result.conflictingTransitions, result.conflictingOvernight, result.unsupportedPlanActions,
    result.forbiddenItineraryArtifacts,
  ];
  const codeFor = {
    missingDayIds: 'missing_day', duplicateDayIds: 'duplicate_day', unknownDayIds: 'unknown_day',
    missingStopIds: 'missing_stop', duplicateStopIds: 'duplicate_stop', unknownStopIds: 'unknown_stop',
    orderViolations: 'order_violation', wrongDayAssignments: 'wrong_day_assignment',
    removedStopMentions: 'removed_stop_mention', conflictingDurations: 'conflicting_duration',
    conflictingDifficulty: 'conflicting_difficulty', conflictingOvernight: 'conflicting_overnight',
    unsupportedPlanActions: 'unsupported_plan_action',
    forbiddenItineraryArtifacts: 'forbidden_itinerary_artifact',
  };
  for (const key of Object.keys(codeFor)) {
    if (Array.isArray(result[key]) && result[key].length) fail(codeFor[key]);
  }
  // Non-blocking diagnostics: recorded in issueCodes for telemetry but excluded
  // from `failers`, so they never flip status to 'failed' or trigger a retry.
  if (result.ambiguousDifficultyContext.length) diagnostic('ambiguous_difficulty_context');
  if (result.ambiguousDurationContext.length) diagnostic('ambiguous_duration_context');
  if (failers.some((a) => a.length) || parsed.malformed) result.status = 'failed';

  return result;
}

module.exports = { verifyProseAgainstItinerary };
