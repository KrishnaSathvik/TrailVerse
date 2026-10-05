'use strict';

const {
  REPLACEMENT_SCENARIO_ID,
  REPLACEMENT_SCENARIO,
} = require('../replacementScenario');
const { LIVE_SCENARIO_MANIFEST, manifestStatus } = require('../liveScenarioManifest');
const { REVIEWED_PRIOR_EXPOSURE } = require('../priorCumulativeExposure');
const { projectFullRunBudget } = require('../fullRunBudgetProjection');
const { PREFLIGHT_VERSION } = require('../preflightVersion');

describe('Stage 14.7P — history, unauthorized replacement and feasibility', () => {
  test('defines the new replacement but keeps it unauthorized and out of the executable manifest', () => {
    expect(REPLACEMENT_SCENARIO_ID).toBe('basic-02-three-day-canonical-fix-validation-2');
    expect(REPLACEMENT_SCENARIO.executionAuthorized).toBe(false);
    expect(REPLACEMENT_SCENARIO.linkedFailedAttempts).toHaveLength(2);
    expect(LIVE_SCENARIO_MANIFEST.scenarios).not.toContain(REPLACEMENT_SCENARIO_ID);
    expect(manifestStatus({ isConsumedFn: () => false }).replacementScenarioExecutionAuthorized).toBe(false);
  });

  test('uses the approved cumulative exposure from all three consumed runs', () => {
    expect(REVIEWED_PRIOR_EXPOSURE).toEqual(expect.objectContaining({
      requests: 7,
      costUsd: 0.671058,
      inputTokens: 134519,
      outputTokens: 40202,
    }));
  });

  test('projects no remaining paid scenario after seven-day adjudication', () => {
    const projection = projectFullRunBudget({
      seed: {
        priorRequests: 5,
        priorConservativeCostUsd: 0.472758,
        priorInputTokens: 97714,
        priorOutputTokens: 27733,
      },
    });
    expect(projection.basis.scenarios.map((s) => s.scenarioId)).toEqual([]);
    expect(projection.sideEffects).toEqual({ scenarioMarkersWritten: 0, providerCalls: 0, providerCostUsd: 0 });
    expect(projection.minimumCapsForCompletePlan.applied).toBe(false);
  });

  test('invalidates earlier receipts in favor of 14.7R.1', () => {
    expect(PREFLIGHT_VERSION).toBe('14.7R.1');
  });
});
