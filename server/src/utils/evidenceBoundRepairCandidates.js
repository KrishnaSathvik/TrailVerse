'use strict';

/**
 * THE RECOMMENDATION BOUNDARY (Phase 4M) ON A REAL CATALOGUE (Phase 4O).
 *
 * A frozen EvidenceBundle has always been the TRUTH boundary: the facts every
 * validator may use, fixed once per turn so a repair cannot change what is true
 * halfway through. Phase 4L showed that is only half of what freezing has to
 * mean, and Phase 4M made the bundle both boundaries:
 *
 *     Frozen EvidenceBundle
 *       ├── truth boundary          operational facts available to validation
 *       └── recommendation boundary allowed new place identities
 *
 * The model selects a dense `placeRef`; the machine resolves the canonical
 * identity from the evidence record. A place the bundle never mentioned is
 * unrepresentable rather than merely discouraged.
 *
 * PHASE 4N PUT THAT IN FRONT OF A REAL NPS BUNDLE AND FOUND THREE THINGS.
 *
 * 1. The boundary held: the model selected two catalogued refs and authored no
 *    name. Nothing here changes that contract.
 * 2. Nothing could be merged. The catalogue read `placeType ?? type`; the
 *    producer emits `category`. Every candidate was typeless, so the merge
 *    rejected every operation. `evidencePlaceCandidate` now owns that
 *    translation, and the SERVER supplies the type — the model never echoes
 *    catalogue metadata back, exactly as it never echoes an identity.
 * 3. The catalogue was not a product catalogue. "Exclude only what the machine
 *    positively knows is non-experiential" excludes NOTHING when the machine
 *    knows nothing, so convenience stores, cabins and audio-tour narration
 *    titles were offered as candidate experiences — and the 60-cap over a
 *    placeKey sort made the offered set the alphabetical prefix A…F of 265
 *    identities.
 *
 * SO ELIGIBILITY IS NOW POSITIVE, AND FAIL-CLOSED.
 *
 *     known experiential      eligible
 *     known logistical/rest   ineligible
 *     unknown classification  INELIGIBLE
 *
 * That is narrow on purpose. It does not say an unknown place is bad; it says a
 * machine-owned repair may not use an unknown-type identity to discharge an
 * EXPERIENTIAL obligation (`missing_experience_anchor`,
 * `insufficient_day_coverage`). Both creation repairs are held to it.
 *
 * ELIGIBILITY IS STILL REPRESENTATION, NEVER RESTRICTION. A place with
 * `operationalFacts: []` is a perfectly good recommendation, and one WITH a
 * permit or vehicle requirement stays selectable: Phase 4L proved the post-merge
 * traveler-fit path polices exactly that, and using "has a restriction" as the
 * allowlist would delete every ordinary recommendation. Only HARD unavailability
 * — an official closure — is resolved before the model is paid to choose.
 *
 * Pure and deterministic: same bundle and same plan give the same refs, in the
 * same order, whatever order the broker returned its evidence in.
 */

const crypto = require('crypto');
const { entityEvidenceProvenance } = require('./entityEvidenceProvenance');
const evidenceEntityKey = row => placeKeyOf(entityEvidenceProvenance(row).canonicalEntityName);
const {
  EXPERIENCE_CLASS,
  EXPERIENTIAL_PRECEDENCE,
  PLACE_TOPICS,
  normalizeEvidencePlaceCandidates,
  placeKeyOf,
} = require('./evidencePlaceCandidate');
const { buildUnavailablePlaceIndex, hardUnavailableReason } = require('./evidenceAvailability');
const { evaluateHardAccessEligibility, evaluateHardExposureEligibility, evaluateHardMobilityEligibility } = require('./hardConstraintEligibility');
const { runtimeMobilityField, resolveRuntimeFitness } = require('./canonicalRuntimeProjection');
const { isAvoidExposureActive } = require('./planningInputContract');

const REASON = Object.freeze({
  EVIDENCE_CATALOG_UNAVAILABLE: 'repair_evidence_catalog_unavailable',
});

/** Hard cap so a 300-place bundle cannot become a 300-line prompt. */
const DEFAULT_LIMIT = 60;

/**
 * A stable pseudo-random position for one identity.
 *
 * Its ONLY job is to give lexical position zero semantic authority. Phase 4N's
 * catalogue was `placeKey`-sorted and capped, so "A Boat's Purpose" outranked
 * "Taggart Lake" for no reason other than the letter it starts with. This is a
 * function of the identity alone, so it is identical on every replay of the same
 * bundle and independent of the order the evidence arrived in.
 */
