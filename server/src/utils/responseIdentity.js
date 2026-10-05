'use strict';

/**
 * Stage 14.1 §2 — stable response identity, minted ONCE at turn admission.
 *
 * Before Stage 14, `responseId` was minted inside buildCanonicalTrailieResponse —
 * i.e. after Phase A and Phase B had both finished. That is too late for early
 * delivery: `response_started` needs an identity, and both revisions of one turn
 * (itinerary_ready, then terminal prose) must carry the SAME id so the persistence
 * layer can recognize them as one logical response.
 *
 * Contract:
 *   - exactly one identity per logical server turn
 *   - the same identity is used for revision 1, revision 2, and terminal
 *     structured-failure / prose-only responses
 *   - NO second identity is minted during canonical-envelope construction
 *   - raw client input NEVER contributes to identity generation (no user text, no
 *     prompt, no park name) — it is a random UUID and nothing else
 *
 * This module holds no state and performs no I/O. The turn seam creates one
 * identity and threads it through; nothing here reads or writes a trip.
 */

const { randomUUID } = require('crypto');

const RESPONSE_REVISION = {
  ITINERARY_READY: 1,
  TERMINAL: 2,
};

/**
 * Mint the identity for one logical turn.
 *
 * @param {Object} [params]
 * @param {number} [params.priorResponseVersion]  the trip's current turn counter
 * @param {string} [params.responseId]            an already-minted id (idempotent reuse)
 * @returns {{responseId: string, responseVersion: number, mintedAt: string}}
 */
function createTurnResponseIdentity({ priorResponseVersion = 0, responseId = null } = {}) {
  const prior = Number(priorResponseVersion);
  return {
    // Random only. Deriving this from request content would leak user text into an
    // identifier that is persisted, shared, and exported.
    responseId: responseId || randomUUID(),
    // Unchanged Stage 8 semantics: per-trip logical TURN counter.
    responseVersion: (Number.isFinite(prior) && prior > 0 ? prior : 0) + 1,
    mintedAt: new Date().toISOString(),
  };
}

/**
 * Read `priorResponseVersion` off a request body without trusting its shape.
 * Mirrors the existing `ai.js` derivation so behavior is identical.
 */
function readPriorResponseVersion(body) {
  const raw = body && body.metadata && body.metadata.priorResponseVersion;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

module.exports = {
  RESPONSE_REVISION,
  createTurnResponseIdentity,
  readPriorResponseVersion,
};
