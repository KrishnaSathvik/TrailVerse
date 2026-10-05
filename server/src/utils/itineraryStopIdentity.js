'use strict';

/**
 * Phase 9C.1D.1 — canonical stop endpoint identity.
 *
 * `stop.id` is the only thing a future travel-edge (`sourceStopId`/
 * `targetStopId`) could reference, but until now it was model-authored with
 * no uniqueness enforcement: `add_stop` could leave a stop with no id at all,
 * and nothing stopped two stops in the same day from colliding. This module
 * is the single place that decides whether a supplied id is usable, and how
 * to mint a server-owned one when it is not.
 *
 * Scope is deliberately day-scoped, not plan-global — the same convention
 * `geoResolutionArtifact` already uses safely (`dayNumber|stopId|name`).
 */

/** A usable id is a non-empty string once trimmed. */
function isValidStopId(id) {
  return typeof id === 'string' && id.trim().length > 0;
}

/** Mint a server-owned id guaranteed not to collide with any id in `existingIds`. */
function nextServerStopId(existingIds = []) {
  const used = new Set(existingIds);
  let n = used.size + 1;
  let candidate = `stop-srv-${n}`;
  while (used.has(candidate)) {
    n += 1;
    candidate = `stop-srv-${n}`;
  }
  return candidate;
}

/**
 * Resolve the id a stop being added to `existingIds` (the OTHER stops
 * already in that same day) should carry: keep a valid, non-colliding
 * model-supplied id; otherwise mint a fresh server-owned one.
 */
function ensureStopId(stop, existingIds = []) {
  const currentId = stop?.id;
  if (isValidStopId(currentId) && !existingIds.includes(currentId)) {
    return currentId;
  }
  return nextServerStopId(existingIds);
}

module.exports = { isValidStopId, nextServerStopId, ensureStopId };
