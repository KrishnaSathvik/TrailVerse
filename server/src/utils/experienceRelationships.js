'use strict';

/**
 * PHASE 9C.1D.5C-B — AUTHORITATIVE EXPERIENCE-RELATIONSHIP CONTRACT.
 *
 * WHY
 * ---
 * Phase 9C.1D.5B made an explicitly named traveler experience resolve to
 * evidence identity and refuse silent substitution. The Mist Trail case then
 * showed the identity gaps are RELATIONSHIPS, and that they are not all the
 * same relationship: "Mist and John Muir Trailhead" is an access point serving
 * two trails, and Vernal Fall is a feature on one. Calling either an alias
 * would equate a trailhead or a waterfall with a trail and destroy the 5B
 * guarantee. So the vocabulary is typed, and only one type is an identity.
 *
 *   same_as           two records for one canonical experience/place  → may satisfy
 *   access_point_for  subject is an entry/trailhead for the object    → never satisfies the object
 *   part_of           subject is a component/feature of the object    → never satisfies the object
 *
 * AUTHORITY
 * ---------
 * Tooling or an agent may PROPOSE a relationship and may verify its mechanics
 * (official https host, reachable page, excerpt present, provenance fields).
 * None of that makes it true. A relationship is authoritative only when a
 * REVIEW record approves it, where the review:
 *   - is bound to the exact candidate content by `candidateHash`,
 *   - has `reviewMethod: 'human'` and `decision: 'approved'`,
 *   - is signed by a reviewer id in a SERVER-SUPPLIED trusted list.
 * A payload field such as `verifiedBy: 'human'` is never read. Stored
 * relationship evidence is re-validated on every read, so an edited type, an
 * untrusted reviewer, or an expired review stops being authoritative.
 *
 * STORAGE
 * -------
 * One identity authority: the existing evidence store, using its native
 * `evidenceType: 'relationship'` claims with `subjectId`/`objectId` — the form
 * RIDB already uses. Ids are STABLE canonical entity ids, never version-specific
 * evidence ids. `TrailieEntity.aliases`/`parentEntityId` stay dormant.
 *
 * TRAVERSAL
 * ---------
 * V1 equivalence is DIRECT only: X is equivalent to X and to anything with one
 * authoritative `same_as` edge to X. No transitivity, so no graph search and no
 * cycle can widen what satisfies a named obligation.
 */

const crypto = require('crypto');

const RELATIONSHIP_TYPES = Object.freeze({
  SAME_AS: 'same_as',
  ACCESS_POINT_FOR: 'access_point_for',
  PART_OF: 'part_of',
});
const SUPPORTED = new Set(Object.values(RELATIONSHIP_TYPES));
/** The ONLY relationship that can satisfy a named-experience obligation. */
const SATISFYING_RELATIONSHIPS = Object.freeze(new Set([RELATIONSHIP_TYPES.SAME_AS]));

/** Official source hosts (exact host or subdomain). Extended deliberately, never by payload. */
const DEFAULT_OFFICIAL_SOURCE_HOSTS = Object.freeze(['nps.gov']);

const EXCERPT_MIN_CHARS = 12;
const EXCERPT_MAX_CHARS = 400;
const MAX_REVIEW_WINDOW_MS = 730 * 24 * 3600 * 1000;

/** Namespaced stable id: at least two segments, e.g. `nps:park:yose:place:abc`. */
const STABLE_ENTITY_ID = /^[a-z0-9_-]+(?::[a-z0-9._-]+)+$/;
/** Version-specific store keys — never a relationship endpoint. */
const VERSION_KEY_PREFIX = /^(?:ev|evk|lek):/;
const EMAIL_LIKE = /@/;

const normId = (value) => String(value == null ? '' : value).trim().toLowerCase();
const normText = (value) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();

