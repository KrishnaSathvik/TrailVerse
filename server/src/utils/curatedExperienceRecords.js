'use strict';

/**
 * PHASE 9C.1D.5C-C — CURATED OFFICIAL-SOURCE EXPERIENCE RECORDS.
 *
 * 5C-A found that "Mist Trail" does not exist as any evidence identity, so a
 * relationship cannot point at it until a canonical experience record exists.
 * This is the smallest record that can BECOME such an identity:
 *
 *   {
 *     entityId,          // `${contextEntityId}:experience:<slug>` — stable, namespaced
 *     contextEntityId,   // owning destination, e.g. `nps:park:<code>`
 *     canonicalName,     // the official display name
 *     category,          // one small, closed vocabulary value
 *     activityTypes?,    // optional short slugs, same vocabulary evidence already uses
 *     source:      { url, title, publisher, excerpt },
 *     sourceCheck: { checkedAt, httpStatus, finalUrl, excerptFound },
 *   }
 *
 * No aliases and no relationships live here — those are separate, typed,
 * separately reviewed relationship records.
 *
 * WHY A HUMAN REVIEW IS ALSO REQUIRED HERE
 * ---------------------------------------
 * Once emitted, a curated experience is an evidence candidate with a name, and
 * Phase 5B resolves an explicitly named traveler request by EXACT identity. A
 * record promoted on mechanics alone would let agent-authored data create the
 * very identity a named obligation is satisfied by. So the same hash-bound,
 * trusted-reviewer gate applies; tooling still does all of the mechanics.
 */

const crypto = require('crypto');
const {
  DEFAULT_OFFICIAL_SOURCE_HOSTS,
  isStableEntityId,
  validateOfficialSourceProvenance,
  validateHumanReview,
} = require('./experienceRelationships');

const EXPERIENCE_CATEGORIES = Object.freeze(new Set([
  'trail', 'viewpoint', 'waterfall', 'landmark', 'lake', 'geothermal', 'historic', 'place',
]));
const ACTIVITY_TYPE = /^[a-z][a-z0-9_]{1,31}$/;
const NAME_MIN = 3;
const NAME_MAX = 120;

const normId = (value) => String(value == null ? '' : value).trim().toLowerCase();
const normText = (value) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();

function hashableExperience(record = {}) {
  const source = record.source || {};
  return {
    kind: 'experience',
    entityId: normId(record.entityId),
    contextEntityId: normId(record.contextEntityId),
    canonicalName: normText(record.canonicalName),
    category: normId(record.category),
    activityTypes: [...new Set((record.activityTypes || []).map(normId))].sort(),
    source: {
      url: normText(source.url),
      title: normText(source.title),
      publisher: normText(source.publisher),
      excerpt: normText(source.excerpt),
    },
  };
}

function experienceHash(record) {
  const content = hashableExperience(record);
  const ordered = JSON.stringify(content, ['kind', 'entityId', 'contextEntityId', 'canonicalName', 'category', 'activityTypes', 'source', 'url', 'title', 'publisher', 'excerpt']);
  return `sha256:${crypto.createHash('sha256').update(ordered).digest('hex')}`;
}

/** MECHANICS + format only. */
function validateCuratedExperience(record, { officialHosts = DEFAULT_OFFICIAL_SOURCE_HOSTS } = {}) {
  const reasons = [];
  const r = record || {};
  const context = normId(r.contextEntityId);
  const entityId = normId(r.entityId);
  if (!isStableEntityId(context)) reasons.push('invalid_context_entity_id');
  if (!isStableEntityId(entityId)) reasons.push('invalid_experience_entity_id');
  else if (isStableEntityId(context) && !entityId.startsWith(`${context}:experience:`)) {
    reasons.push('experience_entity_outside_context');
  }
  const name = normText(r.canonicalName);
  if (name.length < NAME_MIN || name.length > NAME_MAX || name.includes('@')) reasons.push('invalid_canonical_name');
  if (!EXPERIENCE_CATEGORIES.has(normId(r.category))) reasons.push('unsupported_category');
  if (r.activityTypes !== undefined
    && (!Array.isArray(r.activityTypes) || r.activityTypes.some((t) => !ACTIVITY_TYPE.test(normId(t))))) {
    reasons.push('invalid_activity_types');
  }
  reasons.push(...validateOfficialSourceProvenance(r, { officialHosts }));
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}

