'use strict';

/**
 * Stage 14.7F4 — the ONE write contract for trip conversations and plans.
 *
 * Why this module exists (Defect C): `findByIdAndUpdate` does not run schema
 * validators, so every `PUT /api/trips/:id` could write malformed conversation
 * state — empty user messages, revision-1 shells with no canonical identity,
 * empty terminal responses. Turning on `runValidators` globally is not the fix:
 * it validates the whole replacement array, so a trip containing one historical
 * empty message becomes permanently unupdatable (proved in §1 of this stage).
 *
 * The rule this encodes instead:
 *
 *     unchanged historical state  → may pass through byte-equivalent
 *     new or modified state       → must satisfy the current write contract
 *
 * Pure by construction: no database access, no network, no mongoose. The same
 * `isCanonicalRevisionOneShell` predicate backs both the Mongoose schema (create
 * path) and this validator (update path), so the two cannot drift.
 */

/** Bounded categories. Reused by the HTTP error mapper; never free-form text. */
const CATEGORY = {
  SCHEMA: 'schema_validation',
  IDENTITY: 'canonical_identity_validation',
  PLAN_MISMATCH: 'plan_mismatch',
  // Stage 14.7F4B §5 — one request, one canonical assistant target.
  TARGET: 'canonical_target_validation',
};

const TERMINAL_REVISION_2_STATUSES = new Set(['prose_ready', 'fallback_complete']);

const isNonEmptyString = (v) => typeof v === 'string' && v.length > 0;
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * The single definition of a canonical revision-1 assistant shell.
 * `models/TripPlan.js` imports this so the create path and the update path agree.
 */
function isCanonicalRevisionOneShell(message) {
  if (!message || message.role !== 'assistant') return false;
  return (
    message.responseRevision === 1 &&
    message.lifecycleStatus === 'itinerary_ready' &&
    isNonEmptyString(message.responseId) &&
    isNonEmptyString(message.itineraryHash)
  );
}

/** Fields compared for byte-equivalence when deciding a historical exemption. */
const PERSISTED_MESSAGE_FIELDS = [
  'id', 'role', 'content', 'responseId', 'responseVersion', 'responseRevision',
  'previousRevision', 'lifecycleStatus', 'contentHash', 'itineraryHash',
];

const normalize = (value) => (value === undefined ? null : value);

function messagesAreByteEquivalent(a, b) {
  return PERSISTED_MESSAGE_FIELDS.every((field) => {
    const left = normalize(a?.[field]);
    const right = normalize(b?.[field]);
    if (left instanceof Date || right instanceof Date) {
      return String(left) === String(right);
    }
    return left === right;
  });
}

/**
 * A new logical response may carry an older client projection of a historical
 * assistant turn. It is unchanged only when its durable content/identity agree
 * and any lifecycle fields it does carry also agree. Missing projection fields
 * are restored from storage by the controller; changed fields still fail closed.
 */
function messagesAreHistoricallyEquivalent(incoming, stored) {
  if (!incoming || !stored || incoming.role !== 'assistant' || stored.role !== 'assistant') return false;
  // `responseId` is the unique canonical storage identity for assistant turns.
  // The numeric `id` is only a UI/storage key and can be reallocated when a
  // saved conversation is hydrated; the controller restores the stored record
  // after this equivalence check, so a changed display id never reaches disk.
  const required = ['role', 'content', 'responseId', 'responseVersion', 'contentHash', 'itineraryHash'];
  if (!required.every((field) => normalize(incoming[field]) === normalize(stored[field]))) return false;
  for (const field of ['responseRevision', 'previousRevision', 'lifecycleStatus']) {
    if (incoming[field] != null && normalize(incoming[field]) !== normalize(stored[field])) return false;
  }
  return true;
}

const fail = (code, category, field) => ({ ok: false, code, category, field: field ?? null });
const pass = () => ({ ok: true });

/**
 * Locates the stored counterpart of an incoming message.
 *
 * Matching is deliberately strict and fails closed on ambiguity, so a caller
 * cannot reuse a historical id to smuggle a different object past validation:
 *   canonical assistant → responseId
 *   legacy message      → stored numeric id, rejected when not unique
 */
