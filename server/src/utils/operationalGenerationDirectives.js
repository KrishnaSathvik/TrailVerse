'use strict';

/**
 * RELIABILITY PASS R1/R2 (2026-09-01) — machine-composed operational truth
 * for generation ATTEMPT 1.
 *
 * WHY THIS EXISTS
 * ---------------
 * The frozen EvidenceBundle has carried authoritative operational facts since
 * P0-5, and the traveler-fit veto reads them — AFTER generation. So the first
 * attempt regularly proposed exactly what the validator then refused (the
 * 24-ft RV anchored on 21-ft Going-to-the-Sun Road), and Trailie learned the
 * fact only from its own rejection. Convergence, not correctness, was the cost.
 *
 * WHAT THIS IS
 * ------------
 * The same machine-owned resolution the validators perform — dimension
 * arithmetic (`assessVehicleDimensionFit`), declared-capability matching
 * (`declaredCapabilities`), avoid-exposure arming (`isAvoidExposureActive`) —
 * run ONCE before the architect call, and expressed as composed CONSEQUENCES:
 *
 *   HARD_CAPABILITY  ->  a plan-construction prohibition ("do not include /
 *                        do not plan around"), because the fit veto fails these
 *                        outright: no phrasing makes an unheld capability held.
 *   ACTION_REQUIRED  ->  an obligation that travels WITH the recommendation
 *                        ("you may still recommend it; state the requirement"),
 *                        never an exclusion — a permit hike is a perfectly good
 *                        recommendation accompanied by its requirement.
 *   avoidExposure    ->  the per-turn LEGAL POOL: which evidence candidates are
 *                        confirmed low-exposure, and the instruction not to rely
 *                        on any other exposure-relevant stop nor to author
 *                        exposure ratings. This resolves the standing
 *                        contradiction (generation: "don't invent
 *                        exposureLevel"; validation: "unknown exposure fails")
 *                        by telling attempt 1 what a legal construction IS.
 *
 * WHAT THIS IS NOT
 * ----------------
 * Not raw evidence prose (the model must not be asked to perform the
 * implication), not a validator change (every veto stays), and not a producer:
 * facts come exclusively from the frozen bundle. A traveler with no matching
 * facts and no armed exposure constraint composes NOTHING — an ordinary trip's
 * prompt is byte-identical to before.
 */

const { operationalFactsFromBundle } = require('./operationalFactExtraction');
const { CONSTRAINT_TYPE } = require('./trailieOperationalConstraints');
const {
  declaredCapabilities,
  CAPABILITY_FOR_KIND,
  CLASS_FOR_KIND,
  DEPENDENCY_CLASS,
  TYPE_TO_KIND,
} = require('./travelerFitEvaluation');
const {
  resolveTravelerVehicle,
  assessVehicleDimensionFit,
  formatFeet,
} = require('./vehicleDimensionContract');
const { isAvoidExposureActive } = require('./planningInputContract');
const { classifyCandidateExposureSuggestibility } = require('./hardConstraintEligibility');

const MAX_RULES_PER_CLASS = 6;
const MAX_CONFIRMED_LOW_NAMES = 8;

const VEHICLE_KIND_LABEL = Object.freeze({
  rv: 'RV', motorhome: 'motorhome', camper: 'camper', trailer: 'trailer',
});

/** The tightest length limit per subject, so one road never yields two rules. */
function tightestDimensionFactsBySubject(facts) {
  const bySubject = new Map();
  for (const fact of facts) {
    if (fact?.type !== CONSTRAINT_TYPE.VEHICLE_DIMENSION) continue;
    const max = Number(fact?.dimension?.maxLengthFeet);
    if (!Number.isFinite(max)) continue;
    const key = String(fact?.subject?.name || '').toLowerCase();
    if (!key) continue;
    const existing = bySubject.get(key);
    if (!existing || max < Number(existing.dimension.maxLengthFeet)) bySubject.set(key, fact);
  }
  return [...bySubject.values()];
}

function composeVehicleDimensionRules({ facts, constraints, userPrompt }) {
  const dimensionFacts = tightestDimensionFactsBySubject(facts);
  if (dimensionFacts.length === 0) return [];
  const vehicle = resolveTravelerVehicle({ constraints, userPrompt });
  if (!vehicle) return [];
  const label = VEHICLE_KIND_LABEL[vehicle.kind] || 'vehicle';

  const rules = [];
  for (const fact of dimensionFacts) {
    const subject = fact.subject.name;
    const maxLengthFeet = Number(fact.dimension.maxLengthFeet);
    const outcome = assessVehicleDimensionFit({ vehicleLengthFeet: vehicle.lengthFeet, maxLengthFeet });
    if (outcome.status === 'incompatible') {
      // No "use the shuttle instead" phrasing: the fit veto binds by subject
      // IDENTITY and has no shuttle concept, so any stop denoting the subject
      // is refused however it is accessed. The directive must not invite a
      // construction the validator cannot accept (matrix finding B, 2026-09-01).
      rules.push({
        subjectName: subject,
        kind: 'vehicle_dimension',
        text: `The traveler's ${label} is ${formatFeet(vehicle.lengthFeet)} ft. ${subject} permits vehicles up to ${formatFeet(maxLengthFeet)} ft. Do not include ${subject} as a stop and do not plan any segment that requires driving this ${label} on it — build those days around areas reachable without it. If ${subject} comes up, state the ${formatFeet(maxLengthFeet)} ft limit plainly.`,
      });
    } else if (outcome.status === 'unknown') {
      rules.push({
        subjectName: subject,
        kind: 'vehicle_dimension',
        text: `The traveler has a ${label} of unstated length. ${subject} permits vehicles up to ${formatFeet(maxLengthFeet)} ft, and compatibility cannot be verified. Do not build any day around driving the ${label} on ${subject}; if ${subject} is mentioned, state the ${formatFeet(maxLengthFeet)} ft limit plainly.`,
      });
    }
    // compatible / not_applicable: the limit binds nothing — no rule.
  }
  return rules;
}

