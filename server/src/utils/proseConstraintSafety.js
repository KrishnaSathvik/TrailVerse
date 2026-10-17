'use strict';

/**
 * Hard-constraint integrity for PROSE.
 *
 * The structured itinerary path has always enforced mobility/exposure limits
 * against candidate metadata. Plain prose did not: `evaluateMobilityClaimConsistency`
 * compares against stops found in the evidence bundle, so an answer naming a
 * place the bundle never mentioned escaped every check. A traveler with a
 * one-mile limit could be told to hike an eight-mile exposed cliff route purely
 * because the answer arrived as prose instead of a plan.
 *
 * Constraint integrity cannot depend on presentation type. This validator reads
 * ONLY the generated text, so it works with no itinerary and no matching
 * evidence.
 *
 * Two rules keep it honest:
 *   - It judges what the ANSWER CLAIMS, never what a place actually is. An
 *     unnamed property stays unknown; nothing is invented.
 *   - Under an active hard constraint the answer may mention an unknown place
 *     conditionally, but may NOT certify it as compliant.
 *
 * No destination names. Grammar and units only.
 */

const { normalizeUserText } = require('./lexicalNormalization');
const {
  resolveRuntimeActivityPreference,
  runtimeMobilityField,
} = require('./canonicalRuntimeProjection');
const {
  findRecommendedHazard,
  analyzeHazardStances,
  AVOIDANCE_VERB_SOURCE,
} = require('./hazardRejectionSemantics');

const MILES_PER_KM = 0.621371;

/** Walking/hiking activity nouns — a distance only matters if it is walked. */
const ON_FOOT = /\b(?:hike|hikes|hiking|walk|walks|walking|trail|trails|loop|round[- ]?trip|out[- ]and[- ]back|trek|scramble|climb|stroll|path)\b/i;

/** Exposure vocabulary the ANSWER itself uses to describe a place. */
const EXPOSURE_CLAIM =
  /\b(?:exposed|exposure|cliff[- ]?edges?|cliff[- ]?side|sheer drops?|sheer edges?|drop[- ]?offs?|narrow ledges?|ledges?|chain section|chains bolted|via ferrata|knife[- ]?edge|precipitous|vertigo[- ]inducing|steep drop)\b/i;

/** Strenuous-effort vocabulary. */
const STRENUOUS_CLAIM = /\b(?:strenuous|grueling|punishing|very steep|steep climb|challenging climb|difficult hike|hard hike)\b/i;

/**
 * Sentence-level guidance markers for the DISTANCE and NO-HIKING rules.
 * "Skip the 8-mile cliff trail" must never read as a recommendation of an
 * 8-mile walk. Exposure no longer consults this: polarity there is scoped to
 * the phrase, not to the whole sentence (see `hazardRejectionSemantics`).
 *
 * The avoidance verbs come from the shared inflection family, so "avoids" and
 * "avoiding" can never again be missed here while "avoid" is matched. The
 * absence prepositions ("without", "free of") are deliberately NOT included:
 * "this 8-mile hike is doable without a permit" rejects nothing about the
 * distance.
 */
const REJECTION_MARKER = new RegExp(
  `\\b(?:${AVOIDANCE_VERB_SOURCE}`
  + "|don'?t|do not|not suitable|unsuitable|instead of|rather than|too long|too far"
  + '|beyond|over your|exceeds|would be too|i\'?d leave out|not recommend'
  + '|out of range|not a good fit|wouldn\'?t)\\b',
  'i',
);

/** Compliance certifications — the answer asserting a place MEETS the limit. */
const COMPLIANCE_CLAIM =
  /\b(?:perfect for|ideal for|well within|within your|fits? your|meets? your|no problem for|fine for (?:everyone|you|your)|comfortable for (?:everyone|you|your)|suitable for (?:everyone|you|your)|manageable for|easy enough for|regardless of (?:mobility|your limit)|despite (?:the|your) (?:limit|mobility))\b/i;
/** Certifications specifically about exposure. */
const NO_EXPOSURE_CLAIM =
  /\b(?:no (?:exposure|drop[- ]?offs?|cliff[- ]?edges?)|not exposed|nothing exposed|completely sheltered|fully protected|no steep drops)\b/i;

