'use strict';

const ROUTER_VERSION = 'trailie-gpt6-router';

const MODEL_ROUTES = Object.freeze({
  DETERMINISTIC: Object.freeze({ tier: 'deterministic', provider: null, model: null, reasoningEffort: null }),
  LUNA_LOW: Object.freeze({ tier: 'luna_low', provider: 'openai', model: 'gpt-6-luna', reasoningEffort: 'low' }),
  SOL_LOW: Object.freeze({ tier: 'sol_low', provider: 'openai', model: 'gpt-6-sol', reasoningEffort: 'low' }),
  SOL_MEDIUM: Object.freeze({ tier: 'sol_medium', provider: 'openai', model: 'gpt-6-sol', reasoningEffort: 'medium' }),
  ASTRA_MEDIUM: Object.freeze({ tier: 'astra_medium', provider: 'openai', model: 'gpt-6-astra', reasoningEffort: 'medium' }),
});

const DETERMINISTIC_FACT_TYPES = new Set([
  'entrance_fee',
  'sunrise_time',
  'fee_free_date',
  'alert_count',
  'coordinates',
  'opening_hours',
]);

const LUNA_INTENTS = new Set([
  'general_qa',
]);

function invalidInput(field) {
  const error = new TypeError(`Invalid Trailie routing input: ${field}`);
  error.code = 'trailie_router_input_invalid';
  return error;
}

function validateSignals(signals) {
  if (!signals || typeof signals !== 'object' || Array.isArray(signals)) {
    throw invalidInput('signals');
  }

  for (const field of ['tripDays', 'destinationCount', 'verticalCount', 'hardConstraintCount']) {
    const value = signals[field];
    if (value != null && (!Number.isInteger(value) || value < 0)) {
      throw invalidInput(field);
    }
  }
}

function selected(route, reasonCodes) {
  return Object.freeze({
    ...route,
    routerVersion: ROUTER_VERSION,
    reasonCodes: Object.freeze([...reasonCodes]),
  });
}

function isDeterministicRenderEligible(candidate) {
  return Boolean(
    candidate
    && candidate.eligible === true
    && candidate.exactValueAvailable === true
    && candidate.languageAddsValue === false
    && DETERMINISTIC_FACT_TYPES.has(candidate.factType)
  );
}

function isAstraEscalation(signals) {
  const history = signals.validationHistory;
  return signals.taskPhase === 'escalation'
    && history?.lastTier === 'sol_medium'
    && history?.lastValidationStatus === 'fail'
    && history?.sameModelRetryExhausted === true
    && history?.locallyRepairable === false;
}

function needsSolMedium(signals) {
  return ['simple_itinerary', 'full_trip', 'trip_refinement', 'live_in_trip_assistance'].includes(signals.intent)
    || signals.depth === 'planning'
    || signals.depth === 'deep'
    || (signals.tripDays || 0) >= 7
    || (signals.hardConstraintCount || 0) >= 2
    || signals.taskPhase === 'repair'
    || ((signals.destinationCount || 0) >= 2 && (signals.verticalCount || 0) >= 3)
    || signals.ambiguity === 'high';
}

function selectTrailieModelRoute(signals) {
  validateSignals(signals);

  if (isDeterministicRenderEligible(signals.deterministicRender)) {
    return selected(MODEL_ROUTES.DETERMINISTIC, ['exact_render_sufficient']);
  }

  if (isAstraEscalation(signals)) {
    return selected(MODEL_ROUTES.ASTRA_MEDIUM, ['sol_validation_escalation']);
  }

  const evidenceReason = signals.evidenceCompleteness === 'partial'
    ? ['evidence_incomplete_no_model_escalation']
    : [];

  if (needsSolMedium(signals)) {
    return selected(MODEL_ROUTES.SOL_MEDIUM, ['complex_planning', ...evidenceReason]);
  }

  if (
    LUNA_INTENTS.has(signals.intent)
    && signals.depth === 'quick'
    && (signals.hardConstraintCount || 0) === 0
    && signals.ambiguity !== 'high'
    && signals.evidenceCompleteness === 'complete'
  ) {
    return selected(MODEL_ROUTES.LUNA_LOW, ['lightweight_complete_evidence']);
  }

  return selected(MODEL_ROUTES.SOL_LOW, ['normal_generation', ...evidenceReason]);
}

module.exports = {
  MODEL_ROUTES,
  ROUTER_VERSION,
  selectTrailieModelRoute,
};
