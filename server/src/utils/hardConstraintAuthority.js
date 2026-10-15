'use strict';

/**
 * Which hard traveler restrictions validation enforces THIS turn.
 *
 * Memory admission decides what is saved as traveler memory. It must not
 * decide whether a safety restriction exists: a rejected or omitted memory
 * update previously disarmed `avoidExposure`, so the same request was rejected
 * in one run and accepted unchecked in another (diagnosis 2026-10-12, R02/R09).
 *
 * Restriction-only and fail-safe. Every source can only ADD or TIGHTEN a
 * restriction; only an admitted, explicit traveler memory update can loosen
 * one. No traveler text is interpreted here — every value is a structured
 * statement the model made (read_travel constraints, memory_updates quoting the
 * traveler) or a previously validated/admitted state.
 *
 * Scope: the restrictions hard eligibility consumes (exposure, mobility/access).
 */

const BOOLEAN_MOBILITY = ['wheelchair', 'stroller', 'avoidStairs'];
const LIMIT_MOBILITY = ['maxWalkMilesPerSegment', 'maxWalkMinutesPerSegment'];
// A key the verifier judged against the traveler's own words in one of these
// ways is not a statement of the traveler's restriction, so it does not arm.
const NOT_A_RESTRICTION = new Set(['contradicted', 'hypothetical', 'conditional']);

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const positive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;

function empty() { return { avoidExposure: false, mobility: {} }; }

function tighten(target, restriction) {
  if (!isObject(restriction)) return target;
  if (restriction.avoidExposure === true) target.avoidExposure = true;
  const mobility = isObject(restriction.mobility) ? restriction.mobility : {};
  for (const key of BOOLEAN_MOBILITY) if (mobility[key] === true) target.mobility[key] = true;
  for (const key of LIMIT_MOBILITY) {
    if (!positive(mobility[key])) continue;
    target.mobility[key] = positive(target.mobility[key]) ? Math.min(target.mobility[key], mobility[key]) : mobility[key];
  }
  return target;
}

/** Normalize restriction-shaped data from planning state / read_travel constraints. */
function restrictionsFrom(source) {
  if (!isObject(source)) return empty();
  const out = empty();
  tighten(out, {
    avoidExposure: source.avoidExposure === true || source.preferences?.avoidExposure === true,
    mobility: { ...(isObject(source.mobility) ? source.mobility : {}),
      ...Object.fromEntries([...BOOLEAN_MOBILITY, ...LIMIT_MOBILITY].filter((k) => Object.hasOwn(source, k)).map((k) => [k, source[k]])) },
  });
  return out;
}

function restrictionFromUpdate(update, keep = () => true) {
  if (!isObject(update) || !isObject(update.value)) return null;
  if (update.field === 'preferences' && update.value.avoidExposure === true && keep('avoidExposure')) {
    return { avoidExposure: true, mobility: {} };
  }
  if (update.field === 'mobility') {
    const mobility = Object.fromEntries(Object.entries(update.value)
      .filter(([key, value]) => ((BOOLEAN_MOBILITY.includes(key) && value === true)
        || (LIMIT_MOBILITY.includes(key) && positive(value))) && keep(key)));
    return Object.keys(mobility).length ? { avoidExposure: false, mobility } : null;
  }
  return null;
}

/**
 * @param {object} args
 * @param {object|null} args.priorValidation  planningState.validationConstraints of the saved trip
 * @param {object|null} args.admittedState     planning state after admitted memory (incl. prior memory)
 * @param {object[]} args.turnConstraints      this turn's read_travel `constraints` objects
 * @param {object[]} args.proposedUpdates      every memory update the model proposed this turn
 * @param {string} args.message                traveler words the updates must quote
 * @param {(update:object, key:string)=>string} args.relationship per-key verifier verdict
 * @param {(update:object)=>boolean} args.admitted whole-update admission (explicit)
 */
function resolveHardConstraints({ priorValidation = null, admittedState = null, turnConstraints = [],
  proposedUpdates = [], message = '', relationship = () => 'unverified', admitted = () => false } = {}) {
  const armed = empty();
  tighten(armed, restrictionsFrom(priorValidation));
  tighten(armed, restrictionsFrom(admittedState));
  for (const constraints of Array.isArray(turnConstraints) ? turnConstraints : []) tighten(armed, restrictionsFrom(constraints));
  const updates = (Array.isArray(proposedUpdates) ? proposedUpdates : [])
    .filter((u) => isObject(u) && typeof u.sourceQuote === 'string' && u.sourceQuote && String(message).includes(u.sourceQuote));
  for (const update of updates) {
    tighten(armed, restrictionFromUpdate(update, (key) => !NOT_A_RESTRICTION.has(relationship(update, key))));
  }
  // Loosening requires the traveler's own verified words.
  for (const update of updates.filter((u) => admitted(u))) {
    if (update.field === 'preferences' && update.value.avoidExposure === false) armed.avoidExposure = false;
    if (update.field === 'mobility') {
      for (const key of BOOLEAN_MOBILITY) if (update.value[key] === false) delete armed.mobility[key];
      for (const key of LIMIT_MOBILITY) if (positive(update.value[key])) armed.mobility[key] = update.value[key];
    }
  }
  return armed;
}

/** Compact persisted form; null when nothing is armed. */
function serializeHardConstraints(armed) {
  if (!armed) return null;
  const out = {};
  if (armed.avoidExposure) out.avoidExposure = true;
  if (Object.keys(armed.mobility || {}).length) out.mobility = { ...armed.mobility };
  return Object.keys(out).length ? out : null;
}

module.exports = { resolveHardConstraints, serializeHardConstraints, restrictionsFrom };
