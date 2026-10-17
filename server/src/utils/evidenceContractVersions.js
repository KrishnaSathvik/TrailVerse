'use strict';

const { jointScopeFor } = require('./npsJointUnitActivityScope');

/**
 * Material evidence-contract versions keyed by provider + topic.
 *
 * Freshness alone is not enough: a chronologically fresh row whose
 * extractorVersion predates the current contract must be treated as a miss
 * so the broker refreshes. Unlisted provider/topic pairs have no extra
 * contract gate (freshness + scope + authority still apply).
 *
 * NPS activities-v1 = park-profile taxonomy labels
 * NPS activities-v2 = named thingstodo + places with suitability metadata
 * NPS activities-v3 = places listingDescription/bodyText read as official
 *   text (exposure hazards + survey mileage projected from places corpus)
 * NPS activities-v4 = activity types inferred from the same official text
 *   (v3 left type inference on name-only fields, so the places corpus was
 *   typeless: EXPERIENCE_CLASS.UNKNOWN everywhere, empty repair catalogues,
 *   and "Trailhead" candidates invisible to the exposure directive)
 * NPS activities-v5 = walking-distance ownership: a mile figure becomes
 *   walkingDistanceMiles only when it describes this entity's activity/path.
 *   Geographic totals, from-A-to-B distances, and max-of-numbers heuristics
 *   no longer populate the field. Stale v4 rows miss and re-normalize.
 * NPS activities-v6 = subject-aware scenic-drive identity, distinct from
 *   incidental walking/pullout prose. Older rows refresh through the broker.
 * NPS activities-v7 = primary drives never project walkingDistanceMiles;
 *   optional walking and distance along the road belong to different subjects.
 */

const REQUIRED_EXTRACTOR_VERSIONS = Object.freeze({
  'nps:activities': Object.freeze(['nps-activities-v11']),
});

/**
 * SEMANTIC NORMALIZATION CONTRACT — separate from source freshness.
 *
 * `extractorVersion` describes the SHAPE a provider projected. It does not move
 * when the MEANING of a projected field changes, and operational facts are
 * meaning: they are produced by pattern semantics and then persisted inside
 * `TrailieEvidence.normalizedValue`, where they outlive the producer that wrote
 * them. Gate #5 read `vehicle_restriction | access over gravel roads` out of
 * cache after the producer could no longer generate it — the fix was deployed
 * and the behaviour was not.
 *
 * So the producer contract carries its own version, stamped on the candidate at
 * normalization time and required on read. An NPS response may still be
 * source-fresh while its stored normalizedValue is semantically obsolete;
 * current code must not call that valid.
 *
 * BUMP THIS whenever operational fact production changes what a given piece of
 * official text means — new or removed rules, changed pattern semantics,
 * changed confidence or authority handling.
 *
 * opnorm-v1 — implicit/unstamped: surface wording alone created a restriction.
 * opnorm-v2 — capability creates, surface only corroborates.
 * opnorm-v3 — all source text fields; explicit present closures, accurate field provenance.
 */
const OPERATIONAL_NORMALIZATION_CONTRACT_VERSION = 'opnorm-v3';

/** Stamp lives on claim.qualifiers; provenance is strict and cannot take it. */
const OPERATIONAL_NORMALIZATION_QUALIFIER_PREFIX = 'operational_normalization:';
const OPERATIONAL_NORMALIZATION_QUALIFIER =
  `${OPERATIONAL_NORMALIZATION_QUALIFIER_PREFIX}${OPERATIONAL_NORMALIZATION_CONTRACT_VERSION}`;

/**
 * Narrowest scope that governs raw NPS evidence -> candidate projection ->
 * operational fact production. `extractOperationalFacts` runs on exactly one
 * family, so exactly one family is versioned by it. Everything else — fees,
 * hours, overview, alerts, weather, non-NPS providers — is untouched.
 */
const OPERATIONAL_NORMALIZATION_CONTRACTS = Object.freeze({
  'nps:activities': OPERATIONAL_NORMALIZATION_CONTRACT_VERSION,
});

// v11: contextual trail mileage cannot become a viewpoint/place's walking distance.
// Older normalized evidence must refresh; its source may still be chronologically fresh.
const NPS_NAMED_ACTIVITIES_EXTRACTOR_VERSION = 'nps-activities-v11';
const NPS_JOINT_UNIT_ACTIVITY_EXTRACTOR_VERSION = 'nps-activities-v11+joint-scope-v2';
const NPS_ACTIVITY_TAXONOMY_EXTRACTOR_VERSION = 'nps-activity-taxonomy-v1';

function isJointUnitActivityCandidate(candidate) {
  const match = /^nps:park:([a-z0-9_-]+)$/i.exec(candidate?.entityId || '');
  if (!match) return false;
  return Boolean(jointScopeFor(match[1]));
}

function contractKey(provider, topic) {
  const p = String(provider || '').trim().toLowerCase();
  const t = String(topic || '').trim().toLowerCase();
  if (!p || !t) return null;
  return `${p}:${t}`;
}

function requiredExtractorVersionsFor({ provider, topic } = {}) {
  const key = contractKey(provider, topic);
  return key ? (REQUIRED_EXTRACTOR_VERSIONS[key] || null) : null;
}