/** The only path to an authoritative curated experience. */
function promoteCuratedExperience({
  record, review, trustedReviewerIds = [], officialHosts = DEFAULT_OFFICIAL_SOURCE_HOSTS, now = new Date(),
} = {}) {
  const hash = experienceHash(record);
  const reasons = [
    ...validateCuratedExperience(record, { officialHosts }).reasons,
    ...validateHumanReview(review, record, { trustedReviewerIds, now, expectedHash: hash }),
  ];
  if (reasons.length > 0) return { ok: false, reasons: [...new Set(reasons)] };
  const content = hashableExperience(record);
  return {
    ok: true,
    reasons: [],
    experience: Object.freeze({
      entityId: content.entityId,
      contextEntityId: content.contextEntityId,
      canonicalName: content.canonicalName,
      category: content.category,
      activityTypes: Object.freeze(content.activityTypes),
      source: Object.freeze({ ...content.source }),
      sourceCheck: Object.freeze({
        checkedAt: new Date(record.sourceCheck.checkedAt).toISOString(),
        httpStatus: Number(record.sourceCheck.httpStatus),
        finalUrl: normText(record.sourceCheck.finalUrl),
        excerptFound: true,
      }),
      verification: Object.freeze({
        candidateHash: hash,
        decision: 'approved',
        reviewMethod: 'human',
        reviewerId: normId(review.reviewerId),
        reviewedAt: new Date(review.reviewedAt).toISOString(),
        reviewAfter: new Date(review.reviewAfter).toISOString(),
      }),
    }),
  };
}

const CURATED_EXPERIENCE_PROVIDER = 'curated_experience';

/** Evidence-store representation: an ordinary named place/activity fact. */
function toExperienceEvidence(experience, { observedAt = new Date() } = {}) {
  const e = experience;
  return {
    entityId: e.contextEntityId,
    topic: 'activities',
    evidenceType: 'fact',
    privacyScope: 'public',
    claim: {
      identity: `curated_experience:${e.entityId}`,
      text: `${e.canonicalName}: ${e.source.excerpt}`,
      normalizedValue: {
        entityId: e.entityId,
        destinationId: e.contextEntityId,
        name: e.canonicalName,
        category: e.category,
        activityTypes: [...e.activityTypes],
        authority: 'official_owner',
        sourceUrl: e.source.url,
        source: { ...e.source },
        sourceCheck: { ...e.sourceCheck },
        verification: { ...e.verification },
      },
      unit: null,
      status: null,
      subjectId: e.entityId,
      objectId: null,
      qualifiers: ['named_place_candidate', 'curated_official_source', 'human_reviewed'],
      polarity: 'positive',
    },
    scope: { geographicEntityIds: [e.contextEntityId], audience: 'public', locale: 'en-US' },
    source: {
      provider: CURATED_EXPERIENCE_PROVIDER,
      sourceClass: 'official_owner',
      sourceId: e.verification.candidateHash,
      url: e.source.url,
      title: e.source.title,
    },
    quality: { authorityClass: 'official_owner', scopeMatch: 'exact', conflictStatus: 'none' },
    observedAt: new Date(observedAt).toISOString(),
  };
}

module.exports = {
  EXPERIENCE_CATEGORIES,
  CURATED_EXPERIENCE_PROVIDER,
  experienceHash,
  validateCuratedExperience,
  promoteCuratedExperience,
  toExperienceEvidence,
};