function parseDate(value) {
  if (value == null || value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isStableEntityId(id) {
  return STABLE_ENTITY_ID.test(id) && !VERSION_KEY_PREFIX.test(id);
}

function parseHttpsUrl(value) {
  try { return new URL(String(value || '')); } catch (_) { return null; }
}

function hostAllowed(hostname, officialHosts) {
  const host = String(hostname || '').toLowerCase();
  return (officialHosts || []).some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

/** The semantic claim + provenance a reviewer approves. Tooling metadata is not part of it. */
function hashableContent(candidate = {}) {
  const source = candidate.source || {};
  return {
    subjectEntityId: normId(candidate.subjectEntityId),
    relationship: normId(candidate.relationship),
    objectEntityId: normId(candidate.objectEntityId),
    contextEntityId: normId(candidate.contextEntityId),
    source: {
      url: normText(source.url),
      title: normText(source.title),
      publisher: normText(source.publisher),
      excerpt: normText(source.excerpt),
    },
  };
}

function candidateHash(candidate) {
  const content = hashableContent(candidate);
  const stable = JSON.stringify(content, Object.keys(content).sort().concat(['url', 'title', 'publisher', 'excerpt']));
  return `sha256:${crypto.createHash('sha256').update(stable).digest('hex')}`;
}

/**
 * Official-source MECHANICS shared by every curated record kind (relationships
 * here, curated experiences in curatedExperienceRecords): allowlisted https
 * source and final URL, reachable page, excerpt found on it, provenance fields.
 */
function validateOfficialSourceProvenance({ source: rawSource, sourceCheck } = {}, { officialHosts = DEFAULT_OFFICIAL_SOURCE_HOSTS } = {}) {
  const reasons = [];
  const source = rawSource || {};
  const url = parseHttpsUrl(source.url);
  if (!url) reasons.push('invalid_source_url');
  else {
    if (url.protocol !== 'https:') reasons.push('source_not_https');
    if (!hostAllowed(url.hostname, officialHosts)) reasons.push('source_host_not_allowlisted');
  }
  if (!normText(source.title)) reasons.push('missing_source_title');
  if (!normText(source.publisher)) reasons.push('missing_source_publisher');
  const excerpt = normText(source.excerpt);
  if (excerpt.length < EXCERPT_MIN_CHARS || excerpt.length > EXCERPT_MAX_CHARS) reasons.push('invalid_source_excerpt');

  const check = sourceCheck || {};
  const checkedAt = parseDate(check.checkedAt);
  if (!checkedAt) reasons.push('missing_source_check');
  const status = Number(check.httpStatus);
  if (!(status >= 200 && status < 300)) reasons.push('source_not_reachable');
  const finalUrl = parseHttpsUrl(check.finalUrl);
  if (!finalUrl || finalUrl.protocol !== 'https:' || !hostAllowed(finalUrl.hostname, officialHosts)) {
    reasons.push('source_final_url_not_allowlisted');
  }
  if (check.excerptFound !== true) reasons.push('excerpt_not_verified_on_source');
  return reasons;
}

/** MECHANICS ONLY. Passing this proves nothing about whether the relationship is true. */
function validateRelationshipCandidate(candidate, { officialHosts = DEFAULT_OFFICIAL_SOURCE_HOSTS } = {}) {
  const reasons = [];
  const c = candidate || {};
  const subject = normId(c.subjectEntityId);
  const object = normId(c.objectEntityId);
  const context = normId(c.contextEntityId);

  if (!SUPPORTED.has(normId(c.relationship))) reasons.push('unsupported_relationship');
  if (!isStableEntityId(subject)) reasons.push('invalid_subject_entity_id');
  if (!isStableEntityId(object)) reasons.push('invalid_object_entity_id');
  if (!isStableEntityId(context)) reasons.push('invalid_context_entity_id');
  if (subject && subject === object) reasons.push('self_relationship');
  if (isStableEntityId(context)) {
    if (isStableEntityId(subject) && !subject.startsWith(`${context}:`)) reasons.push('subject_outside_context');
    if (isStableEntityId(object) && !object.startsWith(`${context}:`)) reasons.push('object_outside_context');
  }
  reasons.push(...validateOfficialSourceProvenance(c, { officialHosts }));
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}

/**
 * @param {object} [options.expectedHash] the content hash the review must be bound
 *   to; defaults to the relationship candidate hash. Curated experience records
 *   pass their own hash so the SAME gate governs every curated record kind.
 */
function validateHumanReview(review, candidate, { trustedReviewerIds = [], now = new Date(), expectedHash = null } = {}) {
  if (!review || typeof review !== 'object') return ['missing_human_review'];
  const reasons = [];
  const trusted = new Set((trustedReviewerIds || []).map(normId).filter((id) => id && !EMAIL_LIKE.test(id)));
  if (review.decision !== 'approved') reasons.push('review_not_approved');
  if (review.reviewMethod !== 'human') reasons.push('review_not_human');
  const reviewer = normId(review.reviewerId);
  if (!reviewer || EMAIL_LIKE.test(reviewer) || !trusted.has(reviewer)) reasons.push('reviewer_not_trusted');
  if (review.candidateHash !== (expectedHash || candidateHash(candidate))) reasons.push('review_hash_mismatch');

  const reviewedAt = parseDate(review.reviewedAt);
  const reviewAfter = parseDate(review.reviewAfter);
  const checkedAt = parseDate(candidate?.sourceCheck?.checkedAt);
  const at = parseDate(now) || new Date();
  if (!reviewedAt) reasons.push('missing_reviewed_at');
  if (!reviewAfter) reasons.push('missing_review_after');
  if (reviewedAt && checkedAt && reviewedAt < checkedAt) reasons.push('review_predates_source_check');
  if (reviewedAt && reviewedAt > at) reasons.push('review_in_future');
  if (reviewedAt && reviewAfter) {
    if (reviewAfter <= reviewedAt) reasons.push('invalid_review_window');
    else if (reviewAfter.getTime() - reviewedAt.getTime() > MAX_REVIEW_WINDOW_MS) reasons.push('review_window_too_long');
  }
  if (reviewAfter && at >= reviewAfter) reasons.push('review_expired');
  return reasons;
}

/**
 * The ONLY path to an authoritative relationship.
 * @returns {{ok:boolean, relationship?:object, reasons:string[]}}
 */
function promoteToAuthoritative({
  candidate, review, trustedReviewerIds = [], officialHosts = DEFAULT_OFFICIAL_SOURCE_HOSTS, now = new Date(),
} = {}) {
  const mechanics = validateRelationshipCandidate(candidate, { officialHosts });
  const reasons = [...mechanics.reasons, ...validateHumanReview(review, candidate, { trustedReviewerIds, now })];
  if (reasons.length > 0) return { ok: false, reasons: [...new Set(reasons)] };
  const content = hashableContent(candidate);
  const relationship = Object.freeze({
    subjectEntityId: content.subjectEntityId,
    relationship: content.relationship,
    objectEntityId: content.objectEntityId,
    contextEntityId: content.contextEntityId,
    source: Object.freeze({ ...content.source }),
    sourceCheck: Object.freeze({
      checkedAt: parseDate(candidate.sourceCheck.checkedAt).toISOString(),
      httpStatus: Number(candidate.sourceCheck.httpStatus),
      finalUrl: normText(candidate.sourceCheck.finalUrl),
      excerptFound: true,
    }),
    verification: Object.freeze({
      candidateHash: review.candidateHash,
      decision: 'approved',
      reviewMethod: 'human',
      reviewerId: normId(review.reviewerId),
      reviewedAt: parseDate(review.reviewedAt).toISOString(),
      reviewAfter: parseDate(review.reviewAfter).toISOString(),
    }),
  });
  return { ok: true, relationship, reasons: [] };
}

/** One canonical descriptor per fact: same_as is undirected, the others are directed. */
function descriptorOf(rel) {
  if (rel.relationship === RELATIONSHIP_TYPES.SAME_AS) {
    const [a, b] = [rel.subjectEntityId, rel.objectEntityId].sort();
    return `same_as:${a}<->${b}`;
  }
  return `${rel.relationship}:${rel.subjectEntityId}->${rel.objectEntityId}`;
}
const pairOf = (rel) => [rel.subjectEntityId, rel.objectEntityId].sort().join('|');

function compareForDedupe(a, b) {
  return a.verification.reviewedAt.localeCompare(b.verification.reviewedAt)
    || a.source.url.localeCompare(b.source.url)
    || a.verification.candidateHash.localeCompare(b.verification.candidateHash);
}

/**
 * @param {{entries: Array<{candidate, review}>}} params
 * @returns {{index, rejected, pending, conflicts}}
 *   pending   — no review, or a review whose decision is not 'approved'
 *   rejected  — approved but failing mechanics/provenance/trust (with reasons)
 *   conflicts — pairs with contradictory authoritative facts; ALL dropped (fail closed)
 */
function buildRelationshipIndex({
  entries = [], trustedReviewerIds = [], officialHosts = DEFAULT_OFFICIAL_SOURCE_HOSTS, now = new Date(),
} = {}) {
  const pending = [];
  const rejected = [];
  const accepted = [];
  for (const entry of entries || []) {
    const review = entry?.review;
    if (!review || review.decision !== 'approved') {
      pending.push({ candidate: entry?.candidate || null, reason: review ? 'review_not_approved' : 'missing_human_review' });
      continue;
    }
    const out = promoteToAuthoritative({
      candidate: entry.candidate, review, trustedReviewerIds, officialHosts, now,
    });
    if (out.ok) accepted.push(out.relationship);
    else rejected.push({ candidate: entry.candidate, reasons: out.reasons });
  }

  const { index, conflicts } = indexAuthoritativeRelationships(accepted);
  return { index, rejected, pending, conflicts };
}

/**
 * Dedupe, conflict-drop and index relationships that ALREADY passed the
 * authority gate. Shared by the curated-provider path and the frozen-bundle
 * path so both apply identical equivalence semantics.
 */
function indexAuthoritativeRelationships(accepted = []) {
  // Duplicates: one deterministic record per descriptor.
  const byDescriptor = new Map();
  for (const rel of accepted) {
    const key = descriptorOf(rel);
    const prior = byDescriptor.get(key);
    if (!prior || compareForDedupe(rel, prior) < 0) byDescriptor.set(key, rel);
  }

  // Conflicts: more than one distinct fact about the same pair → drop them all.
  const byPair = new Map();
  for (const [key, rel] of byDescriptor) {
    const pair = pairOf(rel);
    if (!byPair.has(pair)) byPair.set(pair, []);
    byPair.get(pair).push({ key, rel });
  }
  const conflicts = [];
  const facts = [];
  for (const [pair, list] of [...byPair.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (list.length > 1) {
      conflicts.push({ pair: pair.split('|'), descriptors: list.map((item) => item.key).sort() });
      continue;
    }
    facts.push(list[0].rel);
  }
  facts.sort((a, b) => descriptorOf(a).localeCompare(descriptorOf(b)));
  const frozenFacts = Object.freeze(facts);

  const equivalents = new Map();
  const addEquivalent = (from, to) => {
    if (!equivalents.has(from)) equivalents.set(from, new Set());
    equivalents.get(from).add(to);
  };
  for (const rel of frozenFacts) {
    if (rel.relationship !== RELATIONSHIP_TYPES.SAME_AS) continue;
    addEquivalent(rel.subjectEntityId, rel.objectEntityId);
    addEquivalent(rel.objectEntityId, rel.subjectEntityId);
  }

  const index = Object.freeze({
    relationships: () => [...frozenFacts],
    /** The entity itself plus its DIRECT authoritative same_as neighbours. */
    equivalentIdentities(entityId) {
      const id = normId(entityId);
      if (!id) return [];
      return [...new Set([id, ...(equivalents.get(id) || [])])].sort();
    },
    /** A named obligation for `requiredEntityId` is satisfied by exact identity or direct same_as only. */
    satisfiesNamedRequirement({ requiredEntityId, candidateEntityId } = {}) {
      const required = normId(requiredEntityId);
      const candidateId = normId(candidateEntityId);
      if (!required || !candidateId) return false;
      if (required === candidateId) return true;
      return Boolean(equivalents.get(required)?.has(candidateId));
    },
    /** Planning context. Never equivalence, never satisfaction. */
    contextFor(entityId) {
      const id = normId(entityId);
      const pick = (type, side, match) => frozenFacts
        .filter((rel) => rel.relationship === type && rel[match] === id)
        .map((rel) => rel[side]).sort();
      return {
        accessPoints: pick(RELATIONSHIP_TYPES.ACCESS_POINT_FOR, 'subjectEntityId', 'objectEntityId'),
        parts: pick(RELATIONSHIP_TYPES.PART_OF, 'subjectEntityId', 'objectEntityId'),
        partOf: pick(RELATIONSHIP_TYPES.PART_OF, 'objectEntityId', 'subjectEntityId'),
        accessPointFor: pick(RELATIONSHIP_TYPES.ACCESS_POINT_FOR, 'objectEntityId', 'subjectEntityId'),
      };
    },
  });

  return { index, conflicts };
}

const CURATED_RELATIONSHIP_PROVIDER = 'curated_relationship';

/** Evidence-store representation (existing `relationship` claim model). */
function toRelationshipEvidence(relationship, { observedAt = new Date() } = {}) {
  const rel = relationship;
  const identity = descriptorOf(rel);
  return {
    entityId: rel.contextEntityId,
    topic: 'activities',
    evidenceType: 'relationship',
    privacyScope: 'public',
    claim: {
      identity: `relationship:${identity}`,
      text: rel.source.excerpt,
      normalizedValue: {
        relationship: rel.relationship,
        contextEntityId: rel.contextEntityId,
        source: { ...rel.source },
        sourceCheck: { ...rel.sourceCheck },
        verification: { ...rel.verification },
      },
      unit: null,
      status: null,
      subjectId: rel.subjectEntityId,
      objectId: rel.objectEntityId,
      qualifiers: ['curated_official_source', 'human_reviewed'],
      polarity: 'positive',
    },
    scope: { geographicEntityIds: [rel.contextEntityId], audience: 'public', locale: 'en-US' },
    source: {
      provider: CURATED_RELATIONSHIP_PROVIDER,
      sourceClass: 'official_owner',
      sourceId: rel.verification.candidateHash,
      url: rel.source.url,
      title: rel.source.title,
    },
    quality: { authorityClass: 'official_owner', scopeMatch: 'exact', conflictStatus: 'none' },
    observedAt: (parseDate(observedAt) || new Date()).toISOString(),
  };
}

/**
 * Read path. Rebuilds candidate + review from the stored claim and re-runs the
 * full gate against the CURRENT trusted reviewers and clock. Null unless
 * authoritative right now.
 */
function fromRelationshipEvidence(item, { trustedReviewerIds = [], officialHosts = DEFAULT_OFFICIAL_SOURCE_HOSTS, now = new Date() } = {}) {
  if (item?.evidenceType !== 'relationship' || item?.source?.provider !== CURATED_RELATIONSHIP_PROVIDER) return null;
  const claim = item.claim || {};
  const value = claim.normalizedValue || {};
  const candidate = {
    subjectEntityId: claim.subjectId,
    relationship: value.relationship,
    objectEntityId: claim.objectId,
    contextEntityId: value.contextEntityId,
    source: value.source,
    sourceCheck: value.sourceCheck,
  };
  const out = promoteToAuthoritative({
    candidate, review: value.verification, trustedReviewerIds, officialHosts, now,
  });
  return out.ok ? out.relationship : null;
}

/**
 * Phase 9C.1D.5C-D — the TURN's relationship authority, rebuilt from the frozen
 * bundle. Every curated relationship item is re-validated against the CURRENT
 * trusted reviewers and clock; anything no longer authoritative contributes
 * nothing. Never consults provider memory or data files.
 *
 * @returns {{index, conflicts, nonAuthoritative:number}}
 */
function buildRelationshipIndexFromEvidence({
  evidence = [], trustedReviewerIds = [], officialHosts = DEFAULT_OFFICIAL_SOURCE_HOSTS, now = new Date(),
} = {}) {
  const accepted = [];
  let nonAuthoritative = 0;
  for (const item of evidence || []) {
    if (item?.evidenceType !== 'relationship' || item?.source?.provider !== CURATED_RELATIONSHIP_PROVIDER) continue;
    const relationship = fromRelationshipEvidence(item, { trustedReviewerIds, officialHosts, now });
    if (relationship) accepted.push(relationship);
    else nonAuthoritative += 1;
  }
  const { index, conflicts } = indexAuthoritativeRelationships(accepted);
  return { index, conflicts, nonAuthoritative };
}

module.exports = {
  buildRelationshipIndexFromEvidence,
  RELATIONSHIP_TYPES,
  SATISFYING_RELATIONSHIPS,
  DEFAULT_OFFICIAL_SOURCE_HOSTS,
  isStableEntityId,
  validateOfficialSourceProvenance,
  CURATED_RELATIONSHIP_PROVIDER,
  candidateHash,
  validateRelationshipCandidate,
  validateHumanReview,
  promoteToAuthoritative,
  buildRelationshipIndex,
  toRelationshipEvidence,
  fromRelationshipEvidence,
};
