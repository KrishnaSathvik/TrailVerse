'use strict';

/**
 * Material information-sufficiency for Trailie turn execution.
 *
 * Travel judgment stays with the model. This module only decides whether the
 * deterministic system should commit a mutation, ask one focused clarification,
 * or let a useful answer proceed without an intake questionnaire.
 *
 * Decisions are semantic execution outcomes — never traveler-facing templates.
 */

const DECISIONS = Object.freeze({
  ANSWER_NOW: 'answer_now',
  ANSWER_AND_REFINE: 'answer_and_refine',
  SKETCH_NOW: 'sketch_now',
  PLAN_NOW: 'plan_now',
  CLARIFY_BEFORE_PLAN: 'clarify_before_plan',
  EDIT_NOW: 'edit_now',
  CLARIFY_BEFORE_ACTION: 'clarify_before_action',
  PUSHBACK: 'pushback',
  ADAPT: 'adapt',
});

const EXPLORATORY = /\b(?:what would|what might|how would|how might|look like|rough (?:idea|sketch)|hypothetical|for example|suppose|imagine)\b/i;
const COMMITTED_PLAN = /\b(?:build|create|give|make|write|put together|draw up|map out|lay out|draft|design|plan)\b[\s\S]{0,48}\b(?:me|us|my|our)?\s*(?:a |an |the |my |our )?(?:\d+|two|three|four|five|six|seven)?[- ]?(?:day|days)?\s*(?:trip|itinerary|plan)?\b/i;
const COMPARISON = /\b(?:or|vs\.?|versus|compare|between)\b/i;
const DISCOVERY = /\b(?:where (?:should|can|could)|recommend|suggest|best (?:park|place|destination)|looking for)\b/i;
const FACTUAL = /\b(?:can i|is it|does|do you|how (?:far|long|much)|when (?:is|does)|what (?:time|is)|open|closed|drive to|access)\b/i;

function textOf(input) {
  return String(input?.userText || input?.text || '').trim();
}

function hasDestination(input) {
  const meta = input?.metadata || {};
  const trip = input?.tripContext || meta.activeTripContext || {};
  return Boolean(
    meta.parkCode
    || meta.resolvedPlaceName
    || meta.parkName
    || meta.intakeParkName
    || input?.constraints?.parkCode
    || (Array.isArray(input?.destinations) && input.destinations.length > 0)
    || (Array.isArray(input?.allExtractedParks) && input.allExtractedParks.length > 0)
    || trip.lockedPlanDestination
    || trip.primaryDestination
    || trip.recommendedOption
  );
}

function knownFacts(input) {
  const constraints = input?.constraints || {};
  const state = constraints.planningState || {};
  const trip = input?.tripContext || input?.metadata?.activeTripContext || {};
  const dates = constraints.dates || state.time || {};
  return {
    destination: hasDestination(input),
    durationDays: Number(dates.numDays || state.time?.numDays || input?.temporalScope?.durationDays) || null,
    visitWindow: Boolean(dates.start || dates.end || input?.temporalScope?.visitWindow),
    lodging: Boolean(state.lodging?.base || state.lodging?.confirmed || trip.lodging),
    party: Boolean(constraints.groupSize || state.travelers?.partySize || state.travelers?.hasChildren != null),
    mobility: Boolean(constraints.mobility || state.mobility),
    fitness: Boolean(constraints.fitness || state.activityPreferences?.hiking),
    exposure: constraints.avoidExposure === true || state.preferences?.avoidExposure === true,
    savedPlan: Boolean(input?.priorPlan?.days?.length || input?.canonicalPlan?.days?.length),
  };
}

function isExploratory(text) {
  return EXPLORATORY.test(text);
}

function isCommittedPlanRequest(text, input) {
  if (input?.askedToProduceTripArtifact === true && !isExploratory(text)) return true;
  if (isExploratory(text)) return false;
  return COMMITTED_PLAN.test(text) && /\b(?:day|days|itinerary|trip|plan)\b/i.test(text);
}

function materialGapsForCommittedPlan(facts, text) {
  const gaps = [];
  if (!facts.destination) {
    gaps.push({
      concept: 'destination',
      whyItMatters: 'Without a place to plan, a committed itinerary would invent geography.',
    });
  }
  // Duration is material when the traveler did not state trip length and no
  // saved plan already establishes day count. Exact calendar dates are optional
  // unless the request depends on a dated window.
  if (!facts.durationDays && !facts.visitWindow && !facts.savedPlan) {
    if (!/\b(?:weekend|long weekend|\d+\s*[-–]?\s*days?|one week|two weeks)\b/i.test(text)) {
      gaps.push({
        concept: 'trip_length',
        whyItMatters: 'Trip length changes how many days can be committed safely.',
      });
    }
  }
  return gaps;
}

/**
 * @returns {{
 *   decision: string,
 *   materialMissingInformation: Array<{concept: string, whyItMatters: string}>,
 *   unresolvedReferences: Array<{type: string, reference: string}>,
 *   clarificationNeeded: boolean,
 *   reasonCodes: string[],
 * }}
 */
