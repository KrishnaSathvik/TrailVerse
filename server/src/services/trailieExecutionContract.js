'use strict';

/**
 * ONE explicit execution precedence model.
 *
 *   RAW MESSAGE
 *     -> TurnUnderstanding            (canonical semantics of THIS turn)
 *     -> ExecutionContract            (what downstream is allowed to execute)
 *     -> legacy / public intent metadata (topical routing, evidence hints)
 *     -> evidence + generation
 *
 * NOT: TurnUnderstanding -> legacy classifier re-reads the raw message and
 * overrides artifact/task semantics. That inversion is what let a plain-answer
 * request ("we have four days ... lay out a couple of ways we could play it")
 * become a required day-by-day itinerary because a duration was present, spend
 * the whole architect token budget inside a truncated tool call three times,
 * and return the traveler a generic error.
 *
 * The contract is a CEILING on artifact strength and a FLOOR on explicitly
 * requested artifacts. Legacy deterministic classification keeps its useful
 * roles — topical intent, model routing, evidence planning — but may not
 * contradict explicit canonical semantics.
 *
 * Deterministic and offline. No providers, no network, no model calls.
 */

const { ARTIFACTS, STRUCTURE_POLICIES } = require('./turnUnderstanding');
const { DECISIONS } = require('../utils/turnSufficiencyDecision');

/** Where the final execution semantics came from. */
const INTENT_SOURCES = Object.freeze([
  'turn_understanding',
  'active_decision',
  'deterministic_legacy',
  'reconciled',
]);

/**
 * How strong an artifact is as an execution obligation. Only the ordering
 * matters; the numbers are not persisted.
 */
const ARTIFACT_STRENGTH = Object.freeze({
  none: 0,
  plain_answer: 1,
  comparison: 1,
  route: 2,
  trip_skeleton: 2,
  itinerary_patch: 3,
  itinerary: 3,
});

/** Legacy primary intents whose execution shape is "build a day-by-day plan". */
const ITINERARY_EXECUTION_INTENTS = Object.freeze([
  'simple_itinerary',
  'full_trip',
  'trip_refinement',
]);

/** Traveler jobs whose execution shape is "build/patch a day-by-day plan". */
const ITINERARY_EXECUTION_JOBS = Object.freeze([
  'day_by_day_itinerary',
  'itinerary_refinement',
]);

const CANONICAL_PLAN_ARTIFACTS = Object.freeze(['itinerary', 'itinerary_patch']);

function strengthOf(artifact) {
  return ARTIFACT_STRENGTH[artifact] ?? 0;
}

function boundedCodes(codes) {
  return [...new Set((codes || []).filter((c) => typeof c === 'string' && /^[a-z0-9_]{1,80}$/.test(c)))].slice(0, 12);
}

/**
 * Derive the execution contract for a turn.
 *
 * @param {object}  params.understanding   canonical TurnUnderstanding (may be null on legacy paths)
 * @param {string}  params.travelerJob     job resolved from the understanding
 * @param {object}  params.legacy          deterministic legacy classification
 *                                         ({ primaryIntent, depth, verticals })
 * @param {boolean} params.hasPriorPlan    a canonical plan already exists for this thread
 */