function stableRank(placeKey) {
  return crypto.createHash('sha256').update(`repair-candidate:${placeKey}`, 'utf8').digest('hex');
}

/**
 * DETERMINISTIC SELECTION, STRATIFIED BY CANONICAL TYPE.
 *
 * Round-robin across the type vocabulary in its declared order, taking the
 * best-ranked unused identity of each type in turn. A cap therefore truncates
 * the DEPTH of every type rather than deleting whole kinds of experience: 60 of
 * 69 Grand Teton candidates keeps hikes, walks, scenic drives, viewpoints and
 * wildlife spots all represented, where an alphabetical cut kept only A–F.
 *
 * Ordering inputs: the fixed vocabulary, the identity hash, and the identity.
 * None of them is the bundle's own ordering.
 */
function rankAndCap(candidates, limit) {
  const strata = new Map(EXPERIENTIAL_PRECEDENCE.map((type) => [type, []]));
  const other = [];
  for (const candidate of candidates) {
    const bucket = strata.get(candidate.canonicalType);
    (bucket || other).push(candidate);
  }
  const order = (list) => list.sort((a, b) => {
    const ra = stableRank(a.placeKey);
    const rb = stableRank(b.placeKey);
    if (ra !== rb) return ra < rb ? -1 : 1;
    return a.placeKey < b.placeKey ? -1 : a.placeKey > b.placeKey ? 1 : 0;
  });
  const queues = [...EXPERIENTIAL_PRECEDENCE.map((type) => order(strata.get(type))), order(other)]
    .filter((queue) => queue.length > 0);

  const selected = [];
  let drained = false;
  while (selected.length < limit && !drained) {
    drained = true;
    for (const queue of queues) {
      if (selected.length >= limit) break;
      const next = queue.shift();
      if (!next) continue;
      drained = false;
      selected.push(next);
    }
  }
  return selected;
}

/**
 * The identities a contained repair may introduce, derived from the frozen
 * bundle alone.
 *
 * @param {object}  params.bundle              the frozen EvidenceBundle
 * @param {object}  params.candidatePlan       the plan the repair will mutate
 * @param {object}  params.repairScope         resolved scope (carried so a future per-day
 *                                             catalogue is a change here, not at every call site)
 * @param {boolean} params.requireExperiential creation repairs: the machine must POSITIVELY
 *                                             classify a candidate as experiential
 * @param {number}  params.limit               prompt-size cap
 * @returns {{ ok: boolean, candidates: object[], count: number, fingerprint: string|null,
 *             reasonCodes: string[], audit: object }}
 */
