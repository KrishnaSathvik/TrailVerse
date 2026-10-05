'use strict';

/**
 * ONE translation boundary: TurnUnderstanding constraints -> canonical planning
 * state patch.
 *
 * Before this existed, every consumer re-parsed the raw conversation with its
 * own regexes. The traveler said "keep the walking pretty light" and the
 * generation prompt saw it (because the raw turn was in context) while
 * `planningState.mobility.walkingTolerance` stayed null — so candidate
 * eligibility, itinerary validation and the NEXT turn never knew. The
 * constraint was one context truncation away from vanishing.
 *
 * Everything here is grounded: a value exists only because language in the
 * current turn produced it. Non-numeric mobility language never becomes an
 * invented mileage, and a stated concern ("my knee has been bothering me") is
 * never promoted into a walking capability on its own.
 *
 * Deterministic, offline, provider-free.
 */

const {
  extractExplicitConstraints,
  extractSoftPreferences,
} = require('./constraintSemantics');

/** Where a constraint value came from, strongest first. */
const CONSTRAINT_SOURCES = Object.freeze(['current_message', 'active_state', 'profile_form']);

const SOURCE_RANK = Object.freeze({ current_message: 3, active_state: 2, profile_form: 1 });

/**
 * Field -> where it lives in the canonical runtime-constraints shape that
 * `buildPlanningStateFromRuntime` consumes. Adding a field here is the ONLY
 * place a new grounded constraint has to be wired.
 */
const FIELD_ROUTING = Object.freeze({
  avoidExposure: { path: ['avoidExposure'], also: [['activityPreferences', 'avoidExposure']] },
  pace: { path: ['pace'] },
  hiking: { path: ['activityPreferences', 'hiking'] },
  walkingTolerance: { path: ['mobility', 'walkingTolerance'] },
  maxWalkMilesPerSegment: { path: ['mobility', 'maxWalkMilesPerSegment'] },
  maxWalkMinutesPerSegment: { path: ['mobility', 'maxWalkMinutesPerSegment'] },
  maxDailyDriveMinutes: { path: ['maxDailyDriveMinutes'] },
});

const SOFT_FIELD_ROUTING = Object.freeze({
  minimizeDriving: { path: ['preferences', 'minimizeDriving'] },
  minimizeLodgingChanges: { path: ['preferences', 'minimizeLodgingChanges'] },
  photography: { path: ['activityPreferences', 'photography'] },
  photographyTiming: { path: ['activityPreferences', 'photographyTiming'] },
  wildlife: { path: ['activityPreferences', 'wildlife'] },
});

function setPath(target, path, value) {
  let node = target;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    if (!node[key] || typeof node[key] !== 'object') node[key] = {};
    node = node[key];
  }
  node[path[path.length - 1]] = value;
}

/**
 * Translate the canonical understanding of THIS turn into a runtime-constraints
 * patch plus provenance.
 *
 * @param {object} params.understanding TurnUnderstanding (preferred input)
 * @param {string} params.messageText   fallback when no understanding is available
 * @returns {{ patch: object, provenance: Array, fields: string[] }}
 */
function translateTurnConstraints({ understanding = null, messageText = '' } = {}) {
  const grounded = Array.isArray(understanding?.explicitConstraints)
    ? understanding.explicitConstraints
    : extractExplicitConstraints(messageText);
  const soft = Array.isArray(understanding?.softPreferences)
    ? understanding.softPreferences
    : extractSoftPreferences(messageText);

  const patch = {};
  const provenance = [];
  const fields = [];

  for (const item of grounded) {
    const routing = FIELD_ROUTING[item?.field];
    if (!routing || item.value === undefined) continue;
    setPath(patch, routing.path, item.value);
    for (const alsoPath of routing.also || []) {
      // Mirrored only when truthy: the legacy activityPreferences layer treats
      // `false` and `null` alike, and writing `false` there would look like a
      // never-stated field rather than an explicit reversal.
      if (item.value) setPath(patch, alsoPath, item.value);
    }
    fields.push(item.field);
    provenance.push({
      field: item.field,
      value: item.value,
      source: item.source || 'current_message',
      supportingSpan: item.span || null,
      confidence: Number.isFinite(item.confidence) ? item.confidence : 0.95,
      explicitness: 'explicit',
    });
  }

  for (const item of soft) {
    const routing = SOFT_FIELD_ROUTING[item?.field];
    if (!routing || item.value === undefined) continue;
    setPath(patch, routing.path, item.value);
    fields.push(item.field);
    provenance.push({
      field: item.field,
      value: item.value,
      source: item.source || 'current_message',
      supportingSpan: item.span || null,
      confidence: 0.7,
      explicitness: 'soft',
    });
  }

  return { patch, provenance, fields: [...new Set(fields)] };
}

/**
 * Apply the current turn's grounded constraints onto a runtime-constraints
 * object, with explicit authority rules:
 *
 *   - a value grounded in the CURRENT message always wins over persisted state,
 *     including an explicit reversal (avoidExposure: false clears a prior true);
 *   - a field the current turn says nothing about is left untouched, so
 *     persisted canonical constraints survive;
 *   - nothing is invented for a field no source produced.
 */
function applyTurnConstraintsToRuntime(constraints, { understanding = null, messageText = '' } = {}) {
  const target = constraints && typeof constraints === 'object' ? constraints : {};
  const { patch, provenance, fields } = translateTurnConstraints({ understanding, messageText });

  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      target[key] = { ...(target[key] && typeof target[key] === 'object' ? target[key] : {}), ...value };
    } else {
      target[key] = value;
    }
  }

  if (provenance.length) {
    target.constraintProvenance = mergeProvenance(target.constraintProvenance, provenance);
  }
  return { constraints: target, provenance, fields };
}

/**
 * Current-message provenance replaces older provenance for the same field.
 * Explicit current-turn correction wins over older state — that is the whole
 * point of tracking the source.
 */
function mergeProvenance(previous, incoming) {
  const byField = new Map();
  for (const entry of Array.isArray(previous) ? previous : []) {
    if (entry?.field) byField.set(entry.field, entry);
  }
  for (const entry of incoming || []) {
    if (!entry?.field) continue;
    const existing = byField.get(entry.field);
    const incomingRank = SOURCE_RANK[entry.source] ?? 0;
    const existingRank = existing ? (SOURCE_RANK[existing.source] ?? 0) : -1;
    if (incomingRank >= existingRank) byField.set(entry.field, entry);
  }
  return [...byField.values()].slice(0, 24);
}

module.exports = {
  CONSTRAINT_SOURCES,
  FIELD_ROUTING,
  SOFT_FIELD_ROUTING,
  applyTurnConstraintsToRuntime,
  mergeProvenance,
  translateTurnConstraints,
};
