'use strict';

/**
 * Stage 8 — optimistic-concurrency decision for the trip plan slot.
 * Stage 14.1 — extended with INTRA-TURN revisions.
 *
 * A trip's `plan` holds exactly one authoritative canonical response identity.
 * `responseVersion` is a per-trip monotonic counter: every new authoritative
 * response (next turn or regeneration) increases it. This pure decision keeps a
 * delayed or duplicate write from clobbering a newer stored result — the core of
 * F-PERSIST-1.
 *
 * Stage 14.1 adds a SECOND ordering axis so one logical turn can be persisted in
 * two steps (early frozen itinerary, then verified prose) WITHOUT consuming two
 * turn slots:
 *
 *   ordering key = (responseVersion, responseRevision)
 *
 *   responseVersion  — per-trip logical TURN counter. Semantics UNCHANGED.
 *   responseRevision — intra-turn revision: 1 = itinerary_ready, 2 = terminal.
 *
 * Rules:
 *   - nothing stored                              → ACCEPT
 *   - version stored+1, new id, no revision claim → ACCEPT ('direct_terminal' at
 *                                                   revision 2, 'newer_version' at 1)
 *   - version stored+1 WITH a revision claim      → CONFLICT (Stage 14.7F4B §7:
 *                                                   no checkpoint exists there)
 *   - version stored+1 reusing the stored id      → CONFLICT
 *   - version gap (> stored+1)                    → CONFLICT
 *   - older responseVersion                       → STALE
 *   - same version, higher revision, valid CAS    → ACCEPT   (rev 1 → rev 2)
 *   - same version, higher revision, itinerary changed → CONFLICT
 *   - same version, lower revision                → STALE
 *   - same id + version + revision + hashes       → IDEMPOTENT
 *   - same id + version + revision, hashes differ → CONFLICT
 *   - different id at the same version slot       → CONFLICT
 *
 * BACKWARD COMPATIBILITY: a missing `responseRevision` — on the incoming write OR
 * on an already-stored response — means TERMINAL revision 2. Every pre-Stage-14
 * client and every row written before this change therefore behaves exactly as it
 * did before.
 */

const PERSISTENCE_OUTCOME = {
  ACCEPT: 'accept',
  IDEMPOTENT: 'idempotent',
  STALE: 'stale',
  CONFLICT: 'conflict',
};

/** Intra-turn revisions. */
const RESPONSE_REVISION = {
  ITINERARY_READY: 1,
  TERMINAL: 2,
};

/** Durable lifecycle states. Transient generation states are NEVER persisted. */
const LIFECYCLE_STATUS = {
  ITINERARY_READY: 'itinerary_ready',
  PROSE_READY: 'prose_ready',
  FALLBACK_COMPLETE: 'fallback_complete',
  PROSE_FAILED: 'prose_failed',
};

const DURABLE_LIFECYCLE_STATUSES = new Set(Object.values(LIFECYCLE_STATUS));

/** States that describe work in flight. Valid as SSE events, never as stored state. */
const TRANSIENT_LIFECYCLE_STATUSES = new Set([
  'generating_itinerary',
  'generating_prose',
]);

const IDENTITY_KEYS = ['responseId', 'responseVersion', 'responseRevision', 'contentHash', 'itineraryHash'];

/**
 * Normalize a revision value. Absent/invalid ⇒ TERMINAL, so legacy rows and legacy
 * clients are read as complete responses rather than as a missing checkpoint.
 */
function normalizeRevision(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return RESPONSE_REVISION.TERMINAL;
  return n;
}

/** Pull the canonical identity from a stored plan doc, or null for legacy plans. */
function extractPlanIdentity(plan) {
  if (!plan || typeof plan !== 'object') return null;
  if (plan.responseId == null || plan.responseVersion == null) return null;
  return {
    responseId: plan.responseId,
    responseVersion: plan.responseVersion,
    // Stage 14.1 — absent revision on a stored plan means it is already terminal.
    responseRevision: normalizeRevision(plan.responseRevision),
    revisionExplicit: plan.responseRevision != null,
    // Stage 14.2 — the DURABLE lifecycle status participates in semantic identity.
    lifecycleStatus: plan.lifecycleStatus ?? null,
    contentHash: plan.contentHash ?? null,
    itineraryHash: plan.itineraryHash ?? null,
  };
}

function hashesMatch(a, b) {
  return a.contentHash === b.contentHash && a.itineraryHash === b.itineraryHash;
}