function findStoredCounterpart(incoming, storedConversation) {
  if (!Array.isArray(storedConversation)) return { match: null, ambiguous: false };

  if (isNonEmptyString(incoming?.responseId)) {
    const matches = storedConversation.filter(
      (m) => m?.role === 'assistant' && m?.responseId === incoming.responseId
    );
    if (matches.length > 1) return { match: null, ambiguous: true };
    return { match: matches[0] || null, ambiguous: false };
  }

  if (isFiniteNumber(incoming?.id)) {
    const matches = storedConversation.filter((m) => m?.id === incoming.id);
    if (matches.length > 1) return { match: null, ambiguous: true };
    return { match: matches[0] || null, ambiguous: false };
  }

  return { match: null, ambiguous: false };
}

/**
 * Validates ONE new-or-modified conversation message against the current
 * contract. Unchanged historical messages never reach this.
 */
function validateMessage(message, index) {
  const at = `conversation[${index}]`;

  if (!message || typeof message !== 'object') {
    return fail('message_invalid', CATEGORY.SCHEMA, at);
  }
  // Numeric storage identity — the schema declares `id: Number`, and a string
  // id would otherwise surface as an unbounded CastError at write time.
  if (message.id !== undefined && !isFiniteNumber(message.id)) {
    return fail('message_id_not_numeric', CATEGORY.SCHEMA, `${at}.id`);
  }
  if (!['user', 'assistant', 'system'].includes(message.role)) {
    return fail('message_role_invalid', CATEGORY.SCHEMA, `${at}.role`);
  }

  if (message.role === 'user' || message.role === 'system') {
    if (!isNonEmptyString(message.content)) {
      return fail('message_content_required', CATEGORY.SCHEMA, `${at}.content`);
    }
    return pass();
  }

  const revision = message.responseRevision;

  // ── Canonical revision 1: the only message permitted empty content ──
  if (revision === 1) {
    if (message.lifecycleStatus !== 'itinerary_ready') {
      return fail('revision_1_unsupported_lifecycle', CATEGORY.SCHEMA, `${at}.lifecycleStatus`);
    }
    if (message.content !== '') {
      return fail('revision_1_content_not_empty', CATEGORY.SCHEMA, `${at}.content`);
    }
    if (!isNonEmptyString(message.responseId)) {
      return fail('revision_1_missing_response_id', CATEGORY.IDENTITY, `${at}.responseId`);
    }
    if (!isFiniteNumber(message.responseVersion)) {
      return fail('revision_1_missing_response_version', CATEGORY.IDENTITY, `${at}.responseVersion`);
    }
    if (!isNonEmptyString(message.itineraryHash)) {
      return fail('revision_1_missing_itinerary_hash', CATEGORY.IDENTITY, `${at}.itineraryHash`);
    }
    return pass();
  }

  // ── Explicit revision 2 ──
  if (revision === 2) {
    if (!TERMINAL_REVISION_2_STATUSES.has(message.lifecycleStatus)) {
      return fail('revision_2_unsupported_lifecycle', CATEGORY.SCHEMA, `${at}.lifecycleStatus`);
    }
    if (!isNonEmptyString(message.content)) {
      return fail('revision_2_content_empty', CATEGORY.SCHEMA, `${at}.content`);
    }
    if (!isNonEmptyString(message.responseId)) {
      return fail('revision_2_missing_response_id', CATEGORY.IDENTITY, `${at}.responseId`);
    }
    if (!isFiniteNumber(message.responseVersion)) {
      return fail('revision_2_missing_response_version', CATEGORY.IDENTITY, `${at}.responseVersion`);
    }
    if (!isNonEmptyString(message.itineraryHash)) {
      return fail('revision_2_missing_itinerary_hash', CATEGORY.IDENTITY, `${at}.itineraryHash`);
    }
    return pass();
  }

  if (revision !== undefined && revision !== null) {
    return fail('unsupported_response_revision', CATEGORY.SCHEMA, `${at}.responseRevision`);
  }

  // ── Newly submitted legacy terminal assistant message ──
  // Historical empty ones may remain (they never reach here); a NEW one may not
  // be created empty.
  if (!isNonEmptyString(message.content)) {
    return fail('message_content_required', CATEGORY.SCHEMA, `${at}.content`);
  }
  return pass();
}

