'use strict';

/**
 * Stage 14.7F5 §7–§11 — the projection boundary for every surface that leaves
 * the server.
 *
 * Share and export previously sanitized with DENYLISTS. A denylist is the wrong
 * default here: the plan is `Schema.Types.Mixed`, so the day a new internal
 * field is added to the canonical plan envelope it becomes public automatically
 * and silently. Nobody gets a test failure; the field just ships.
 *
 * So the public surfaces are now ALLOWLISTED. A key survives only by being named
 * here, which means an unknown field — internal or not — is omitted by default
 * and adding one is a deliberate act.
 *
 * The owner surface is different in kind. An owner legitimately needs canonical
 * identity and lifecycle state to restore their own trip, so it stays
 * subtractive — but subtractive against a documented list of things that are
 * never client data at all (leases, evaluation metadata, reviewer drafts,
 * provider payloads, reducer/persistence internals).
 */

/**
 * Everything a public/share/export consumer actually reads from a plan.
 *
 * Derived from real consumption: the shared-trip view and the PDF export read
 * `days`, `feasibilityIssues`, `totalDays`, `highlights`, `packingList`,
 * `permits` and `estimatedCost`; the rest is presentation envelope.
 *
 * Canonical identity (`responseId`, `responseVersion`, `responseRevision`,
 * `contentHash`, `itineraryHash`), lifecycle (`lifecycleStatus`,
 * `itineraryReadyAt`, `proseReadyAt`) and server-owned metadata (`reviewMeta`,
 * `auditTrail`) are deliberately ABSENT — a recipient gets the coarse
 * `notesStatus` instead of raw revision bookkeeping.
 */
const PUBLIC_PLAN_FIELDS = Object.freeze([
  // presentation envelope
  'type',
  'version',
  'generatedAt',
  'createdFrom',
  'parkName',
  'parkCode',
  // itinerary content
  'days',
  'totalDays',
  'highlights',
  'packingList',
  'permits',
  'estimatedCost',
  'feasibilityIssues',
]);

/**
 * Fields that are never client data on ANY surface, including the owner's own
 * trip. Grouped by the §7 categories so the intent survives future edits.
 */
const INTERNAL_ONLY_FIELDS = Object.freeze([
  // reviewer internals — prompts and rejected drafts, not the bounded verdict
  'promptHash', 'rawReviewerOutput', 'rawRepairOutput', 'reviewerPrompt',
  'reviewerPrompts', 'rejectedDraft', 'rejectedDrafts',
  // provider request/response payloads
  'providerRequest', 'providerResponse', 'rawProviderResponse', 'providerPayload',
  // recovery / queue leases and fencing
  'leaseToken', 'fencingToken', 'recoveryLease', 'queueLease', 'leaseOwner',
  // evaluation harness metadata
  'evaluationRunId', 'evaluationMeta', 'evalRunId',
  // persistence + lifecycle machinery
  'persistenceDecision', 'persistenceEffects', 'lifecycleEffects', 'reducerState',
  'expectedPreviousRevision',
  // instrumentation and diagnostics
  'constructorInstrumentation', 'internalDiagnostics', 'networkGuard',
  'validationDiagnostics',
]);

const isObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

/**
 * Only PLAIN objects may be rebuilt key-by-key.
 *
 * A `Date`, an `ObjectId` or a `Buffer` is `typeof 'object'` but carries its
 * value in internal slots, not in enumerable keys — rebuilding one from
 * `Object.entries` silently yields `{}`. That is how a timestamp turns into an
 * empty object and byte-equivalence checks downstream start failing.
 */
const isPlainObject = (v) => {
  if (!isObject(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/**
 * ALLOWLIST projection for share/export. Unknown keys are dropped.
 *
 * @param {Object|null} plan
 * @returns {Object|null}
 */
function projectPublicPlan(plan) {
  if (!isObject(plan)) return plan == null ? null : plan;
  const out = {};
  for (const field of PUBLIC_PLAN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(plan, field)) out[field] = plan[field];
  }
  return out;
}

/**
 * SUBTRACTIVE projection for the trip owner, who needs identity and lifecycle to
 * restore. Applied to the plan and to the trip envelope, recursively, so an
 * internal field nested inside `reviewMeta`/`auditTrail` is removed too.
 */
function stripInternalFields(value, depth = 0) {
  if (Array.isArray(value)) {
    return depth > 6 ? value : value.map((v) => stripInternalFields(v, depth + 1));
  }
  // Dates, ObjectIds and Buffers pass through untouched — see isPlainObject.
  if (!isPlainObject(value)) return value;
  if (depth > 6) return value;

  const out = {};
  for (const [key, v] of Object.entries(value)) {
    if (INTERNAL_ONLY_FIELDS.includes(key)) continue;
    out[key] = stripInternalFields(v, depth + 1);
  }
  return out;
}

/**
 * @param {Object} trip  a lean trip document (or a mongoose doc's toObject())
 * @returns {Object}
 */
function projectOwnerTrip(trip) {
  if (!isObject(trip)) return trip;
  return stripInternalFields(trip);
}

module.exports = {
  PUBLIC_PLAN_FIELDS,
  INTERNAL_ONLY_FIELDS,
  projectPublicPlan,
  projectOwnerTrip,
  stripInternalFields,
};
