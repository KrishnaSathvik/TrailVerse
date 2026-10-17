'use strict';

const {
  evaluateEvidenceContractCompatibility,
  candidateCarriesParsedRule,
  requiredOperationalNormalizationVersionFor,
  operationalNormalizationVersionOf,
} = require('../utils/evidenceContractVersions');

const AUTHORITY_ORDER = Object.freeze([
  'official_owner', 'official_structured', 'official_operator', 'government_partner',
  'trusted_specialist', 'commercial_structured', 'reputable_web', 'listing_only', 'model_prior',
]);

function authoritySatisfies(candidate, minimum) {
  const candidateRank = AUTHORITY_ORDER.indexOf(candidate);
  const minimumRank = AUTHORITY_ORDER.indexOf(minimum);
  return candidateRank >= 0 && minimumRank >= 0 && candidateRank <= minimumRank;
}

function validDate(value) {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function scopeMatches(requirement, candidate) {
  if (candidate.quality?.scopeMatch === 'unknown') return false;
  const entityId = requirement.entity?.entityId;
  if (!candidate.scope?.geographicEntityIds?.includes(entityId)) return false;
  if (requirement.routeScope) {
    const requiredRoute = requirement.routeScope;
    const candidateRoute = candidate.scope?.route;
    if (!candidateRoute
      || candidateRoute.originEntityId !== requiredRoute.origin?.entityId
      || candidateRoute.destinationEntityId !== requiredRoute.destination?.entityId
      || candidateRoute.travelMode !== requiredRoute.travelMode
      || candidateRoute.departureTimeBucket !== requiredRoute.departureTimeBucket) return false;
  }
  const requested = requirement.temporalScope || {};
  const candidateFrom = validDate(candidate.scope?.validFrom);
  const candidateThrough = validDate(candidate.scope?.validThrough);
  if (['date_range', 'season'].includes(requested.mode)) {
    const requestedFrom = validDate(requested.validFrom);
    const requestedThrough = validDate(requested.validThrough);
    if (requestedFrom && (!candidateFrom || candidateFrom > requestedFrom)) return false;
    if (requestedThrough && (!candidateThrough || candidateThrough < requestedThrough)) return false;
  }
  if (['current', 'instant'].includes(requested.mode)) {
    const at = validDate(requested.requestedAt);
    if (at && candidateFrom && candidateFrom > at) return false;
    if (at && candidateThrough && candidateThrough < at) return false;
  }
  return true;
}

function freshness(requirement, candidate, now) {
  const observedAt = validDate(candidate.observation?.observedAt || candidate.observation?.fetchedAt);
  if (!observedAt) return { usable: false, status: 'expired', ageMs: null };
  const ageMs = Math.max(0, now.getTime() - observedAt.getTime());
  const freshMs = Math.max(0, Number(requirement.maxAgeSeconds) || 0) * 1000;
  const staleMs = Math.max(0, Number(requirement.maxStaleSeconds) || 0) * 1000;
  if (ageMs <= freshMs) return { usable: true, status: 'fresh', ageMs };
  if (requirement.criticality !== 'hard' && staleMs > 0 && ageMs <= freshMs + staleMs) {
    return { usable: true, status: 'stale_safe', ageMs };
  }
  return { usable: false, status: 'expired', ageMs };
}

const SUPPLEMENTARY_EVIDENCE_TYPES = Object.freeze({
  activities: Object.freeze(new Set(['relationship'])),
});

function evaluateRequirementCoverage(requirement, candidates = [], { now = new Date() } = {}) {
  const at = validDate(now);
  if (!requirement?.requirementId || !at) throw new TypeError('Coverage evaluation requires a requirement and valid now');
  const summary = {
    examined: 0, usable: 0, expired: 0, wrongScope: 0, wrongTopic: 0, wrongType: 0,
    insufficientAuthority: 0, conflicted: 0, privacyRejected: 0, schemaMismatch: 0,
  };
  const reasons = new Set();
  // Semantic-cache observability: which normalization contract the stored rows
  // were written under, versus the one current code reads them with.
  const normalization = {
    expectedVersion: null, observed: new Set(), mismatchedCandidates: 0, accepted: false,
  };
  const selected = [];
  const selectedFreshness = [];
  const ages = [];

  for (const candidate of candidates) {
    summary.examined += 1;
    if (candidate.topic !== requirement.topic) {
      summary.wrongTopic += 1; reasons.add('candidate_wrong_topic'); continue;
    }
    if (!scopeMatches(requirement, candidate)) {
      summary.wrongScope += 1; reasons.add('candidate_wrong_scope'); continue;
    }
    if (!requirement.evidenceTypes?.includes(candidate.evidenceType)) {
      summary.wrongType += 1; reasons.add('candidate_wrong_evidence_type'); continue;
    }
    // Freshness alone is insufficient: incompatible extractor/schema contracts
    // (e.g. NPS activities taxonomy-v1 vs named-activities-v2) are cache misses.
    const requiredNormalization = requiredOperationalNormalizationVersionFor({
      provider: candidate.source?.provider, topic: candidate.topic,
    });
    if (requiredNormalization) {
      normalization.expectedVersion = requiredNormalization;
      normalization.observed.add(operationalNormalizationVersionOf(candidate) || 'legacy_unstamped');
    }
    const contract = evaluateEvidenceContractCompatibility(candidate, { topic: requirement.topic });
    if (!contract.ok) {
      summary.schemaMismatch += 1;
      if (contract.reasonCode === 'candidate_operational_normalization_version_mismatch') {
        normalization.mismatchedCandidates += 1;
      }
      reasons.add(contract.reasonCode || 'candidate_schema_version_mismatch');
      continue;
    }
    if (requiredNormalization) normalization.accepted = true;
    // P0-5 — parsed-rule content contract. An official-authority requirement
    // for a dimension topic is satisfied only by the PARSED RULE: a fresh,
    // authoritative reservations page says nothing about a 21-ft limit, and
    // accepting it froze the topic "satisfied" without the fact existing.
    // Discovery passes (reputable_web floor) are exempt — search snippets
    // exist to be followed, not to carry facts.
    if (requirement.minimumAuthorityClass !== 'reputable_web'
      && !candidateCarriesParsedRule(candidate, requirement.topic)) {
      summary.schemaMismatch += 1;
      reasons.add('candidate_missing_parsed_rule');
      continue;
    }
    const authority = candidate.quality?.authorityClass || candidate.source?.sourceClass;
    if (!authoritySatisfies(authority, requirement.minimumAuthorityClass)) {
      summary.insufficientAuthority += 1; reasons.add('candidate_insufficient_authority'); continue;
    }
    if (requirement.acceptedSourceClasses?.length
      && !requirement.acceptedSourceClasses.some((accepted) => authoritySatisfies(authority, accepted))) {
      summary.insufficientAuthority += 1; reasons.add('candidate_insufficient_authority'); continue;
    }
    if (candidate.quality?.conflictStatus && candidate.quality.conflictStatus !== 'none') {
      summary.conflicted += 1; reasons.add('candidate_conflicted'); continue;
    }
    if (candidate.claim?.polarity === 'negative'
      && (requirement.absenceSemantics !== 'proves_absent'
        || candidate.absenceProof?.providerDeclaredComplete !== true)) {
      reasons.add('absence_not_proven'); continue;
    }
    const candidateFreshness = freshness(requirement, candidate, at);
    if (!candidateFreshness.usable) {
      summary.expired += 1; reasons.add('candidate_expired'); continue;
    }
    summary.usable += 1;
    selected.push(candidate);
    selectedFreshness.push(candidateFreshness.status);
    ages.push(candidateFreshness.ageMs);
  }

  // Phase 9C.1D.5C-C — SUPPLEMENTARY evidence types may accompany a topic's
  // primary evidence but can never satisfy it alone: a curated relationship
  // says how two places relate, not that the activities requirement is met.
  // Relationship-only results are dropped, leaving the pre-5C-C outcome intact.
  const supplementary = SUPPLEMENTARY_EVIDENCE_TYPES[requirement.topic];
  if (supplementary && selected.length > 0 && selected.every((item) => supplementary.has(item.evidenceType))) {
    selected.length = 0;
    selectedFreshness.length = 0;
    ages.length = 0;
  }

  const hasStale = selectedFreshness.includes('stale_safe');
  const hasPartial = selected.some((item) => item.quality?.scopeMatch === 'partial');
  const status = selected.length === 0
    ? summary.conflicted > 0 ? 'conflicted' : 'missing'
    : hasPartial ? 'satisfied_partial'
      : hasStale ? 'satisfied_stale_safe' : 'satisfied_fresh';
  return {
    requirementId: requirement.requirementId,
    status,
    evidenceIds: selected.map((item) => item.evidenceId).sort(),
    reasonCodes: selected.length > 0 ? [] : [...reasons].sort(),
    candidateSummary: summary,
    refresh: { needed: status !== 'satisfied_fresh', refreshKeyHash: null, outcome: status === 'satisfied_fresh' ? 'cache_hit' : 'not_needed', reasonCode: null },
    cacheStatus: status === 'satisfied_fresh' ? 'fresh_hit' : status === 'satisfied_stale_safe' ? 'stale_safe_hit' : 'miss',
    normalizationContract: normalization.expectedVersion ? {
      expectedVersion: normalization.expectedVersion,
      observedVersions: [...normalization.observed].sort(),
      // Filled in by the broker when a refresh replaces obsolete semantics, so
      // the version that was actually in cache survives past the rewrite.
      supersededVersions: [],
      mismatchedCandidates: normalization.mismatchedCandidates,
      accepted: normalization.accepted,
      renormalized: false,
    } : null,
    maxEvidenceAgeMs: ages.length ? Math.max(...ages) : null,
    authorityClasses: [...new Set(selected.map((item) => item.quality?.authorityClass || item.source?.sourceClass))].sort(),
    providersUsed: [...new Set(selected.map((item) => item.source?.provider).filter(Boolean))].sort(),
    conflictStatus: summary.conflicted > 0 ? 'open' : 'none',
    latencyMs: null,
    selectedEvidence: selected,
  };
}

module.exports = {
  AUTHORITY_ORDER,
  evaluateRequirementCoverage,
};