/**
 * Stage 14.7F4B §5/§9 — resolves the ONE canonical assistant turn a write targets,
 * and proves the plan identity and the nested message identity agree.
 *
 * Defect D4 lived in the old version of this function: when no incoming message
 * owned `plan.responseId` it returned `pass()`. A write could then name response
 * A in the plan and response B in the conversation, and the plan identity — which
 * `extractIncomingResponseIdentity` reads FIRST — silently became authoritative.
 * The trip ended up with `plan.responseId = A` and no conversation turn for A.
 *
 * NOTE on "top-level" identity: the wire format has no separate top-level
 * `responseId`. The top-level canonical identity of a write IS its plan identity
 * when a plan is present, and the latest canonical assistant identity otherwise.
 * The three-way agreement §5 requires therefore reduces to plan ≡ nested, plus
 * the uniqueness of the resolved target — which is what this enforces.
 *
 * @returns {{ok: true, target: Object|null}|{ok: false, code, category, field}}
 */
function latestCanonicalAssistantTarget(conversation) {
  if (!Array.isArray(conversation)) return null;
  for (let i = conversation.length - 1; i >= 0; i -= 1) {
    const m = conversation[i];
    if (m?.role === 'assistant' && isNonEmptyString(m.responseId) && m.responseVersion != null) {
      return {
        responseId: m.responseId,
        responseVersion: m.responseVersion,
        responseRevision: m.responseRevision ?? null,
        itineraryHash: m.itineraryHash ?? null,
      };
    }
  }
  return null;
}

/**
 * WP-TU Phase 4 Task 10E — verifies a CROSS-PLAN mutation's claimed
 * provenance against REAL, already-fetched source data. This module stays
 * pure (no database access) by design: `sourceProvenance.sourceConversation`
 * is the SOURCE trip's actual stored conversation array, already fetched
 * and ownership-checked by the controller (never derived from anything the
 * client sent about its content — only the source trip's id is client-
 * supplied). Returns the verified source assistant message, or `null` when
 * any of the three checks fails — the caller treats `null` as "no legitimate
 * owner", identical to the ordinary same-trip miss.
 *
 *   1. A message in the source conversation carries the claimed responseId
 *      (proves the claimed turn was actually, durably persisted there).
 *   2. That SAME message's own `targetTripId` (Task 10, already built) names
 *      THIS trip specifically — not a third trip, not left unset.
 *
 * Ownership of the source trip itself (the acting user actually owns it,
 * not just claims its id) is the controller's job, before this ever runs —
 * see `sourceProvenance` construction in tripController.js.
 */
function verifyCrossPlanProvenance({ sourceProvenance, targetTripId }) {
  if (!sourceProvenance || !isNonEmptyString(sourceProvenance.sourceResponseId) || targetTripId == null) {
    return null;
  }
  const sourceConversation = Array.isArray(sourceProvenance.sourceConversation)
    ? sourceProvenance.sourceConversation
    : [];
  const sourceOwner = sourceConversation.find(
    (m) => m?.role === 'assistant' && m.responseId === sourceProvenance.sourceResponseId
  );
  if (!sourceOwner) return null; // not (yet) persisted, or a wrong/stale claim — fail closed
  if (String(sourceOwner.targetTripId ?? '') !== String(targetTripId)) return null;
  return sourceOwner;
}