function splitSentences(text) {
  return String(text || '')
    .split(/(?<=[.!?;:])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Distances the ANSWER states, converted to miles. */
function statedDistancesMiles(sentence) {
  const out = [];
  for (const match of sentence.matchAll(/\b(\d+(?:\.\d+)?)\s*[- ]?(miles?|mi\b|kilometers?|kilometres?|km)\b/gi)) {
    const value = Number(match[1]);
    if (!Number.isFinite(value) || value <= 0) continue;
    const unit = match[2].toLowerCase();
    out.push(/^k/.test(unit) ? value * MILES_PER_KM : value);
  }
  return out;
}

function isActive(value) {
  return value === true;
}

/**
 * @returns {{
 *   ok: boolean,
 *   reasonCodes: string[],
 *   violations: object[],
 *   stanceDiagnostics: object[],
 * }}
 */
function evaluateProseConstraintSafety({ text = '', constraints = null } = {}) {
  const source = normalizeUserText(text);
  if (!source) {
    return { ok: true, reasonCodes: [], violations: [], stanceDiagnostics: [] };
  }

  const walkLimit = Number(runtimeMobilityField(constraints, 'maxWalkMilesPerSegment'));
  const hasWalkLimit = Number.isFinite(walkLimit) && walkLimit > 0;
  const walkingLimited = runtimeMobilityField(constraints, 'walkingTolerance') === 'limited';
  const avoidExposure = isActive(constraints?.avoidExposure)
    || isActive(constraints?.preferences?.avoidExposure)
    || isActive(constraints?.planningState?.preferences?.avoidExposure);
  const noHiking = resolveRuntimeActivityPreference(constraints, 'hiking') === 'none';

  if (!hasWalkLimit && !avoidExposure && !noHiking && !walkingLimited) {
    return { ok: true, reasonCodes: [], violations: [], stanceDiagnostics: [] };
  }

  const violations = [];
  const stanceDiagnostics = [];

  // Exposure polarity is discourse-scoped across soft punctuation. Evaluating
  // per colon/semicolon fragment used to drop "keep B off the plan:" before
  // "…drop-offs there". Distance / hiking rules stay sentence-local.
  if (avoidExposure) {
    const exposureStances = analyzeHazardStances(source, EXPOSURE_CLAIM).map((m) => ({
      constraint: 'avoidExposure',
      entity: m.entity || null,
      hazardAttribute: m.hazardAttribute,
      assistantStance: m.stance,
      contradiction: m.contradiction,
      evidence: m.reason,
      phrase: m.phrase,
      boundary: m.boundary || null,
      relation: m.relation || null,
      governingClause: m.governingClause || null,
      sentence: source.slice(Math.max(0, (m.index || 0) - 40), (m.index || 0) + 80).trim(),
    }));
    stanceDiagnostics.push(...exposureStances);
    const offered = findRecommendedHazard(source, EXPOSURE_CLAIM);
    if (offered) {
      violations.push({
        reasonCode: 'exposure_constraint_contradiction',
        detail: offered.reason === 'rejected_hazard_entity_re_recommended'
          ? 'answer re-recommends an entity previously rejected for exposure'
          : 'answer offers a route it describes as exposed',
        sentence: source.slice(Math.max(0, (offered.index || 0) - 40), (offered.index || 0) + 80).trim(),
        phrase: offered.phrase,
        assistantStance: 'POSITIVE_RECOMMENDATION',
      });
    }
  }

  for (const sentence of splitSentences(source)) {
    const rejected = REJECTION_MARKER.test(sentence);
    const onFoot = ON_FOOT.test(sentence);

    // 1. A stated distance that exceeds an explicit limit, offered as a plan.
    if (hasWalkLimit && onFoot && !rejected) {
      for (const miles of statedDistancesMiles(sentence)) {
        if (miles > walkLimit) {
          violations.push({
            reasonCode: 'mobility_distance_contradiction',
            detail: `stated ${miles.toFixed(1)} mi on foot exceeds ${walkLimit} mi limit`,
            sentence: sentence.slice(0, 160),
          });
          break;
        }
      }
    }

    // 3. A strenuous hike offered to someone who does not hike.
    if (noHiking && onFoot && STRENUOUS_CLAIM.test(sentence) && !rejected) {
      violations.push({
        reasonCode: 'hiking_constraint_contradiction',
        detail: 'answer offers a strenuous hike under a no-hiking preference',
        sentence: sentence.slice(0, 160),
      });
    }

    // 4. Certifying compliance the answer has not established.
    //    Allowed: mentioning an unknown place conditionally.
    //    Not allowed: declaring it fits the limit.
    if ((hasWalkLimit || walkingLimited) && COMPLIANCE_CLAIM.test(sentence) && onFoot) {
      const distances = statedDistancesMiles(sentence);
      const provenCompatible = hasWalkLimit
        && distances.length > 0
        && distances.every((miles) => miles <= walkLimit);
      if (!provenCompatible) {
        violations.push({
          reasonCode: 'unsupported_mobility_suitability_claim',
          detail: 'answer certifies suitability without establishing the distance',
          sentence: sentence.slice(0, 160),
        });
      }
    }
    if (avoidExposure && NO_EXPOSURE_CLAIM.test(sentence) && onFoot) {
      // Claiming absence of exposure is itself a suitability certification.
      violations.push({
        reasonCode: 'unsupported_exposure_suitability_claim',
        detail: 'answer certifies absence of exposure it has not established',
        sentence: sentence.slice(0, 160),
      });
    }
  }

  const reasonCodes = [...new Set(violations.map((v) => v.reasonCode))];
  return {
    ok: reasonCodes.length === 0,
    reasonCodes,
    violations,
    stanceDiagnostics,
  };
}

/** Deterministic repair text — never names a place the model did not name. */
function buildProseConstraintRepairInstructions(result) {
  const parts = [];
  for (const code of result.reasonCodes || []) {
    if (code === 'mobility_distance_contradiction') {
      parts.push('Remove or replace any on-foot option whose stated distance exceeds the traveler\'s walking limit.');
    }
    if (code === 'exposure_constraint_contradiction') {
      parts.push('Remove any route you describe as exposed, cliff-edged, or with drop-offs; the traveler avoids exposure.');
    }
    if (code === 'hiking_constraint_contradiction') {
      parts.push('Do not offer a strenuous hike; this traveler does not hike.');
    }
    if (code === 'unsupported_mobility_suitability_claim') {
      parts.push('Do not state that an option fits the walking limit unless you give its distance. Mention it conditionally instead.');
    }
    if (code === 'unsupported_exposure_suitability_claim') {
      parts.push('Do not state that an option has no exposure unless that is established. Mention it conditionally instead.');
    }
  }
  return [...new Set(parts)].join(' ');
}

module.exports = {
  evaluateProseConstraintSafety,
  buildProseConstraintRepairInstructions,
};