function buildEvidenceBoundRepairCandidates({
  bundle = null, candidatePlan = null, repairScope = null,
  requireExperiential = true, limit = DEFAULT_LIMIT,
  constraints = null, includeExisting = false, requireExecutablePrimary = false,
} = {}) {
  const audit = {
    placeIdentities: 0,
    byExperienceClass: {},
    excludedAlreadyInPlan: 0,
    excludedNotExperiential: 0,
    excludedUnknownClass: 0,
    excludedHardUnavailable: 0,
    excludedIdentity: 0,
    excludedHardConstraint: 0,
    excludedNotExecutable: 0,
    hardConstraintExclusions: [],
    hardUnavailable: [],
    eligibleBeforeCap: 0,
    cap: Math.max(1, limit),
  };
  const empty = () => ({
    ok: false, candidates: [], count: 0, fingerprint: null,
    reasonCodes: [REASON.EVIDENCE_CATALOG_UNAVAILABLE], audit,
  });

  const evidence = Array.isArray(bundle?.evidence) ? bundle.evidence : [];
  if (!evidence.length) return empty();

  const places = normalizeEvidencePlaceCandidates(bundle);
  audit.placeIdentities = places.length;
  for (const place of places) {
    audit.byExperienceClass[place.experienceClass] = (audit.byExperienceClass[place.experienceClass] || 0) + 1;
  }
  if (!places.length) return empty();

  // Identities the plan already holds. Re-adding one buys no coverage and no new
  // information, and the merges reject it anyway.
  const taken = new Set(
    (Array.isArray(candidatePlan?.days) ? candidatePlan.days : [])
      .flatMap((day) => (Array.isArray(day?.stops) ? day.stops : []))
      .flatMap((stop) => [stop?.name, stop?.canonicalPlaceName,
        evidence.find(row => row.evidenceId === stop?.evidenceRef)?.claim?.normalizedValue?.name])
      .map(placeKeyOf)
      .filter(Boolean)
  );
  const unavailable = buildUnavailablePlaceIndex(bundle);

  const eligible = [];
  const removedByMutation = new Set((constraints?.excludedStopNames || []).map(placeKeyOf));
  for (const place of places) {
    if (place.identityAmbiguous) { audit.excludedIdentity += 1; continue; }
    if (removedByMutation.has(place.placeKey)) { audit.excludedHardConstraint += 1; continue; }
    if (!includeExisting && taken.has(place.placeKey)) { audit.excludedAlreadyInPlan += 1; continue; }
    const closed = hardUnavailableReason(place.placeKey, unavailable);
    if (closed) {
      audit.excludedHardUnavailable += 1;
      audit.hardUnavailable.push({ placeKey: place.placeKey, ruleCode: closed.ruleCode, alertTitle: closed.alertTitle });
      continue;
    }
    if (requireExperiential && place.experienceClass !== EXPERIENCE_CLASS.EXPERIENTIAL) {
      if (place.experienceClass === EXPERIENCE_CLASS.UNKNOWN) audit.excludedUnknownClass += 1;
      else audit.excludedNotExperiential += 1;
      continue;
    }
    // A candidate with no canonical type cannot be merged, because the server is
    // the only thing allowed to supply one.
    if (!place.canonicalType) { audit.excludedUnknownClass += 1; continue; }
    const records = evidence.filter((row) => evidenceEntityKey(row) === place.placeKey);
    const values = records.map((row) => row.claim.normalizedValue);
    if (values.some(value => value.closureStatus === 'closed'
      || ['unavailable', 'closed'].includes(value.availabilityStatus))) {
      audit.excludedHardUnavailable += 1;
      continue;
    }
    const { reasonCodes: reasons } = require('./candidateViability').evaluateCandidateConstraints({
      records, name: place.canonicalName, type: place.canonicalType, constraints, bundle,
    });
    if (reasons.length) {
      audit.excludedHardConstraint += 1;
      audit.hardConstraintExclusions.push({ placeKey: place.placeKey, reasonCodes: [...new Set(reasons)] });
      continue;
    }
    if (requireExecutablePrimary && !require('./candidateViability').evaluateCandidateViability({
      records, name: place.canonicalName, type: place.canonicalType, constraints, bundle,
    }).structuralEligible) {
      audit.excludedNotExecutable += 1;
      continue;
    }
    eligible.push(place);
  }
  audit.eligibleBeforeCap = eligible.length;
  if (!eligible.length) return empty();

  const selected = rankAndCap(eligible, Math.max(1, limit));
  const candidates = selected.map((place, index) => ({
    ref: index + 1,
    placeKey: place.placeKey,
    canonicalName: place.canonicalName,
    canonicalType: place.canonicalType,
    experienceClass: place.experienceClass,
    sourceCategories: place.sourceCategories,
    operationalFactTypes: place.operationalFactTypes,
    coordinates: place.coordinates ?? null,
    maxDurationMinutes: evidence.filter(row => evidenceEntityKey(row) === place.placeKey)
      .map(row => require('./evidenceActivityDuration').supportedDurationMaximum(row.claim.normalizedValue))
      .filter(n => Number.isFinite(n) && n > 0).sort((a, b) => a - b)[0] || null,
    evidenceIds: evidence.filter(row => evidenceEntityKey(row) === place.placeKey)
      .map(row => row.evidenceId).filter(Boolean).sort(),
    entityId: place.entityId ?? null,
    destinationId: place.destinationId ?? null,
    accessEligibility: {
      constraints: { mobility: {
        wheelchair: runtimeMobilityField(constraints, 'wheelchair'),
        avoidStairs: runtimeMobilityField(constraints, 'avoidStairs'),
      } },
      bundle: { evidence: evidence.filter(row => evidenceEntityKey(row) === place.placeKey) },
    },
  }));
  const fingerprint = crypto.createHash('sha256')
    .update(JSON.stringify(candidates.map((candidate) => [candidate.ref, candidate.placeKey])), 'utf8')
    .digest('hex');

  return { ok: true, candidates, count: candidates.length, fingerprint, reasonCodes: [], audit };
}

/** Resolve a model-selected ref to the machine-owned identity, or null. */
function resolveCandidateRef(candidates, ref) {
  if (!Array.isArray(candidates)) return null;
  if (!Number.isInteger(ref)) return null;
  return candidates.find((candidate) => candidate.ref === ref) || null;
}

module.exports = {
  PLACE_TOPICS,
  REPAIR_CANDIDATE_REASON_CODES: REASON,
  buildEvidenceBoundRepairCandidates,
  rankAndCap,
  resolveCandidateRef,
  stableRank,
};