function resolveCanonicalWriteTarget({
  plan,
  conversation,
  storedConversation = null,
  // WP-TU Phase 4 Task 10E — optional, additive. Only ever populated by the
  // ONE write shape that needs it (a cross-plan target-plan save); every
  // other write shape passes neither, and behavior is byte-identical to
  // before this task.
  sourceProvenance = null,
  targetTripId = null,
}) {
  const hasPlan = plan && typeof plan === 'object';

  // A plan carrying half an identity is malformed, not legacy. Left unchecked it
  // would be read as "no identity" and take the legacy-migration branch.
  if (hasPlan && isNonEmptyString(plan.responseId) && !isFiniteNumber(plan.responseVersion)) {
    return fail('plan_identity_incomplete', CATEGORY.TARGET, 'plan.responseVersion');
  }

  if (!hasPlan || !isNonEmptyString(plan.responseId)) {
    // No plan identity. The target — if the write has one at all — is the latest
    // canonical assistant message, mirroring exactly what
    // `latestCanonicalAssistantIdentity` will pick during classification, so
    // validation and classification can never disagree about which turn this is.
    // (Inlined rather than imported: `models/TripPlan` requires this module, and
    // reaching into `utils/canonicalPersistence` would pull the persistence
    // resolver into the schema's require graph.)
    return { ok: true, target: latestCanonicalAssistantTarget(conversation) };
  }

  // Ownership is proven against the conversation being WRITTEN. A plan-only
  // update (no `conversation` field) is checked against the stored conversation,
  // which is what will still be there after the write.
  const scope = Array.isArray(conversation) ? conversation : storedConversation;
  const owners = (Array.isArray(scope) ? scope : []).filter(
    (m) => m?.role === 'assistant' && m?.responseId === plan.responseId
  );

  if (owners.length === 0) {
    // WP-TU Phase 4 Task 10E — the narrow ownership extension. A plan whose
    // identity is not owned by THIS trip's own conversation may still be
    // legitimate: a cross-plan mutation, whose owner is a VERIFIED assistant
    // message in a DIFFERENT, SAME-USER trip that explicitly named this
    // trip as its target (`targetTripId`, Task 10). Both are checked
    // against REAL stored data (`verifyCrossPlanProvenance`); nothing here
    // trusts the client's claim about content.
    const sourceOwner = verifyCrossPlanProvenance({ sourceProvenance, targetTripId });
    if (sourceOwner) {
      // The version/conflict DECISION is not made here — that is
      // `resolveCanonicalResponsePersistence`'s job downstream, comparing
      // this plan against the TARGET's own stored plan, exactly like any
      // other write. `sourceOwner`'s own responseVersion/itineraryHash
      // describe an UNRELATED trip's turn and must never be compared
      // against this plan's — unlike the same-trip branch below, which
      // legitimately does that comparison against ITS OWN owner.
      return {
        ok: true,
        target: {
          responseId: plan.responseId,
          responseVersion: plan.responseVersion ?? null,
          responseRevision: plan.responseRevision ?? null,
          itineraryHash: plan.itineraryHash ?? null,
        },
      };
    }
    // D4 — the plan names a response no assistant turn owns, and no
    // verified cross-plan provenance justifies it either.
    return fail('plan_message_identity_mismatch', CATEGORY.TARGET, 'plan.responseId');
  }
  if (owners.length > 1) {
    return fail('canonical_target_ambiguous', CATEGORY.TARGET, 'plan.responseId');
  }

  const owner = owners[0];

  if (plan.itineraryHash !== undefined && owner.itineraryHash !== undefined
      && plan.itineraryHash !== owner.itineraryHash) {
    return fail('plan_itinerary_hash_mismatch', CATEGORY.PLAN_MISMATCH, 'plan.itineraryHash');
  }
  if (plan.responseVersion !== undefined && owner.responseVersion !== undefined
      && plan.responseVersion !== owner.responseVersion) {
    return fail('plan_response_version_mismatch', CATEGORY.PLAN_MISMATCH, 'plan.responseVersion');
  }
  if (plan.responseRevision !== undefined && owner.responseRevision !== undefined
      && plan.responseRevision !== owner.responseRevision) {
    return fail('plan_response_revision_mismatch', CATEGORY.PLAN_MISMATCH, 'plan.responseRevision');
  }

  return {
    ok: true,
    target: {
      responseId: plan.responseId,
      responseVersion: plan.responseVersion ?? owner.responseVersion ?? null,
      responseRevision: plan.responseRevision ?? owner.responseRevision ?? null,
      itineraryHash: plan.itineraryHash ?? owner.itineraryHash ?? null,
    },
  };
}

/**
 * Stage 14.7F4B §6 — ONE canonical assistant turn may change per write.
 *
 * Defect D2: identity resolution reads only the plan, and the conversation array
 * is then written wholesale. A write naming a valid target could therefore carry
 * an extra assistant turn under an unrelated `responseId` and have it persisted,
 * because no rule required every assistant message to be accounted for.
 *
 * Permitted:
 *   - assistant turns byte-equivalent to their stored counterpart (unchanged history)
 *   - the ONE targeted assistant turn
 *   - user/system messages, which the message contract validates separately
 *
 * Anything else — a newly appended assistant response, or an edit to a
 * non-targeted one — is a bounded validation failure with zero mutation.
 */
function validateAssistantMutationScope({ conversation, storedConversation, target }) {
  if (!Array.isArray(conversation) || !Array.isArray(storedConversation)) return pass();
  // No canonical target means this is a legacy (pre-Stage-8) write with no
  // response identity anywhere. There is no canonical turn to smuggle an extra
  // one alongside, and the legacy branch of `resolveCanonicalResponsePersistence`
  // already refuses to let such a write touch a canonical trip.
  if (!target) return pass();

  for (let i = 0; i < conversation.length; i += 1) {
    const message = conversation[i];
    if (!message || message.role !== 'assistant') continue;

    // The one turn this write is allowed to advance.
    if (target && isNonEmptyString(message.responseId) && message.responseId === target.responseId) {
      continue;
    }

    const { match, ambiguous } = findStoredCounterpart(message, storedConversation);
    if (ambiguous) {
      return fail('historical_match_ambiguous', CATEGORY.IDENTITY, `conversation[${i}]`);
    }
    if (match && (messagesAreByteEquivalent(message, match) || messagesAreHistoricallyEquivalent(message, match))) continue;

    return fail('unrelated_assistant_mutation', CATEGORY.TARGET, `conversation[${i}]`);
  }

  return pass();
}

