'use strict';

/**
 * Stage 8 — canonical Trailie response envelope.
 *
 * The AI server is the sole authority for the CONTENTS and HASHES of an assistant
 * response. This builder produces one immutable identity per response:
 *
 *   what the user saw = what the server finalized = what gets saved
 *   = what history restores = what share/export receives
 *
 * `content` is always the artifact-stripped processed content (never the raw
 * stream). Hashes use deterministic serialization so object key order and
 * transient fields (createdAt) never affect them. The frontend persists this
 * envelope verbatim; it must not rebuild content or re-strip itineraryData.
 */

const crypto = require('crypto');
const { randomUUID } = crypto;
const { stripItineraryArtifacts } = require('./itineraryArtifacts');

/**
 * Deterministic JSON serialization: object keys sorted recursively, array order
 * preserved (order is semantic for days/stops). Used for content-addressable
 * hashing so insertion order can never change a hash.
 */
function stableStringify(value) {
  // Provider observations may arrive from Mongo as Dates. Hash the same ISO
  // value JSON transports and persistence expose, rather than Date's empty keys.
  if (require('node:util').types.isDate(value)) return stableStringify(value.toJSON());
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

/** sha256 (hex) of a string or of a stable-serialized object. */
function hashPayload(input) {
  const serialized = typeof input === 'string' ? input : stableStringify(input);
  return crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
}

/**
 * @param {Object} params
 * @param {string} [params.responseId]      stable id; generated if absent
 * @param {number} [params.responseVersion] defaults to 1; regeneration increments
 * @param {string} params.processedContent  post-processed prose (pre-strip)
 * @param {string} [params.rawStreamContent] retained for diagnostics only
 * @param {Object|null} [params.itineraryData]
 * @param {Object|null} [params.planScore]
 * @param {string[]} [params.corrections]
 * @param {string[]} [params.feasibilityIssues]
 * @param {string} [params.provider]
 * @param {string} [params.model]
 * @param {Object|null} [params.reviewMeta]
 * @returns {Object} canonical envelope
 */
function buildCanonicalTrailieResponse({
  responseId,
  responseVersion = 1,
  processedContent,
  rawStreamContent = null,
  itineraryData = null,
  planScore = null,
  corrections = [],
  feasibilityIssues = [],
  provider = null,
  model = null,
  reviewMeta = null,
  // ── Stage 14.1 — OPTIONAL intra-turn revision fields ──────────────────────
  // Omitted entirely when not supplied, so an unrevisioned envelope is byte-for-byte
  // what Stage 8 produced and hashes are unaffected (revision fields are never hashed).
  responseRevision = null,
  previousRevision = null,
  lifecycleStatus = null,
  itineraryReadyAt = null,
  proseReadyAt = null,
} = {}) {
  const content = stripItineraryArtifacts(processedContent).content;
  const contentHash = hashPayload(content);
  const itineraryHash = itineraryData ? hashPayload(itineraryData) : null;

  // Only attach revision metadata when the caller opted in. `responseRevision` is
  // the switch: without it the envelope keeps pre-Stage-14 shape exactly.
  const revisionFields = responseRevision == null ? {} : {
    responseRevision,
    previousRevision,
    lifecycleStatus,
    ...(itineraryReadyAt ? { itineraryReadyAt } : {}),
    ...(proseReadyAt ? { proseReadyAt } : {}),
  };

  return {
    responseId: responseId || randomUUID(),
    responseVersion,
    ...revisionFields,

    content,
    contentHash,

    itineraryData: itineraryData || null,
    itineraryHash,

    planScore: planScore || null,
    corrections: corrections || [],
    feasibilityIssues: feasibilityIssues || [],

    provider: provider || null,
    model: model || null,

    reviewMeta: reviewMeta || null,
    createdAt: new Date().toISOString(),

    // Diagnostics only — never hashed, never authoritative.
    rawStreamContentHash: rawStreamContent ? hashPayload(stripItineraryArtifacts(rawStreamContent).content) : null,
  };
}

module.exports = {
  stableStringify,
  hashPayload,
  buildCanonicalTrailieResponse,
};