function resolveTurnSufficiencyDecision(input = {}) {
  const text = textOf(input);
  const facts = knownFacts(input);
  const unresolvedReferences = Array.isArray(input.unresolvedReferences)
    ? input.unresolvedReferences.filter(Boolean)
    : [];
  const actionUnresolved = input.actionTargetResolved === false
    || unresolvedReferences.some((ref) => ref?.type === 'action_target' || ref?.type === 'temporal');

  if (actionUnresolved) {
    return {
      decision: DECISIONS.CLARIFY_BEFORE_ACTION,
      materialMissingInformation: [],
      unresolvedReferences,
      clarificationNeeded: true,
      reasonCodes: ['action_target_unresolved'],
    };
  }

  if (input.pushbackRecommended === true) {
    return {
      decision: DECISIONS.PUSHBACK,
      materialMissingInformation: [],
      unresolvedReferences,
      clarificationNeeded: false,
      reasonCodes: ['unrealistic_trip_pushback'],
    };
  }

  const artifact = input.requestedArtifact || null;
  const isPatch = artifact === 'itinerary_patch' || input.isRefinement === true || input.adaptExisting === true;
  if (isPatch && (facts.savedPlan || input.hasPriorPlan === true)) {
    return {
      decision: input.adaptExisting === true ? DECISIONS.ADAPT : DECISIONS.EDIT_NOW,
      materialMissingInformation: [],
      unresolvedReferences,
      clarificationNeeded: false,
      reasonCodes: ['saved_plan_mutation'],
    };
  }
  if (isPatch && !facts.savedPlan && input.hasPriorPlan !== true) {
    // "Redo day two" with only a draft / no saved itinerary — do not invent a plan.
    return {
      decision: DECISIONS.CLARIFY_BEFORE_ACTION,
      materialMissingInformation: [],
      unresolvedReferences,
      clarificationNeeded: true,
      reasonCodes: ['patch_without_saved_plan'],
    };
  }

  if (artifact === 'comparison' || (COMPARISON.test(text) && !isCommittedPlanRequest(text, input))) {
    return {
      decision: DECISIONS.ANSWER_AND_REFINE,
      materialMissingInformation: [],
      unresolvedReferences,
      clarificationNeeded: false,
      reasonCodes: ['comparison_answer_first'],
    };
  }

  if (artifact === 'plain_answer' || artifact === 'none' || (!artifact && FACTUAL.test(text) && !isCommittedPlanRequest(text, input))) {
    if (DISCOVERY.test(text) && !isCommittedPlanRequest(text, input)) {
      return {
        decision: DECISIONS.ANSWER_NOW,
        materialMissingInformation: [],
        unresolvedReferences,
        clarificationNeeded: false,
        reasonCodes: ['discovery_answer_now'],
      };
    }
    return {
      decision: DECISIONS.ANSWER_NOW,
      materialMissingInformation: [],
      unresolvedReferences,
      clarificationNeeded: false,
      reasonCodes: ['informational_answer_now'],
    };
  }

  if (isExploratory(text) && (facts.destination || DISCOVERY.test(text) || /\bin\b/i.test(text))) {
    return {
      decision: DECISIONS.SKETCH_NOW,
      materialMissingInformation: [],
      unresolvedReferences,
      clarificationNeeded: false,
      reasonCodes: ['exploratory_sketch'],
    };
  }

  if (isCommittedPlanRequest(text, input) || artifact === 'itinerary' || artifact === 'trip_skeleton') {
    if (facts.savedPlan && facts.destination) {
      return {
        decision: DECISIONS.PLAN_NOW,
        materialMissingInformation: [],
        unresolvedReferences,
        clarificationNeeded: false,
        reasonCodes: ['saved_context_sufficient'],
      };
    }
    const gaps = materialGapsForCommittedPlan(facts, text);
    if (gaps.length > 0) {
      return {
        decision: DECISIONS.CLARIFY_BEFORE_PLAN,
        materialMissingInformation: gaps.slice(0, 2),
        unresolvedReferences,
        clarificationNeeded: true,
        reasonCodes: ['material_gap_before_commit'],
      };
    }
    return {
      decision: DECISIONS.PLAN_NOW,
      materialMissingInformation: [],
      unresolvedReferences,
      clarificationNeeded: false,
      reasonCodes: ['committed_plan_sufficient'],
    };
  }

  if (DISCOVERY.test(text)) {
    return {
      decision: DECISIONS.ANSWER_NOW,
      materialMissingInformation: [],
      unresolvedReferences,
      clarificationNeeded: false,
      reasonCodes: ['discovery_answer_now'],
    };
  }

  return {
    decision: DECISIONS.ANSWER_NOW,
    materialMissingInformation: [],
    unresolvedReferences,
    clarificationNeeded: false,
    reasonCodes: ['default_answer_now'],
  };
}

module.exports = {
  DECISIONS,
  resolveTurnSufficiencyDecision,
  knownFacts,
  isExploratory,
  isCommittedPlanRequest,
};