/**
 * The write-candidate boundary.
 *
 * @param {'create'|'update'} operation
 * @param {object|null} existingTrip  stored trip (update only)
 * @param {Array|undefined} incomingConversation
 * @param {object|undefined} incomingPlan
 * @returns {{ok: true, target?: object|null}|{ok: false, code: string, category: string, field: string|null}}
 */
function validateTripWriteCandidate({
  operation,
  existingTrip = null,
  incomingConversation,
  incomingPlan,
  // WP-TU Phase 4 Task 10E — optional, additive; see resolveCanonicalWriteTarget.
  sourceProvenance = null,
  targetTripId = null,
} = {}) {
  const storedConversation = operation === 'update' && Array.isArray(existingTrip?.conversation)
    ? existingTrip.conversation
    : null;

  if (incomingConversation !== undefined) {
    if (!Array.isArray(incomingConversation)) {
      return fail('conversation_invalid', CATEGORY.SCHEMA, 'conversation');
    }

    const stored = operation === 'update' ? existingTrip?.conversation : null;

    for (let i = 0; i < incomingConversation.length; i += 1) {
      const message = incomingConversation[i];

      if (operation === 'update' && Array.isArray(stored)) {
        const { match, ambiguous } = findStoredCounterpart(message, stored);
        // Ambiguity fails closed: an exemption must be unmistakable.
        if (ambiguous) {
          return fail('historical_match_ambiguous', CATEGORY.IDENTITY, `conversation[${i}]`);
        }
        // Unchanged historical record: passes through untouched. Any edit to any
        // persisted field removes the exemption and it is validated as new.
        if (match && (messagesAreByteEquivalent(message, match) || messagesAreHistoricallyEquivalent(message, match))) continue;
      }

      const verdict = validateMessage(message, i);
      if (!verdict.ok) return verdict;
    }
  }

  // Stage 14.7F4B §5/§9/§10 — identity resolution runs AFTER shape validation and
  // BEFORE anything downstream classifies or mutates. The resolved target is
  // returned so the caller never has to re-derive it from request shape.
  const targetVerdict = resolveCanonicalWriteTarget({
    plan: incomingPlan,
    conversation: incomingConversation,
    storedConversation,
    sourceProvenance,
    targetTripId,
  });
  if (!targetVerdict.ok) return targetVerdict;

  // Stage 14.7F4B §6 — only the resolved target may change (update path only;
  // on create every message is new by definition).
  if (operation === 'update') {
    const scopeVerdict = validateAssistantMutationScope({
      conversation: incomingConversation,
      storedConversation,
      target: targetVerdict.target,
    });
    if (!scopeVerdict.ok) return scopeVerdict;
  }

  return { ok: true, target: targetVerdict.target };
}

/** Bounded application error carrying only the code, category and field path. */
function tripWriteContractError(verdict) {
  const error = new Error(verdict.code);
  error.code = verdict.code;
  error.category = verdict.category;
  error.field = verdict.field;
  error.statusCode = 400;
  error.isTripWriteContractError = true;
  return error;
}

module.exports = {
  validateTripWriteCandidate,
  resolveCanonicalWriteTarget,
  verifyCrossPlanProvenance,
  // WP-TU Phase 4 Task 12 — read-only plumbing export, same pattern used
  // repeatedly in this chain (e.g. `REFINEMENT_JOBS`): `targetPlanHydration.js`
  // needs the IDENTICAL conversation-scan `resolveCanonicalWriteTarget`
  // already uses for the write-validation side, applied here to reading a
  // stored trip's current identity instead of validating an incoming one.
  latestCanonicalAssistantTarget,
  validateAssistantMutationScope,
  tripWriteContractError,
  isCanonicalRevisionOneShell,
  messagesAreByteEquivalent,
  messagesAreHistoricallyEquivalent,
  findStoredCounterpart,
  CATEGORY,
  PERSISTED_MESSAGE_FIELDS,
  TERMINAL_REVISION_2_STATUSES,
};