function requiredOperationalNormalizationVersionFor({ provider, topic } = {}) {
  const key = contractKey(provider, topic);
  return key ? (OPERATIONAL_NORMALIZATION_CONTRACTS[key] || null) : null;
}

/**
 * The semantic contract version a stored candidate was normalized under.
 * `null` means unstamped — a row written before the contract was versioned.
 */
function operationalNormalizationVersionOf(candidate) {
  for (const qualifier of candidate?.claim?.qualifiers || []) {
    if (typeof qualifier !== 'string') continue;
    if (qualifier.startsWith(OPERATIONAL_NORMALIZATION_QUALIFIER_PREFIX)) {
      return qualifier.slice(OPERATIONAL_NORMALIZATION_QUALIFIER_PREFIX.length) || null;
    }
  }
  return null;
}

/** Projection SHAPE compatibility: does the row carry a current extractor? */
function evaluateExtractorContractCompatibility(candidate, provider, candidateTopic) {
  const required = requiredExtractorVersionsFor({ provider, topic: candidateTopic });
  if (!required || required.length === 0) return { ok: true };

  const version = candidate?.provenance?.extractorVersion;
  const jointUnitActivity = provider === 'nps'
    && candidateTopic === 'activities'
    && isJointUnitActivityCandidate(candidate);
  if (jointUnitActivity && version !== NPS_JOINT_UNIT_ACTIVITY_EXTRACTOR_VERSION) {
    return { ok: false, reasonCode: 'candidate_normalization_scope_version_mismatch' };
  }
  if (!jointUnitActivity && !required.includes(version)) {
    return { ok: false, reasonCode: 'candidate_schema_version_mismatch' };
  }

  // Fix Pass #3E: nps-activities-v2 must come from an ingestion-complete source.
  // Legacy/partial snapshot writes without this stamp are cache misses.
  if (
    provider === 'nps'
    && candidateTopic === 'activities'
    && [
      NPS_NAMED_ACTIVITIES_EXTRACTOR_VERSION,
      NPS_JOINT_UNIT_ACTIVITY_EXTRACTOR_VERSION,
    ].includes(version)
  ) {
    // Stamp lives on claim.qualifiers (TrailieEvidence.provenance is strict and
    // cannot accept ad-hoc fields without a schema migration).
    const stamped = (candidate?.claim?.qualifiers || []).includes('source_ingestion_complete');
    if (!stamped) {
      return { ok: false, reasonCode: 'candidate_source_ingestion_incomplete' };
    }
  }

  return { ok: true };
}

/**
 * Shape first, then meaning. A row can carry the current projection shape and
 * still hold semantic output no current code path would produce.
 *
 * @returns {{ ok: true } | { ok: false, reasonCode: string }}
 */
/**
 * P0-5 — PARSED-RULE CONTENT CONTRACTS. For most topics official page
 * content answers the requirement; a dimension topic is answered only by the
 * PARSED RULE. An authoritative, fresh page about vehicle reservations says
 * nothing about a 21-ft length limit — accepting it froze the topic as
 * "satisfied" forever without the fact ever existing.
 */
const PARSED_RULE_CONTENT_CONTRACTS = Object.freeze({
  vehicle_restrictions: (candidate) =>
    (candidate?.claim?.normalizedValue?.operationalFacts || [])
      .some((fact) => fact?.type === 'vehicle_dimension'),
});

function candidateCarriesParsedRule(candidate, topic) {
  const check = PARSED_RULE_CONTENT_CONTRACTS[candidate?.topic || topic];
  if (!check) return true;
  return check(candidate);
}

function evaluateEvidenceContractCompatibility(candidate, { topic } = {}) {
  const provider = candidate?.source?.provider;
  const candidateTopic = candidate?.topic || topic;

  const extractor = evaluateExtractorContractCompatibility(candidate, provider, candidateTopic);
  if (!extractor.ok) return extractor;

  const requiredNormalization = requiredOperationalNormalizationVersionFor({
    provider, topic: candidateTopic,
  });
  if (requiredNormalization
    && operationalNormalizationVersionOf(candidate) !== requiredNormalization) {
    return { ok: false, reasonCode: 'candidate_operational_normalization_version_mismatch' };
  }

  return { ok: true };
}

module.exports = {
  REQUIRED_EXTRACTOR_VERSIONS,
  OPERATIONAL_NORMALIZATION_CONTRACT_VERSION,
  OPERATIONAL_NORMALIZATION_QUALIFIER,
  OPERATIONAL_NORMALIZATION_QUALIFIER_PREFIX,
  OPERATIONAL_NORMALIZATION_CONTRACTS,
  requiredOperationalNormalizationVersionFor,
  operationalNormalizationVersionOf,
  NPS_NAMED_ACTIVITIES_EXTRACTOR_VERSION,
  NPS_JOINT_UNIT_ACTIVITY_EXTRACTOR_VERSION,
  NPS_ACTIVITY_TAXONOMY_EXTRACTOR_VERSION,
  requiredExtractorVersionsFor,
  evaluateEvidenceContractCompatibility,
  candidateCarriesParsedRule,
};