function deriveExecutionContract({
  understanding = null,
  travelerJob = null,
  legacy = null,
  hasPriorPlan = false,
} = {}) {
  const legacyStructurePolicy = STRUCTURE_POLICIES.includes(legacy?.structurePolicy)
    ? legacy.structurePolicy
    : 'optional';

  // No canonical understanding available (legacy call sites, injected test
  // classifications). There is nothing to enforce a ceiling against, so legacy
  // keeps full ownership — the contract must never invent a prohibition it was
  // not told about.
  if (!understanding) {
    const legacyItinerary = ITINERARY_EXECUTION_INTENTS.includes(legacy?.primaryIntent)
      || ITINERARY_EXECUTION_JOBS.includes(travelerJob)
      || (Array.isArray(legacy?.verticals) && legacy.verticals.includes('itinerary'));
    return Object.freeze({
      contractVersion: 1,
      taskFamily: null,
      travelerJob: travelerJob || null,
      requestedArtifact: null,
      forbiddenArtifacts: Object.freeze([]),
      structurePolicy: legacyStructurePolicy,
      destinationRelationship: null,
      comparisonSelectionRequired: false,
      actionableContingencyRequired: false,
      operationalSubjects: Object.freeze([]),
      continuationOfActiveDecision: false,
      priorJob: null,
      topicShift: false,
      hasPriorPlan: hasPriorPlan === true,
      constraintPatch: Object.freeze([]),
      softPreferencePatch: Object.freeze([]),
      maxArtifact: legacyItinerary ? 'itinerary' : 'plain_answer',
      allowsCanonicalPlanArtifact: legacyItinerary,
      requiresCanonicalPlanArtifact: false,
      patchRequested: false,
      patchExecutable: false,
      intentSource: 'deterministic_legacy',
      conflicts: Object.freeze([]),
      reasonCodes: Object.freeze(['no_canonical_understanding']),
    });
  }

  const requestedArtifact = ARTIFACTS.includes(understanding?.requestedArtifact)
    ? understanding.requestedArtifact
    : null;
  const forbiddenArtifacts = Array.isArray(understanding?.forbiddenArtifacts)
    ? understanding.forbiddenArtifacts.filter((a) => ARTIFACTS.includes(a))
    : [];
  const structurePolicy = STRUCTURE_POLICIES.includes(understanding?.structurePolicy)
    ? understanding.structurePolicy
    : 'optional';

  const legacyIntent = legacy?.primaryIntent || null;
  const legacyWantsItinerary = ITINERARY_EXECUTION_INTENTS.includes(legacyIntent)
    || (Array.isArray(legacy?.verticals) && legacy.verticals.includes('itinerary'));

  const conflicts = [];
  const reasonCodes = [];

  // ---- ceiling ---------------------------------------------------------
  // The canonical contract states the STRONGEST artifact this turn may
  // require. Nothing downstream may exceed it.
  let maxArtifact = requestedArtifact || 'plain_answer';
  if (forbiddenArtifacts.includes('itinerary') && strengthOf(maxArtifact) >= strengthOf('itinerary_patch')) {
    maxArtifact = 'trip_skeleton';
  }
  const itineraryForbidden = forbiddenArtifacts.includes('itinerary');

  // A canonical-plan artifact may be produced only when the canonical contract
  // actually asks for one. `plain_answer` + `optional` never does, no matter
  // how many days the traveler mentioned.
  let allowsCanonicalPlanArtifact = !itineraryForbidden
    && CANONICAL_PLAN_ARTIFACTS.includes(maxArtifact);

  // `preferred` exists for turns whose task family IS itinerary work but whose
  // wording never named the artifact. Those may still build one.
  if (!allowsCanonicalPlanArtifact
    && !itineraryForbidden
    && structurePolicy === 'preferred'
    && ITINERARY_EXECUTION_JOBS.includes(travelerJob)) {
    allowsCanonicalPlanArtifact = true;
    reasonCodes.push('itinerary_family_preferred');
  }

  // Tentative until sufficiency / patch gates below finalize the floor.
  let requiresCanonicalPlanArtifact = allowsCanonicalPlanArtifact
    && structurePolicy === 'required'
    && CANONICAL_PLAN_ARTIFACTS.includes(maxArtifact);

  if (legacyWantsItinerary && !allowsCanonicalPlanArtifact) {
    conflicts.push({
      field: 'requestedArtifact',
      understanding: maxArtifact,
      legacy: legacyIntent,
      resolution: itineraryForbidden
        ? 'legacy_artifact_prohibition_enforced'
        : 'legacy_artifact_escalation_blocked',
    });
    reasonCodes.push(itineraryForbidden
      ? 'legacy_artifact_prohibition_enforced'
      : 'legacy_artifact_escalation_blocked');
  }

  // ---- floor -----------------------------------------------------------
  // An explicitly requested artifact cannot be silently downgraded to prose by
  // a legacy branch that failed to notice it.
  const legacyDropsRequestedArtifact = requiresCanonicalPlanArtifact && !legacyWantsItinerary;
  if (legacyDropsRequestedArtifact) {
    conflicts.push({
      field: 'requestedArtifact',
      understanding: maxArtifact,
      legacy: legacyIntent,
      resolution: 'legacy_artifact_downgrade_blocked',
    });
    reasonCodes.push('legacy_artifact_downgrade_blocked');
  }

  // A patch needs something to patch. Without a prior ACCEPTED canonical plan a
  // "required patch" is not executable as a mutation. Draft skeletons do not count.
  const patchRequested = maxArtifact === 'itinerary_patch';
  const patchExecutable = patchRequested && hasPriorPlan === true;
  if (patchRequested && !hasPriorPlan) {
    reasonCodes.push('patch_without_prior_plan');
    // Without an accepted plan, do not force patch generation or retries.
    allowsCanonicalPlanArtifact = false;
    maxArtifact = 'plain_answer';
  }

  // Sufficiency is authoritative before artifact generation. A clarify decision
  // must not be overwritten by itinerary/full_trip floors downstream.
  const executionDecision = understanding?.executionDecision || null;
  const clarificationNeeded = understanding?.clarificationNeeded === true
    || executionDecision === DECISIONS.CLARIFY_BEFORE_PLAN
    || executionDecision === DECISIONS.CLARIFY_BEFORE_ACTION;
  if (clarificationNeeded) {
    allowsCanonicalPlanArtifact = false;
    maxArtifact = 'plain_answer';
    reasonCodes.push('sufficiency_clarify_blocks_artifact');
    if (executionDecision) reasonCodes.push(`sufficiency_${executionDecision}`);
  }

  requiresCanonicalPlanArtifact = allowsCanonicalPlanArtifact
    && structurePolicy === 'required'
    && CANONICAL_PLAN_ARTIFACTS.includes(maxArtifact)
    && !clarificationNeeded;

  const intentSource = conflicts.length > 0
    ? 'reconciled'
    : understanding
      ? (understanding.continuationOfActiveDecision ? 'active_decision' : 'turn_understanding')
      : 'deterministic_legacy';

  return Object.freeze({
    contractVersion: 1,

    // canonical semantics (owned by TurnUnderstanding)
    taskFamily: understanding?.taskFamily || null,
    travelerJob: travelerJob || null,
    requestedArtifact,
    forbiddenArtifacts: Object.freeze([...forbiddenArtifacts]),
    structurePolicy,
    destinationRelationship: understanding?.destinationRelationship || null,
    comparisonSelectionRequired: understanding?.comparisonSelectionRequired === true,
    actionableContingencyRequired: understanding?.actionableContingencyRequired === true,
    operationalSubjects: Object.freeze([...(understanding?.operationalSubjects || [])]),

    // continuity / refinement semantics
    continuationOfActiveDecision: understanding?.continuationOfActiveDecision === true,
    priorJob: understanding?.priorJob || null,
    topicShift: understanding?.topicShift === true,
    hasPriorPlan: hasPriorPlan === true,

    // constraint patch owned by this turn
    constraintPatch: Object.freeze([...(understanding?.explicitConstraints || [])]),
    softPreferencePatch: Object.freeze([...(understanding?.softPreferences || [])]),

    // ---- downstream ownership: what execution may and must do ----------
    maxArtifact,
    allowsCanonicalPlanArtifact,
    requiresCanonicalPlanArtifact,
    patchRequested,
    patchExecutable,
    executionDecision,
    clarificationNeeded: clarificationNeeded === true,
    materialMissingInformation: Object.freeze([...(understanding?.materialMissingInformation || [])]),

    intentSource,
    conflicts: Object.freeze(conflicts.map((c) => Object.freeze({ ...c }))),
    reasonCodes: Object.freeze(boundedCodes(reasonCodes)),
  });
}