/**
 * Stage 14.2 — durable lifecycle equivalence for SAME-REVISION comparison.
 *
 * Two writes at the same (version, revision) with identical hashes are only the
 * same response if they also agree on what that response IS. `prose_ready` and
 * `fallback_complete` are genuinely different provenance and must NOT silently
 * collapse into an idempotent write.
 *
 * ONE documented equivalence: an ABSENT status (legacy rows, and pre-Stage-14
 * clients that never send one) is compatible with any durable status at the same
 * revision. Without that, an upgraded client re-saving a legacy row byte-for-byte
 * would spuriously conflict.
 *
 * Timestamps (itineraryReadyAt / proseReadyAt) are deliberately NOT part of
 * semantic equality — a retry may legitimately carry a later clock reading.
 */
function lifecycleStatusesEquivalent(a, b) {
  if (a == null || b == null) return true; // unspecified matches anything
  return a === b;
}

/**
 * @param {{incoming: Object, existing: Object|null}} params
 * @returns {{outcome: string, reason: string}}
 */
function decidePersistenceOutcome({ incoming, existing }) {
  const inRevision = normalizeRevision(incoming.responseRevision);

  if (!existing) {
    // Stage 14.1 — a write that CLAIMS to succeed a revision 1 must not be able to
    // create state from nothing; that would build a trip with terminal prose and no
    // itinerary checkpoint. A direct-terminal write (no expectedPreviousRevision)
    // is still accepted, which is what keeps non-streaming and legacy clients working.
    if (incoming.expectedPreviousRevision != null) {
      return { outcome: PERSISTENCE_OUTCOME.CONFLICT, reason: 'expected_revision_but_none_stored' };
    }
    return { outcome: PERSISTENCE_OUTCOME.ACCEPT, reason: 'no_existing_identity' };
  }

  const exRevision = normalizeRevision(existing.responseRevision);

  // Same version slot is evaluated first so an idempotent retry always succeeds,
  // even when a stale expectedPreviousVersion accompanies it.
  if (incoming.responseVersion === existing.responseVersion) {
    if (incoming.responseId !== existing.responseId) {
      return { outcome: PERSISTENCE_OUTCOME.CONFLICT, reason: 'different_response_same_version' };
    }

    // ── Stage 14.1 — intra-turn revision succession (rev 1 → rev 2) ──────────
    if (inRevision > exRevision) {
      // The frozen itinerary is immutable from itinerary_ready onward. A terminal
      // revision that changes it is a corrupted succession, never an update.
      if (incoming.itineraryHash !== existing.itineraryHash) {
        return { outcome: PERSISTENCE_OUTCOME.CONFLICT, reason: 'revision_itinerary_hash_changed' };
      }
      // Compare-and-swap: the writer must name the revision it is succeeding.
      if (incoming.expectedPreviousRevision != null && incoming.expectedPreviousRevision !== exRevision) {
        return { outcome: PERSISTENCE_OUTCOME.CONFLICT, reason: 'revision_base_mismatch' };
      }
      if (inRevision !== exRevision + 1) {
        return { outcome: PERSISTENCE_OUTCOME.CONFLICT, reason: 'revision_jump' };
      }
      return { outcome: PERSISTENCE_OUTCOME.ACCEPT, reason: 'newer_revision' };
    }

    if (inRevision < exRevision) {
      // A late revision 1 arriving after the terminal revision landed.
      return { outcome: PERSISTENCE_OUTCOME.STALE, reason: 'older_revision' };
    }

    // Same version AND same revision — the original Stage 8 slot comparison,
    // extended so the durable lifecycle status participates in semantic identity.
    if (hashesMatch(incoming, existing)) {
      if (!lifecycleStatusesEquivalent(incoming.lifecycleStatus, existing.lifecycleStatus)) {
        return { outcome: PERSISTENCE_OUTCOME.CONFLICT, reason: 'same_revision_different_lifecycle_status' };
      }
      return { outcome: PERSISTENCE_OUTCOME.IDEMPOTENT, reason: 'identical_write' };
    }
    return { outcome: PERSISTENCE_OUTCOME.CONFLICT, reason: 'same_version_different_hash' };
  }

  if (incoming.responseVersion < existing.responseVersion) {
    return { outcome: PERSISTENCE_OUTCOME.STALE, reason: 'older_version' };
  }

  // ── incoming.responseVersion > existing.responseVersion ────────────────────
  //
  // Stage 14.7F4B §7 (Defect D3). Revision semantics are resolved BEFORE this is
  // treated as an ordinary newer version. Previously `expectedPreviousRevision`
  // was consulted only in the same-version branch above, so a revision-2 write
  // claiming to succeed revision 1 while naming version N+1 fell through here
  // and was accepted — consuming a fresh turn slot and destroying the revision-1
  // checkpoint it claimed to be succeeding.
  //
  // A revision succession is same-turn by definition: it must target the SAME
  // responseId at the SAME responseVersion. At a different version there is, by
  // construction, no revision-1 checkpoint to succeed.
  if (incoming.expectedPreviousRevision != null) {
    return { outcome: PERSISTENCE_OUTCOME.CONFLICT, reason: 'expected_revision_but_none_stored' };
  }

  // A new logical turn is a NEW response. Reusing the stored id at a different
  // version is either a client bug or a replayed write wearing the wrong version.
  if (incoming.responseId === existing.responseId) {
    return { outcome: PERSISTENCE_OUTCOME.CONFLICT, reason: 'response_id_version_reuse' };
  }

  // Logical turns advance one at a time, whether or not the client states its
  // base. A gap means a write is missing, and accepting it would leave the turn
  // counter describing history that was never persisted.
  if (incoming.responseVersion !== existing.responseVersion + 1) {
    return { outcome: PERSISTENCE_OUTCOME.CONFLICT, reason: 'version_jump' };
  }

  // When the client states the base it worked from, it must match the stored one.
  // A behind base means a newer response already landed.
  if (incoming.expectedPreviousVersion != null) {
    if (incoming.expectedPreviousVersion < existing.responseVersion) {
      return { outcome: PERSISTENCE_OUTCOME.STALE, reason: 'expected_base_behind' };
    }
    if (incoming.expectedPreviousVersion !== existing.responseVersion) {
      return { outcome: PERSISTENCE_OUTCOME.CONFLICT, reason: 'version_jump' };
    }
  }

  // Stage 14.7F4B §7/§8 — the DIRECT-TERMINAL path, explicitly classified.
  // A brand-new turn landing straight at the terminal revision with no claim of
  // a prior checkpoint. This is how a flag-off client, a legacy client (absent
  // revision ⇒ terminal), and an early-delivery failure before revision 1 was
  // ever persisted all still work. It must NOT be conflated with succession.
  if (inRevision === RESPONSE_REVISION.TERMINAL) {
    return { outcome: PERSISTENCE_OUTCOME.ACCEPT, reason: 'direct_terminal' };
  }

  return { outcome: PERSISTENCE_OUTCOME.ACCEPT, reason: 'newer_version' };
}

