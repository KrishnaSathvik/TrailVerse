'use strict';

/**
 * Stage 9 — immutable shadow-review snapshot.
 *
 * Built while the generation context and the REAL canonical facts fetched during
 * generation are still in scope. The worker reviews this snapshot later and MUST
 * NOT refetch NPS/weather data or reconstruct facts. The snapshot is therefore
 * the single source of truth for what the reviewer sees.
 *
 * It contains only what the worker needs, and by construction excludes:
 *   - conversation history
 *   - user email / profile / auth data
 *   - the full system prompt or raw model prompt
 *   - provider keys
 *   - any unrelated user history
 */

const { hashPayload } = require('./canonicalResponse');
const { projectFactForReviewer, measureParkIdentityCoverage } = require('../services/trailieReviewPipeline');

const SNAPSHOT_VERSION = 'v1';

/** Only structural/scope-relevant constraint fields — never freeform user text. */
function projectConstraints(constraints) {
  if (!constraints || typeof constraints !== 'object') return null;
  return {
    hasConstraints: Boolean(constraints.hasConstraints),
    fitnessLevel: constraints.fitnessLevel || null,
    hasChildren: Boolean(constraints.hasChildren),
    maxDriveTimeMin: Number.isFinite(constraints.maxDriveTimeMin)
      ? constraints.maxDriveTimeMin
      : null,
    avoidStrenuous: Boolean(constraints.avoidStrenuous),
    accessibilityRequired: Boolean(constraints.accessibilityRequired),
  };
}

/** Public park-identity metadata only. No user identifiers. */
function projectResolvedMetadata(resolvedMetadata) {
  if (!resolvedMetadata || typeof resolvedMetadata !== 'object') return {};
  return {
    parkCode: resolvedMetadata.parkCode || null,
    parkName: resolvedMetadata.parkName || null,
    parkNames: Array.isArray(resolvedMetadata.parkNames) ? [...resolvedMetadata.parkNames] : [],
    localDate: resolvedMetadata.localDate || null,
    state: resolvedMetadata.state || null,
  };
}

/**
 * @param {Object} params
 * @param {Object} params.envelope        canonical response envelope (Stage 8)
 * @param {Object} params.canonicalFactBundle the EXACT bundle used at generation
 * @param {string|null} params.canonicalFactStatus
 * @param {Object|null} params.constraints
 * @param {Object} params.resolvedMetadata
 * @returns {Object} immutable snapshot payload
 */
function buildTrailieReviewSnapshot({
  envelope,
  canonicalFactBundle = { facts: [] },
  canonicalFactStatus = null,
  constraints = null,
  resolvedMetadata = {},
} = {}) {
  if (!envelope || !envelope.responseId) {
    throw new Error('buildTrailieReviewSnapshot requires a canonical envelope with responseId');
  }

  const facts = (canonicalFactBundle?.facts || []).map(projectFactForReviewer);

  return {
    snapshotVersion: SNAPSHOT_VERSION,

    canonicalResponse: {
      responseId: envelope.responseId,
      responseVersion: envelope.responseVersion,
      content: envelope.content,
      contentHash: envelope.contentHash,
      itineraryData: envelope.itineraryData || null,
      itineraryHash: envelope.itineraryHash || null,
    },

    canonicalFactStatus,
    canonicalFacts: facts,

    structuredConstraints: projectConstraints(constraints),
    resolvedMetadata: projectResolvedMetadata(resolvedMetadata),
    parkIdentityCoverage: measureParkIdentityCoverage(envelope.itineraryData || null),
  };
}

/**
 * Recompute the response's hashes from the snapshot's stored content/itinerary.
 * The worker uses this to prove the snapshot has not drifted from the identity
 * recorded on the job before spending any provider call.
 */
function recomputeSnapshotHashes(snapshot) {
  const cr = snapshot?.canonicalResponse || {};
  return {
    contentHash: typeof cr.content === 'string' ? hashPayload(cr.content) : null,
    itineraryHash: cr.itineraryData ? hashPayload(cr.itineraryData) : null,
  };
}

module.exports = {
  SNAPSHOT_VERSION,
  projectConstraints,
  projectResolvedMetadata,
  buildTrailieReviewSnapshot,
  recomputeSnapshotHashes,
};
