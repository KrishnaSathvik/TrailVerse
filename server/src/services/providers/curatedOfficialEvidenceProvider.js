'use strict';

/**
 * PHASE 9C.1D.5C-C — CURATED OFFICIAL-SOURCE EVIDENCE PROVIDER.
 *
 * Joins three physically separate inputs (see data/curatedOfficialEvidence):
 *   experiences.json            canonical experience records
 *   relationshipCandidates.json typed relationship proposals
 *   reviews.json                human decisions, bound by candidateHash
 * with the SERVER-owned trusted-reviewer list, through the 5C-B/5C-C gates, and
 * emits only authoritative records as evidence:
 *   curated experience  → `evidenceType: 'fact'` named place/activity candidate
 *   curated relationship→ `evidenceType: 'relationship'` (subjectId/objectId)
 *
 * Pending, rejected, expired, untrusted, malformed, orphaned and conflicting
 * records are counted in `diagnostics()` and never emitted.
 *
 * Provider shape (id/supports/estimateCost/buildRequest/fetch/normalize) so it
 * reads like every other provider. It is NOT registered with the broker: the
 * broker serves a requirement from exactly one provider, and this one
 * SUPPLEMENTS the NPS `activities` resolution instead of replacing it. Static,
 * reviewed, in-process data needs no cache, lease or network; it is merged into
 * the frozen bundle by `curatedEvidenceOverlay`. With no records it is inert.
 */

const fs = require('fs');
const path = require('path');
const { buildEvidenceKeys } = require('../../utils/evidenceKey');
const {
  DEFAULT_OFFICIAL_SOURCE_HOSTS,
  candidateHash,
  buildRelationshipIndex,
  toRelationshipEvidence,
} = require('../../utils/experienceRelationships');
const {
  experienceHash,
  promoteCuratedExperience,
  toExperienceEvidence,
} = require('../../utils/curatedExperienceRecords');
const { getTrustedRelationshipReviewers } = require('../../config/trustedRelationshipReviewers');

const PROVIDER_ID = 'curated_official';
const DEFAULT_DATA_DIR = path.resolve(__dirname, '../../data/curatedOfficialEvidence');
const SCHEMA_VERSION = 1;
const FILES = Object.freeze({
  experiences: ['experiences.json', 'experiences'],
  candidates: ['relationshipCandidates.json', 'candidates'],
  reviews: ['reviews.json', 'reviews'],
});

/**
 * Reads ONLY the named array of each file. Any other top-level key (for example
 * a file trying to declare `trustedReviewers`) is ignored and reported. A
 * missing/malformed file yields no records plus a diagnostic — never authority.
 */