/**
 * Bounded, privacy-safe diagnostic projection. Never carries raw traveler
 * language, supporting spans, or model prompts.
 */
function summarizeExecutionContract(contract) {
  if (!contract) return null;
  return {
    requestedArtifact: contract.requestedArtifact,
    forbiddenArtifacts: [...contract.forbiddenArtifacts],
    structurePolicy: contract.structurePolicy,
    destinationRelationship: contract.destinationRelationship,
    comparisonSelectionRequired: contract.comparisonSelectionRequired === true,
    actionableContingencyRequired: contract.actionableContingencyRequired === true,
    travelerJob: contract.travelerJob,
    taskFamily: contract.taskFamily,
    intentSource: contract.intentSource,
    allowsCanonicalPlanArtifact: contract.allowsCanonicalPlanArtifact,
    requiresCanonicalPlanArtifact: contract.requiresCanonicalPlanArtifact,
    reasonCodes: [...contract.reasonCodes],
    conflicts: contract.conflicts.map((c) => ({
      field: c.field,
      resolution: c.resolution,
    })),
  };
}

module.exports = {
  ARTIFACT_STRENGTH,
  CANONICAL_PLAN_ARTIFACTS,
  INTENT_SOURCES,
  ITINERARY_EXECUTION_INTENTS,
  ITINERARY_EXECUTION_JOBS,
  deriveExecutionContract,
  summarizeExecutionContract,
};