/**
 * Controller-level guard. Given the plan a client wants to write and the plan
 * currently stored, decide whether the write may proceed. Backward compatible:
 * a legacy incoming plan (no envelope identity) is accepted so pre-Stage-8
 * clients keep working during rollout.
 *
 * @param {{incomingPlan: Object|null|undefined, existingPlan: Object|null}} params
 * @returns {{outcome: string, reason: string, shouldWrite: boolean, success: boolean}}
 */
function resolvePlanPersistence({ incomingPlan, existingPlan }) {
  // No plan field in this update — nothing to guard, and not a failure.
  if (incomingPlan == null) {
    return { outcome: null, reason: 'no_plan_in_update', shouldWrite: false, success: true };
  }

  const incoming = extractPlanIdentity(incomingPlan);
  if (!incoming) {
    return {
      outcome: PERSISTENCE_OUTCOME.ACCEPT,
      reason: 'legacy_incoming_no_identity',
      shouldWrite: true,
      success: true,
    };
  }

  const existing = extractPlanIdentity(existingPlan);
  const { outcome, reason } = decidePersistenceOutcome({ incoming, existing });

  const shouldWrite = outcome === PERSISTENCE_OUTCOME.ACCEPT;
  const success =
    outcome === PERSISTENCE_OUTCOME.ACCEPT || outcome === PERSISTENCE_OUTCOME.IDEMPOTENT;

  return { outcome, reason, shouldWrite, success };
}

module.exports = {
  PERSISTENCE_OUTCOME,
  RESPONSE_REVISION,
  LIFECYCLE_STATUS,
  DURABLE_LIFECYCLE_STATUSES,
  TRANSIENT_LIFECYCLE_STATUSES,
  IDENTITY_KEYS,
  normalizeRevision,
  lifecycleStatusesEquivalent,
  extractPlanIdentity,
  decidePersistenceOutcome,
  resolvePlanPersistence,
};
