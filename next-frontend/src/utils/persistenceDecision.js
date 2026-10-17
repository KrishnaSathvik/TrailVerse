/**
 * Stage 14.7F4B §1/§14 — the ONE rule that decides whether a canonical write was
 * accepted.
 *
 * The server deliberately returns HTTP 200 for BOUNDED persistence decisions:
 * `accept`, `idempotent`, `stale` and `conflict` are all application-level
 * outcomes about canonical ordering, not transport failures. Changing them to
 * 4xx would break every deployed client without making anything safer.
 *
 * That makes the status code actively misleading on its own, so this helper
 * never treats it as evidence of success. The decision comes from the outcome:
 *
 *     accept | idempotent   → persistence success; reveal permitted
 *     stale  | conflict     → persistence failure; NOTHING revealed
 *     4xx validation error  → persistence failure; NOTHING revealed
 *     network failure       → persistence failure (uncertain); nothing revealed
 *
 * Malformed write contracts (unrelated assistant mutations, plan/message
 * identity mismatches) remain bounded 4xx responses and are rejected here too.
 */

/** Outcomes that mean the canonical unit is durably stored as the client sees it. */
export const ACCEPTING_OUTCOMES = Object.freeze(['accept', 'idempotent', 'legacy_migration']);

/** Outcomes that mean the server kept its own state — never a successful save. */
export const REJECTING_OUTCOMES = Object.freeze(['stale', 'conflict', 'canonical_identity_required']);

export function isPersistenceAccepted({ httpStatus, planPersistence, networkError } = {}) {
  if (networkError) return false;

  // A bounded validation failure. Never a write.
  if (typeof httpStatus === 'number' && httpStatus >= 400) return false;

  // Pre-Stage-8 server, or a route that reports no decision: a 2xx is all there is.
  if (!planPersistence) return true;

  // The server's own verdict is authoritative when it says no.
  if (planPersistence.success === false) return false;

  // The load-bearing check: an outcome the client does not recognise as
  // accepting is a rejection, whatever the status line said. A future outcome
  // name therefore fails CLOSED rather than being revealed by default.
  if (planPersistence.outcome != null) {
    return ACCEPTING_OUTCOMES.includes(planPersistence.outcome);
  }

  return true;
}

/** True when the write was rejected on canonical-ordering grounds. */
export function isCanonicalRejection(planPersistence) {
  if (!planPersistence) return false;
  return planPersistence.success === false
    || REJECTING_OUTCOMES.includes(planPersistence.outcome);
}