function loadCuratedDataset({ dir = DEFAULT_DATA_DIR, readFile = (p) => fs.readFileSync(p, 'utf8') } = {}) {
  const dataset = { experiences: [], candidates: [], reviews: [] };
  const issues = [];
  for (const [key, [file, arrayKey]] of Object.entries(FILES)) {
    let parsed;
    try {
      parsed = JSON.parse(readFile(path.join(dir, file)));
    } catch (_) {
      issues.push(`${key}:unreadable`);
      continue;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { issues.push(`${key}:invalid_shape`); continue; }
    if (parsed.schemaVersion !== SCHEMA_VERSION) { issues.push(`${key}:unsupported_schema_version`); continue; }
    if (!Array.isArray(parsed[arrayKey])) { issues.push(`${key}:missing_${arrayKey}`); continue; }
    for (const extra of Object.keys(parsed).filter((k) => k !== 'schemaVersion' && k !== arrayKey)) {
      issues.push(`${key}:ignored_field:${extra}`);
    }
    dataset[key] = parsed[arrayKey];
  }
  return { dataset, issues: issues.sort() };
}

/** Decisive review per hash: the latest; at an equal time a non-approval wins (fail closed). */
function reviewsByHash(reviews = []) {
  const map = new Map();
  for (const review of reviews || []) {
    const hash = review?.candidateHash;
    if (typeof hash !== 'string' || !hash) continue;
    const prior = map.get(hash);
    const at = Date.parse(review.reviewedAt) || 0;
    const priorAt = prior ? (Date.parse(prior.reviewedAt) || 0) : -1;
    if (!prior || at > priorAt || (at === priorAt && review.decision !== 'approved')) map.set(hash, review);
  }
  return map;
}

function buildCuratedAuthority({
  dataset = { experiences: [], candidates: [], reviews: [] },
  trustedReviewerIds = [],
  officialHosts = DEFAULT_OFFICIAL_SOURCE_HOSTS,
  now = new Date(),
} = {}) {
  const decisive = reviewsByHash(dataset.reviews);
  const usedHashes = new Set();

  // Experiences.
  const experienceDiag = { authoritative: 0, pending: 0, rejected: 0, conflicts: 0 };
  const promoted = [];
  for (const record of dataset.experiences || []) {
    const hash = experienceHash(record);
    const review = decisive.get(hash) || null;
    if (review) usedHashes.add(hash);
    if (!review || review.decision !== 'approved') { experienceDiag.pending += 1; continue; }
    const out = promoteCuratedExperience({ record, review, trustedReviewerIds, officialHosts, now });
    if (out.ok) promoted.push(out.experience);
    else experienceDiag.rejected += 1;
  }
  const byEntity = new Map();
  for (const experience of promoted) {
    if (!byEntity.has(experience.entityId)) byEntity.set(experience.entityId, []);
    byEntity.get(experience.entityId).push(experience);
  }
  const experiences = [];
  for (const [, list] of [...byEntity.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const distinct = new Set(list.map((e) => e.verification.candidateHash));
    if (distinct.size > 1) { experienceDiag.conflicts += 1; continue; } // two different records claim one identity
    experiences.push(list[0]);
  }
  experienceDiag.authoritative = experiences.length;

  // Relationships.
  const entries = (dataset.candidates || []).map((candidate) => {
    const hash = candidateHash(candidate);
    const review = decisive.get(hash) || null;
    if (review) usedHashes.add(hash);
    return { candidate, review };
  });
  const rel = buildRelationshipIndex({ entries, trustedReviewerIds, officialHosts, now });
  const relationships = rel.index.relationships();

  const orphanReviews = [...decisive.keys()].filter((hash) => !usedHashes.has(hash)).length;

  return Object.freeze({
    experiences: Object.freeze(experiences),
    relationships: Object.freeze(relationships),
    diagnostics: Object.freeze({
      trustedReviewerCount: (trustedReviewerIds || []).length,
      experiences: Object.freeze(experienceDiag),
      relationships: Object.freeze({
        authoritative: relationships.length,
        pending: rel.pending.length,
        rejected: rel.rejected.length,
        conflicts: rel.conflicts.length,
      }),
      orphanReviews,
    }),
  });
}

/** Store-equivalent materialization: deterministic keys, validity bounded by the review window. */
function materialize(item, { validThrough, now }) {
  const keys = buildEvidenceKeys(item);
  const observedAt = new Date(item.observedAt);
  const expiresAt = new Date(validThrough);
  const { observedAt: _observedAt, ...rest } = item;
  return {
    schemaVersion: 1,
    ...rest,
    evidenceId: keys.evidenceId,
    logicalKey: keys.logicalKey,
    canonicalKey: keys.canonicalKey,
    observation: {
      observedAt: observedAt.toISOString(),
      fetchedAt: new Date(now).toISOString(),
      expiresAt: expiresAt.toISOString(),
      staleUntil: expiresAt.toISOString(),
      retrievalMode: 'manual',
    },
    quality: {
      freshnessStatus: 'fresh', corroboratingEvidenceIds: [], conflictingEvidenceIds: [], ...(item.quality || {}),
    },
    provenance: { extractionMethod: 'curated_official_source', extractorVersion: 'curated-official-v1', rawPayloadHash: null, contentHash: keys.contentHash },
    isCurrent: true,
  };
}

function createCuratedOfficialEvidenceProvider({
  dataset = null,
  dataDir = DEFAULT_DATA_DIR,
  trustedReviewerIds = getTrustedRelationshipReviewers(),
  officialHosts = DEFAULT_OFFICIAL_SOURCE_HOSTS,
  now = () => new Date(),
} = {}) {
  const loaded = dataset ? { dataset, issues: [] } : loadCuratedDataset({ dir: dataDir });
  const hasAnyRecord = (loaded.dataset.experiences || []).length + (loaded.dataset.candidates || []).length > 0;
  const trusted = Object.freeze([...(trustedReviewerIds || [])]);

  const authority = () => buildCuratedAuthority({
    dataset: loaded.dataset, trustedReviewerIds: trusted, officialHosts, now: now(),
  });

  function evidenceFor(entityId) {
    if (!hasAnyRecord || !entityId) return [];
    const at = now();
    const current = authority();
    const context = String(entityId).trim().toLowerCase();
    const items = [
      ...current.experiences
        .filter((e) => e.contextEntityId === context)
        .map((e) => materialize(toExperienceEvidence(e, { observedAt: e.verification.reviewedAt }), { validThrough: e.verification.reviewAfter, now: at })),
      ...current.relationships
        .filter((r) => r.contextEntityId === context)
        .map((r) => materialize(toRelationshipEvidence(r, { observedAt: r.verification.reviewedAt }), { validThrough: r.verification.reviewAfter, now: at })),
    ];
    return items.sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));
  }

  return {
    id: PROVIDER_ID,
    hasRecords: () => hasAnyRecord,
    supports(requirement) {
      return requirement?.topic === 'activities' && evidenceFor(requirement?.entity?.entityId).length > 0;
    },
    estimateCost() {
      return { costStatus: 'known', costUsd: 0, providerAttemptLimit: 1 };
    },
    buildRequest(requirement) {
      const entityId = String(requirement?.entity?.entityId || '').toLowerCase();
      return {
        provider: PROVIDER_ID,
        operation: 'activities',
        parameters: { entityId },
        dedupeKey: `${PROVIDER_ID}|activities|${entityId}`,
        publicCanonicalRequest: { provider: PROVIDER_ID, operation: 'activities', entityId },
      };
    },
    async fetch(request) {
      const entityId = request?.parameters?.entityId || null;
      return {
        raw: { entityId },
        metadata: { observedAt: now().toISOString() },
        // Curation is never exhaustive: an empty result proves nothing absent.
        completeness: { isComplete: false, topics: [], emptyMeans: 'unknown' },
        providerAttempts: 1,
      };
    },
    async normalize(raw) {
      return evidenceFor(raw?.entityId);
    },
    evidenceFor,
    diagnostics: () => ({ ...authority().diagnostics, loadIssues: loaded.issues }),
  };
}

module.exports = {
  CURATED_OFFICIAL_PROVIDER_ID: PROVIDER_ID,
  DEFAULT_CURATED_DATA_DIR: DEFAULT_DATA_DIR,
  loadCuratedDataset,
  buildCuratedAuthority,
  createCuratedOfficialEvidenceProvider,
};
