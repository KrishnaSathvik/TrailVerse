'use strict';

/**
 * PHASE 9C.1D.5B.2 — COMPLETED SEMANTIC TERMINAL vs FAILURE (guest persistence).
 *
 * THE DEFECT
 * ----------
 * Both anonymous routes treated `v2Result.status !== 'complete'` as a provider
 * failure. A deliberate, fully-formed answer — "I can't reliably build this
 * plan around Mist Trail…", a drive-cap refusal, "I can't confirm that safely
 * right now…" — rendered live, but the guest turn was recorded
 * `failed / provider_http_failure`, never written to history, and vanished on
 * reload (9C.1D.5B.1 live run).
 *
 * THE PREDICATE
 * -------------
 * A completed semantic terminal is a turn where the execution runtime decided,
 * on purpose, what to tell the traveler instead of a plan. It is an ANSWER, so
 * it persists exactly like one. It is explicit, not "anything that isn't
 * `failed`": an unrecognised or future status must not silently consume quota
 * or enter history, so it keeps the failure path until it is named here.
 *
 * Agrees with the frontend's `classifyTrailieTurnOutcome` (next-frontend
 * src/utils/trailieTurnOutcome.js): every status listed here is a
 * conversation outcome there, never a retryable failure. A test pins that.
 *
 *   constraint_infeasible   — hard constraint cannot be met (drive cap; an
 *                             explicitly named experience unavailable/ineligible)
 *   evidence_incomplete     — required authoritative truth unavailable; says so
 *   plan_target_unresolved  — the referenced saved trip is ambiguous/not found
 *
 * NOT completed: `complete` (has its own path), `failed`, `cancelled`
 * (disconnect/abort), `disabled`, and anything unlisted. A semantic status with
 * no traveler-facing text is not an answer either.
 */

const COMPLETED_SEMANTIC_TERMINAL_STATUSES = Object.freeze(new Set([
  'constraint_infeasible',
  'evidence_incomplete',
  'plan_target_unresolved',
]));

function isCompletedSemanticTerminal(v2Result, content) {
  if (!v2Result || typeof v2Result !== 'object') return false;
  if (!COMPLETED_SEMANTIC_TERMINAL_STATUSES.has(v2Result.status)) return false;
  return typeof content === 'string' && content.trim().length > 0;
}

module.exports = {
  COMPLETED_SEMANTIC_TERMINAL_STATUSES,
  isCompletedSemanticTerminal,
};
