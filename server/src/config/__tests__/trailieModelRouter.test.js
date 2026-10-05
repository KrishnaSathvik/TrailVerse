'use strict';

const {
  MODEL_ROUTES,
  selectTrailieModelRoute,
} = require('../trailieModelRouter');

const base = Object.freeze({
  intent: 'general_qa', depth: 'standard', tripDays: 0,
  destinationCount: 1, verticalCount: 1, hardConstraintCount: 0,
  ambiguity: 'low', evidenceCompleteness: 'complete',
  validationHistory: null, taskPhase: 'initial',
});

describe('WP9 deterministic model router', () => {
  test('uses no LLM only for a narrow exact-render fact where language adds no value', () => {
    expect(selectTrailieModelRoute({
      ...base,
      deterministicRender: {
        eligible: true, exactValueAvailable: true,
        factType: 'entrance_fee', languageAddsValue: false,
      },
    })).toMatchObject(MODEL_ROUTES.DETERMINISTIC);
  });

  test.each(['entrance_fee', 'sunrise_time', 'fee_free_date', 'alert_count', 'coordinates', 'opening_hours'])
    ('allows the bounded deterministic fact type %s', (factType) => {
      expect(selectTrailieModelRoute({
        ...base,
        deterministicRender: { eligible: true, exactValueAvailable: true, factType, languageAddsValue: false },
      }).tier).toBe('deterministic');
    });

  test.each([
    [{ eligible: false, exactValueAvailable: true, factType: 'entrance_fee', languageAddsValue: false }, 'sol_low'],
    [{ eligible: true, exactValueAvailable: false, factType: 'entrance_fee', languageAddsValue: false }, 'sol_low'],
    [{ eligible: true, exactValueAvailable: true, factType: 'overview', languageAddsValue: false }, 'sol_low'],
    [{ eligible: true, exactValueAvailable: true, factType: 'entrance_fee', languageAddsValue: true }, 'sol_low'],
  ])('does not overuse deterministic rendering (%o)', (deterministicRender, tier) => {
    expect(selectTrailieModelRoute({ ...base, deterministicRender }).tier).toBe(tier);
  });

  test.each(['general_qa'])
    ('routes lightweight complete-evidence %s to Luna low', (intent) => {
      expect(selectTrailieModelRoute({ ...base, intent, depth: 'quick' })).toMatchObject(MODEL_ROUTES.LUNA_LOW);
    });

  test.each(['compare', 'destination_discovery', 'place_discovery'])
    ('routes normal %s to Terra low', (intent) => {
      expect(selectTrailieModelRoute({ ...base, intent })).toMatchObject(MODEL_ROUTES.SOL_LOW);
    });

  test('keeps normal-depth general Q&A on Terra low instead of expanding Luna', () => {
    expect(selectTrailieModelRoute(base)).toMatchObject(MODEL_ROUTES.SOL_LOW);
  });

  test.each([
    ['deep depth', { depth: 'deep' }],
    ['seven days', { tripDays: 7 }],
    ['multiple hard constraints', { hardConstraintCount: 2 }],
    ['deterministic repair', { taskPhase: 'repair' }],
    ['multi-destination and cross-vertical', { destinationCount: 2, verticalCount: 3 }],
    ['high ambiguity', { ambiguity: 'high' }],
  ])('routes %s to Terra medium', (_label, change) => {
    expect(selectTrailieModelRoute({ ...base, ...change })).toMatchObject(MODEL_ROUTES.SOL_MEDIUM);
  });

  test('incomplete evidence does not escalate model capability', () => {
    const selected = selectTrailieModelRoute({ ...base, evidenceCompleteness: 'partial' });
    expect(selected).toMatchObject(MODEL_ROUTES.SOL_LOW);
    expect(selected.reasonCodes).toContain('evidence_incomplete_no_model_escalation');
  });

  test('selects Sol medium only after Terra failure and exhausted same-model retry', () => {
    expect(selectTrailieModelRoute({
      ...base,
      taskPhase: 'escalation',
      validationHistory: {
        lastTier: 'sol_medium', lastValidationStatus: 'fail',
        sameModelRetryExhausted: true, locallyRepairable: false,
      },
    })).toMatchObject(MODEL_ROUTES.ASTRA_MEDIUM);
  });

  test('never selects Sol as an initial route, even for the hardest input', () => {
    expect(selectTrailieModelRoute({
      ...base, depth: 'deep', tripDays: 21,
      destinationCount: 5, verticalCount: 6, hardConstraintCount: 8,
    })).toMatchObject(MODEL_ROUTES.SOL_MEDIUM);
  });

  test('fails closed on invalid routing counts instead of silently widening', () => {
    expect(() => selectTrailieModelRoute({ ...base, tripDays: -1 }))
      .toThrow(expect.objectContaining({ code: 'trailie_router_input_invalid' }));
  });
});

test.each(['simple_itinerary', 'full_trip', 'trip_refinement', 'live_in_trip_assistance'])('stateful %s uses Sol medium', intent => { expect(selectTrailieModelRoute({ ...base, intent })).toMatchObject(MODEL_ROUTES.SOL_MEDIUM); });

test.each(['destination_discovery', 'place_discovery', 'compare'])('quick %s still uses Sol judgment', intent => { expect(selectTrailieModelRoute({ ...base, intent, depth: 'quick' })).toMatchObject(MODEL_ROUTES.SOL_LOW); });
