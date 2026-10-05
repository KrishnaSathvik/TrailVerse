'use strict';

/**
 * Stage 14.7F4B §2 — COMPLETE frozen-plan succession.
 *
 * Stage 14.7F4A proved the previous freeze was partial. It built the successor
 * plan from the INCOMING write and then patched two fields back:
 *
 *     { ...incomingPlan, days: stored.days, itineraryHash: stored.itineraryHash }
 *
 * `plan` is `Schema.Types.Mixed`, so everything else — stops, coordinates,
 * provenance, warnings, durations, difficulty, park identities, evidence,
 * feasibility, planHash — was taken verbatim from a revision-2 write that has no
 * authority to change any of it. A mutated plan with a correct `itineraryHash`
 * sailed through.
 *
 * The direction is now inverted, which is the whole point: START FROM THE STORED
 * REVISION-1 PLAN and let ONLY an explicit whitelist of lifecycle progression
 * metadata advance. Freezing becomes the default and mutation the exception, so
 * a plan field nobody has thought of yet — including one added long after this
 * code was written — is frozen automatically rather than silently mutable.
 *
 * Pure: no I/O, no mutation of either input.
 */

/**
 * The ONLY fields a revision-2 write may advance.
 *
 * Each is genuinely a property of the terminal revision rather than of the
 * itinerary the revision-1 checkpoint froze:
 *
 *   responseRevision  1 → 2, the succession itself
 *   previousRevision  the checkpoint this revision succeeds
 *   lifecycleStatus   itinerary_ready → prose_ready | fallback_complete
 *   contentHash       hash of the terminal prose, which did not exist at rev 1
 *   proseReadyAt      when the prose became durable (a clock reading, not content)
 *   reviewMeta        shadow review is scheduled at the terminal revision ONLY
 *   auditTrail        describes the COMPLETE response, so it exists only at rev 2
 *
 * `itineraryReadyAt` is deliberately ABSENT: it belongs to revision 1 and is
 * carried forward frozen, never restamped.
 */
const LIFECYCLE_PROGRESSION_FIELDS = Object.freeze([
  'responseRevision',
  'previousRevision',
  'lifecycleStatus',
  'contentHash',
  'proseReadyAt',
  'reviewMeta',
  'auditTrail',
]);

/**
 * Progression fields whose value must come from the CLASSIFIED identity rather
 * than from whatever the request happened to put in the plan body. The resolver
 * has already validated these against the stored response; taking them from the
 * incoming plan would reopen the gap this module closes.
 */
const IDENTITY_SOURCED_FIELDS = Object.freeze(['responseRevision', 'lifecycleStatus', 'contentHash']);

/**
 * Stage 14.7F5 §2 — OWNERSHIP of the remaining progression fields.
 *
 * Being on the whitelist means a field is ALLOWED to advance; it does not mean
 * the client may set it to anything. Persistence is client-initiated, so the
 * request body is an echo of server-built data that we cannot authenticate.
 * Each field below therefore has a rule that survives a hostile echo:
 *
 *   previousRevision  derived from the CLASSIFIED succession, never the body
 *   proseReadyAt      first write wins; never moves backward; never restamped
 *   reviewMeta        server-owned; retained once present; shape-allowlisted
 *   auditTrail        server-owned append-only; retained once present
 *
 * `reviewMeta` and `auditTrail` cannot be proven server-produced under this
 * architecture, so the policy is deliberately conservative: they may only be
 * populated ONCE (revision 1 never carries them — the shadow review is scheduled
 * at the terminal revision, and the audit trail describes the complete
 * response), and a later write can never overwrite or reorder them.
 */
const REVIEW_META_FIELDS = Object.freeze([
  'reviewerRan', 'reviewerMode', 'reviewerModel', 'reviewerPassed',
  'reviewerSeverity', 'reviewerIssueTypes', 'reviewExecution',
  'repaired', 'patchesApplied',
]);

const AUDIT_TRAIL_FIELDS = Object.freeze([
  'generatedAt', 'provider', 'model', 'responseMode', 'confidence',
  'planScore', 'correctionsApplied', 'liveData',
]);

const has = (obj, key) => obj != null && Object.prototype.hasOwnProperty.call(obj, key);

const isPlainObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