/**
 * Non-dimensional facts, resolved by dependency class exactly as the fit
 * layer resolves them: a HARD kind whose capability the traveler has not
 * declared is a construction prohibition; an ACTION kind not already
 * discharged is an obligation attached to the recommendation.
 */
const identityKey = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** Same-place check for suppression only: "Drive Going-to-the-Sun Road" denotes
 * the prohibited "Going-to-the-Sun Road". Over-suppressing an obligation is the
 * safe direction — the fit layer still records the requirement post-generation. */
const denotesProhibitedSubject = (subject, prohibitedKeys) => {
  const key = identityKey(subject);
  if (!key) return false;
  return prohibitedKeys.some((p) => p && (key.includes(p) || p.includes(key)));
};

function composeClassedRules({
  facts, constraints, userPrompt, prohibitedSubjects = [], exposureIneligibleKeys = [],
}) {
  const held = declaredCapabilities(constraints, userPrompt);
  const prohibitedKeys = prohibitedSubjects.map(identityKey).filter(Boolean);
  const hardProhibitions = [];
  const obligations = [];
  const seen = new Set();

  for (const fact of facts) {
    if (fact?.type === CONSTRAINT_TYPE.VEHICLE_DIMENSION) continue;
    const kind = TYPE_TO_KIND[fact?.type];
    if (!kind) continue;
    const subject = fact?.subject?.name;
    if (!subject) continue;
    const dedupe = `${kind}::${subject.toLowerCase()}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    // A subject the plan may not be built from must not be re-invited by its
    // own obligation ("may still be recommended…") — matrix finding B.
    if (denotesProhibitedSubject(subject, prohibitedKeys)) continue;
    // Likewise for an armed exposure constraint: an exposure-relevant subject
    // with no confirmed low exposure is ineligible for THIS traveler, so its
    // permit obligation would only tempt generation into a veto (finding A2).
    if (denotesProhibitedSubject(subject, exposureIneligibleKeys)) continue;

    const needed = CAPABILITY_FOR_KIND[kind];
    if (needed && held.has(needed)) continue;

    const requirement = String(fact?.requirement || '').trim() || 'special access';
    if (CLASS_FOR_KIND[kind] === DEPENDENCY_CLASS.HARD_CAPABILITY) {
      hardProhibitions.push({
        subjectName: subject,
        kind,
        text: `${subject} requires ${requirement}. This traveler has not said they have that — do not include ${subject} in the plan.`,
      });
    } else if (CLASS_FOR_KIND[kind] === DEPENDENCY_CLASS.ACTION_REQUIRED) {
      obligations.push({
        subjectName: subject,
        kind,
        text: `${subject} requires ${requirement}. You may still recommend it — if included, state that requirement with the recommendation. Do not treat it as excluded.`,
      });
    }
  }
  return { hardProhibitions, obligations };
}

/** Only an exposure-RELEVANT place belongs in the legal pool: lodges, museums
 * and ranger programs never needed certification, and live Zion filled the
 * capped pool with them while real low-exposure trails fell off the end
 * (matrix finding A, 2026-09-01). */
const EXPOSURE_RELEVANT_ACTIVITY = /\b(?:hik\w*|walk\w*|trail\w*|boardwalk)\b/i;
const EXPOSURE_RELEVANT_NAME = /\b(?:trail|walk|hike|boardwalk|path|loop|overlook|viewpoint)\b/i;

function isExposureRelevantCandidate(value) {
  const activityTypes = Array.isArray(value?.activityTypes) ? value.activityTypes : [];
  if (activityTypes.some((t) => EXPOSURE_RELEVANT_ACTIVITY.test(String(t)))) return true;
  return EXPOSURE_RELEVANT_NAME.test(String(value?.name || ''));
}

/** Evidence candidates whose structured metadata certifies low exposure. */
function confirmedLowExposureNames(evidenceBundle) {
  const names = [];
  for (const candidate of evidenceBundle?.evidence || []) {
    const value = candidate?.claim?.normalizedValue;
    if (String(value?.exposureLevel || '').toLowerCase() !== 'low') continue;
    if (!isExposureRelevantCandidate(value)) continue;
    const name = typeof value?.name === 'string' ? value.name.trim() : '';
    if (name && !names.includes(name)) names.push(name);
    if (names.length >= MAX_CONFIRMED_LOW_NAMES) break;
  }
  return names;
}

function composeExposureDirective({ evidenceBundle, constraints, userPrompt }) {
  if (!isAvoidExposureActive(constraints, userPrompt)) return null;
  const confirmedLowNames = confirmedLowExposureNames(evidenceBundle);
  const ineligibleEvidenceIds = [];
  // Identity-based suggestion legality, computed once by the central authority
  // (`classifyCandidateExposureSuggestibility`) so retry steering can never
  // disagree with construction rules. `ineligibleEvidenceIds` keeps its
  // narrower catalogue-removal semantics (rendered-evidence + identity
  // exclusion); the suggestion sets are strictly about what the machine may
  // OFFER the model.
  const confirmedLowEvidenceIds = [];
  const suggestionIneligibleEvidenceIds = [];
  for (const candidate of evidenceBundle?.evidence || []) {
    const value = candidate?.claim?.normalizedValue;
    if (candidate?.evidenceId) {
      const suggestibility = classifyCandidateExposureSuggestibility(value);
      if (suggestibility === 'confirmed_low') confirmedLowEvidenceIds.push(candidate.evidenceId);
      else if (suggestibility === 'ineligible') suggestionIneligibleEvidenceIds.push(candidate.evidenceId);
    }
    if (!isExposureRelevantCandidate(value)) continue;
    if (String(value?.exposureLevel || '').toLowerCase() === 'low') continue;
    if (candidate?.evidenceId) ineligibleEvidenceIds.push(candidate.evidenceId);
  }
  const pool = confirmedLowNames.length > 0
    ? `Trails confirmed low-exposure in the supplied evidence: ${confirmedLowNames.join(', ')}.`
    : 'None are confirmed low-exposure in the supplied evidence.';
  return {
    confirmedLowNames,
    ineligibleEvidenceIds,
    confirmedLowEvidenceIds,
    suggestionIneligibleEvidenceIds,
    text: `This traveler avoids exposed terrain. An exposure-relevant stop (trail, viewpoint, overlook) satisfies that constraint only when its low exposure is confirmed by evidence. ${pool} Do not rely on any other exposure-relevant stop to carry a day — build days from that confirmed pool plus experiences whose suitability does not depend on exposure (visitor centers, museums, nature centers, scenic drives, lodge areas, picnic areas), choosing only places the supplied evidence actually names. Never author, guess, or invent an exposureLevel value.`,
  };
}

/**
 * @returns {null | {hardProhibitions: object[], obligations: object[], exposure: object|null}}
 *   null whenever nothing applies, so an ordinary turn's prompt is untouched.
 */
function composeOperationalGenerationDirectives({
  evidenceBundle = null, constraints = null, userPrompt = '',
} = {}) {
  const facts = operationalFactsFromBundle(evidenceBundle);

  const dimensionRules = composeVehicleDimensionRules({ facts, constraints, userPrompt });
  const exposure = composeExposureDirective({ evidenceBundle, constraints, userPrompt });
  // With exposure armed, an exposure-relevant candidate NOT in the confirmed
  // pool cannot legally carry this traveler's day — collect those identities so
  // their obligations are suppressed rather than composed as invitations.
  const exposureIneligibleKeys = [];
  if (exposure) {
    const confirmed = new Set(exposure.confirmedLowNames.map(identityKey));
    for (const candidate of evidenceBundle?.evidence || []) {
      const value = candidate?.claim?.normalizedValue;
      if (!isExposureRelevantCandidate(value)) continue;
      const key = identityKey(value?.name);
      if (key && !confirmed.has(key)) exposureIneligibleKeys.push(key);
    }
  }
  const classed = composeClassedRules({
    facts,
    constraints,
    userPrompt,
    prohibitedSubjects: dimensionRules.map((r) => r.subjectName),
    exposureIneligibleKeys,
  });
  const hardProhibitions = [...dimensionRules, ...classed.hardProhibitions].slice(0, MAX_RULES_PER_CLASS);
  const obligations = classed.obligations.slice(0, MAX_RULES_PER_CLASS);

  if (hardProhibitions.length === 0 && obligations.length === 0 && !exposure) return null;
  return Object.freeze({
    hardProhibitions: Object.freeze(hardProhibitions.map((r) => Object.freeze(r))),
    obligations: Object.freeze(obligations.map((r) => Object.freeze(r))),
    exposure: exposure ? Object.freeze({
      ...exposure,
      confirmedLowNames: Object.freeze(exposure.confirmedLowNames),
      ineligibleEvidenceIds: Object.freeze(exposure.ineligibleEvidenceIds),
      confirmedLowEvidenceIds: Object.freeze(exposure.confirmedLowEvidenceIds),
      suggestionIneligibleEvidenceIds: Object.freeze(exposure.suggestionIneligibleEvidenceIds),
    }) : null,
  });
}

module.exports = { composeOperationalGenerationDirectives };
