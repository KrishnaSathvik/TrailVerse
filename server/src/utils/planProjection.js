'use strict';

/**
 * Stage 14.7F5 §7–§11 + Architecture Lock Step 7.
 *
 * Public/share/export surfaces share one deep allowlist:
 * `shared/publicPlanExport.cjs` → `exportPublicPlan` / `projectPublicPlan`.
 *
 * The owner surface remains subtractive against INTERNAL_ONLY_FIELDS.
 */

const path = require('path');
const {
  PUBLIC_PLAN_FIELDS,
  exportPublicPlan,
  projectPublicPlan,
} = require(path.join(__dirname, '../../../shared/publicPlanExport.cjs'));

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
  exportPublicPlan,
  projectPublicPlan,
  projectOwnerTrip,
  stripInternalFields,
};