/** Keeps only known keys. An injected `leaseToken`/`evaluationRunId` is dropped. */
function pickAllowed(value, allowed) {
  if (!isPlainObject(value)) return null;
  const out = {};
  for (const key of allowed) {
    if (has(value, key)) out[key] = value[key];
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** A timestamp may only be set once, and only ever forward. */
function resolveProseReadyAt({ stored, incoming, floor }) {
  // Already durable — an idempotent replay must not restamp it.
  if (stored != null) return stored;
  if (typeof incoming !== 'string') return stored ?? null;
  const t = Date.parse(incoming);
  if (Number.isNaN(t)) return stored ?? null;
  // The prose cannot have become ready before the itinerary it describes.
  if (floor != null) {
    const f = Date.parse(floor);
    if (!Number.isNaN(f) && t < f) return stored ?? null;
  }
  return incoming;
}

/** Server-owned metadata: writable once, never overwritten, never reordered. */
function resolveServerOwned({ stored, incoming, allowed }) {
  if (stored != null) {
    // Append-only when the stored shape is a list: the stored prefix must survive
    // intact, and only genuinely new trailing entries may be added.
    if (Array.isArray(stored) && Array.isArray(incoming)
        && incoming.length > stored.length
        && JSON.stringify(incoming.slice(0, stored.length)) === JSON.stringify(stored)) {
      return incoming;
    }
    return stored;
  }
  if (Array.isArray(incoming)) {
    return incoming.map((entry) => pickAllowed(entry, allowed)).filter(Boolean);
  }
  return pickAllowed(incoming, allowed);
}

/**
 * Builds the plan to persist for a valid revision-1 → revision-2 succession.
 *
 * @param {Object}      params
 * @param {Object}      params.storedPlan        the stored revision-1 plan (authoritative)
 * @param {Object|null} params.incomingPlan      the submitted revision-2 plan
 * @param {Object|null} params.resolvedIdentity  the CLASSIFIED incoming identity
 * @returns {Object} the plan to persist
 */
function buildFrozenSuccessionPlan({ storedPlan, incomingPlan, resolvedIdentity = null }) {
  // No stored plan means there is nothing to freeze — this is not a succession
  // and the caller should not have routed here. Fail open to the incoming plan
  // rather than fabricating one.
  if (!storedPlan || typeof storedPlan !== 'object') return incomingPlan;

  // Every stored field survives by default, including ones this module has never
  // heard of. Nothing is copied across from the incoming plan implicitly.
  const frozen = { ...storedPlan };

  for (const field of IDENTITY_SOURCED_FIELDS) {
    const value = resolvedIdentity?.[field];
    if (value !== undefined && value !== null) frozen[field] = value;
    else if (has(incomingPlan, field)) frozen[field] = incomingPlan[field];
  }

  // Stage 14.7F5 §2 — derived from the CLASSIFIED succession. A body claiming to
  // succeed some other revision cannot rewrite the lineage it actually succeeded.
  if (storedPlan.responseRevision != null) {
    frozen.previousRevision = storedPlan.responseRevision;
  } else if (has(incomingPlan, 'previousRevision')) {
    frozen.previousRevision = incomingPlan.previousRevision;
  }

  frozen.proseReadyAt = resolveProseReadyAt({
    stored: storedPlan.proseReadyAt ?? null,
    incoming: incomingPlan?.proseReadyAt,
    floor: storedPlan.itineraryReadyAt ?? null,
  });
  if (frozen.proseReadyAt == null && !has(storedPlan, 'proseReadyAt')) delete frozen.proseReadyAt;

  const reviewMeta = resolveServerOwned({
    stored: storedPlan.reviewMeta ?? null,
    incoming: incomingPlan?.reviewMeta,
    allowed: REVIEW_META_FIELDS,
  });
  if (reviewMeta != null) frozen.reviewMeta = reviewMeta;
  else if (!has(storedPlan, 'reviewMeta')) delete frozen.reviewMeta;

  const auditTrail = resolveServerOwned({
    stored: storedPlan.auditTrail ?? null,
    incoming: incomingPlan?.auditTrail,
    allowed: AUDIT_TRAIL_FIELDS,
  });
  if (auditTrail != null) frozen.auditTrail = auditTrail;
  else if (!has(storedPlan, 'auditTrail')) delete frozen.auditTrail;

  return frozen;
}

/**
 * Stage 14.7F4B §13 — the evidence object for a freeze.
 *
 * Compares stored-before against stored-after over the UNION of both key sets,
 * so a field that the incoming write ADDED (and which therefore has no stored
 * counterpart) is still counted as a change rather than quietly ignored.
 *
 * @returns {{allowedProgressionFields: string[], immutableFieldsCompared: string[], immutableFieldsChanged: string[]}}
 */
function compareFrozenSuccessionPlan({ before, after }) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const immutableFieldsCompared = [...keys]
    .filter((k) => !LIFECYCLE_PROGRESSION_FIELDS.includes(k))
    .sort();

  const immutableFieldsChanged = immutableFieldsCompared.filter(
    (k) => JSON.stringify(before?.[k] ?? null) !== JSON.stringify(after?.[k] ?? null)
  );

  return {
    allowedProgressionFields: [...LIFECYCLE_PROGRESSION_FIELDS],
    immutableFieldsCompared,
    immutableFieldsChanged,
  };
}

/** Stage 14.7F5 §2 — the documented authoritative source of every allowed field. */
const PROGRESSION_FIELD_SOURCE = Object.freeze({
  responseRevision: 'classified_persistence_decision',
  lifecycleStatus: 'classified_terminal_lifecycle',
  contentHash: 'server_validated_canonical_content',
  previousRevision: 'classified_succession_relationship',
  proseReadyAt: 'server_timestamp_write_once_forward_only',
  reviewMeta: 'server_owned_write_once_allowlisted',
  auditTrail: 'server_owned_append_only_allowlisted',
});

module.exports = {
  LIFECYCLE_PROGRESSION_FIELDS,
  IDENTITY_SOURCED_FIELDS,
  PROGRESSION_FIELD_SOURCE,
  REVIEW_META_FIELDS,
  AUDIT_TRAIL_FIELDS,
  buildFrozenSuccessionPlan,
  compareFrozenSuccessionPlan,
};
