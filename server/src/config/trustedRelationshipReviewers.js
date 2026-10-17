'use strict';

/**
 * Phase 9C.1D.5C-C — the server-owned list of reviewers whose approval makes a
 * curated official-source record authoritative.
 *
 * Trust comes ONLY from here (environment/config). Curated data files may name
 * a `reviewerId`, but nothing in them can make that id trusted. No default: an
 * absent or empty setting trusts nobody, so nothing curated is authoritative.
 *
 *   TRAILIE_TRUSTED_RELATIONSHIP_REVIEWERS=maintainer:primary
 *   TRAILIE_TRUSTED_RELATIONSHIP_REVIEWERS="maintainer:primary, maintainer:parks-editor-1"
 *
 * Ids are opaque `namespace:name` handles, never emails (shared evidence may
 * not carry email-like values).
 */

const ENV_KEY = 'TRAILIE_TRUSTED_RELATIONSHIP_REVIEWERS';
const REVIEWER_ID = /^[a-z0-9_-]+:[a-z0-9._-]+$/;

/** @returns {{ reviewerIds: string[], rejected: string[] }} deterministic, deduplicated, sorted */
function parseTrustedRelationshipReviewers(raw) {
  const tokens = String(raw == null ? '' : raw).split(/[\s,]+/).map((t) => t.trim()).filter(Boolean);
  const valid = new Set();
  const rejected = new Set();
  for (const token of tokens) {
    const id = token.toLowerCase();
    if (REVIEWER_ID.test(id) && !id.includes('@')) valid.add(id);
    else rejected.add(token);
  }
  return {
    reviewerIds: Object.freeze([...valid].sort()),
    rejected: Object.freeze([...rejected].sort()),
  };
}

function getTrustedRelationshipReviewers(env = process.env) {
  return parseTrustedRelationshipReviewers(env?.[ENV_KEY]).reviewerIds;
}

module.exports = {
  TRUSTED_RELATIONSHIP_REVIEWERS_ENV_KEY: ENV_KEY,
  parseTrustedRelationshipReviewers,
  getTrustedRelationshipReviewers,
};
