'use strict';

const fs = require('fs');

const {
  ADJUDICATION_PATH,
  buildThreeDayAdjudication,
  readAndValidateThreeDayAdjudication,
} = require('../threeDayAdjudication');
const {
  AGGREGATE_CONFIRMATION_MANIFEST,
  aggregateManifestStatus,
} = require('../aggregateConfirmationManifest');
const { projectFullRunBudget } = require('../fullRunBudgetProjection');
const { calculateAggregateDecision, AGGREGATE_DECISION } = require('../aggregateDecision');
const { REPLACEMENT_SCENARIO, REPLACEMENT_SCENARIO_ID } = require('../replacementScenario');
const { PREFLIGHT_VERSION } = require('../preflightVersion');
const { assertLiveScenarioManifestAuthorized } = require('../liveScenarioManifest');
const { HASHED_FILES } = require('../readinessReceipt');

describe('Stage 14.7Q — adjudicated three-day plus remaining seven-day', () => {
  test('derives the private adjudication from preserved live and replay evidence', () => {
    const expected = buildThreeDayAdjudication();
    const stored = JSON.parse(fs.readFileSync(ADJUDICATION_PATH, 'utf8'));
    expect(stored).toEqual(expected);
    expect(stored).toEqual(expect.objectContaining({
      sourceRunId: 'stage147g-mshqzkal-cda9db',
      scenarioId: 'basic-02-three-day-model-fix-validation-1',
      historicalDecision: 'STAGE14_7_LIVE_CONFIRMATION_FAILED',
      adjudicationStatus: 'LIVE_EVIDENCE_CORRECT_AFTER_EVALUATOR_REPAIR',
      providerItineraryValid: true,
      frozenPlanStable: true,
      lifecycleJournalMatches: true,
      persistencePassed: true,
      restoreHashMatches: true,
      restorePlanMatches: true,
      offlineReplayPassed: true,
      cleanupPassed: true,
      foreignRecordPreservationPassed: true,
      localMongoAvailabilityPassed: true,
      absoluteGainMs: 46213.15,
      relativeGain: 0.5517,
      gainThresholdPassed: true,
      productionItineraryDefectFound: false,
      evaluatorDefectsFound: true,
      requiresPaidThreeDayRerun: false,
    }));
    expect(stored.evidenceLimitations).toEqual({
      providerRequestIds: 'historical_not_retained',
      sdkRequestModel: 'historical_not_retained',
    });
    expect(stored.providerCorrelation).toEqual(expect.objectContaining({
      authorizedProviderAttempts: 2,
      providerHttpRequests: 2,
      unaccountedHttpRequests: 0,
      ledgerModel: 'claude-sonnet-5',
      modelStable: true,
      successfulProviderResponses: 2,
    }));
    expect(readAndValidateThreeDayAdjudication()).toEqual(expect.objectContaining({ valid: true }));
  });

  test('fails closed when the adjudication is missing or differs from its evidence derivation', () => {
    expect(readAndValidateThreeDayAdjudication({ readArtifact: () => null })).toEqual(expect.objectContaining({
      valid: false, boundedCode: 'three_day_adjudication_invalid',
    }));
    expect(readAndValidateThreeDayAdjudication({
      readArtifact: () => ({ ...buildThreeDayAdjudication(), absoluteGainMs: 1 }),
    })).toEqual(expect.objectContaining({ valid: false, boundedCode: 'three_day_adjudication_invalid' }));

    const runnerGate = assertLiveScenarioManifestAuthorized({
      requestedScenarios: ['basic-03-seven-day'],
      isConsumedFn: (id) => id === 'basic-02-three-day'
        || id === 'basic-02-three-day-model-fix-validation-1',
      adjudicationValidator: () => ({ valid: false }),
    });
    expect(runnerGate).toEqual(expect.objectContaining({
      authorized: false,
      decision: 'LIVE_EXECUTION_NOT_STARTED',
      boundedCode: 'three_day_adjudication_invalid',
    }));
  });

  test('preserves all three failed histories and closes paid execution', () => {
    expect(AGGREGATE_CONFIRMATION_MANIFEST.historicalLiveRunDecisions).toEqual([
      expect.objectContaining({ scenarioId: 'basic-02-three-day', consumed: true }),
      expect.objectContaining({ scenarioId: 'basic-02-three-day-model-fix-validation-1', consumed: true }),
      expect.objectContaining({ scenarioId: 'basic-03-seven-day', consumed: true }),
    ]);
    expect(AGGREGATE_CONFIRMATION_MANIFEST.historicalLiveRunDecisions.every(
      (row) => row.decision === 'STAGE14_7_LIVE_CONFIRMATION_FAILED',
    )).toBe(true);
    expect(REPLACEMENT_SCENARIO.executionAuthorized).toBe(false);
    expect(AGGREGATE_CONFIRMATION_MANIFEST.remainingLiveExecution).toEqual([]);
    expect(AGGREGATE_CONFIRMATION_MANIFEST.remainingLiveExecution).not.toContain(REPLACEMENT_SCENARIO_ID);
    expect(AGGREGATE_CONFIRMATION_MANIFEST.secondReplacement).toEqual(expect.objectContaining({
      defined: true, executionAuthorized: false, consumed: false, requiredForFinalConfirmation: false,
    }));
    expect(aggregateManifestStatus()).toEqual(expect.objectContaining({
      sevenDayScenarioAvailable: false,
      sevenDayExecutionAuthorized: false,
      executionAuthorized: false,
      refusals: [],
    }));
  });

  test('projects the exact completed cumulative exposure with no remaining scenario', () => {
    const p = projectFullRunBudget({ atDate: '2026-08-05' });
    expect(p.basis.scenarios.map((row) => row.scenarioId)).toEqual([]);
    expect(p).toEqual(expect.objectContaining({
      priorRequests: 7,
      priorConservativeExposureUsd: 0.671058,
      priorReservedInputTokens: 134519,
      priorReservedOutputTokens: 40202,
      sevenDayWorstCaseRequests: null,
      sevenDayWorstCaseExposureUsd: null,
      sevenDayWorstCaseInputTokens: null,
      sevenDayWorstCaseOutputTokens: null,
      cumulativeProjectedRequests: 7,
      cumulativeProjectedCostUsd: 0.671058,
      cumulativeProjectedInputTokens: 134519,
      cumulativeProjectedOutputTokens: 40202,
      cumulativeBudgetFeasible: true,
      blockingCaps: [],
    }));
  });

  test('aggregate decision requires adjudication and combines it with seven-day evidence', () => {
    const invalid = calculateAggregateDecision({
      sevenDayLiveExecutionStarted: false,
      adjudicationValidation: { valid: false },
    });
    expect(invalid).toEqual(expect.objectContaining({
      decision: 'LIVE_EXECUTION_NOT_STARTED', boundedCode: 'three_day_adjudication_invalid',
    }));

    const safeSevenDay = {
      scenarioId: 'basic-03-seven-day',
      hardInvariantsPassed: true,
      gain: { measurable: true, meetsAbsolute: true, meetsRelative: true, qualifies: true },
      capsRespected: true,
      restorePassed: true,
      offlineReplayPassed: true,
      cleanupPassed: true,
    };
    const incomplete = calculateAggregateDecision({
      sevenDayLiveExecutionStarted: true,
      adjudicationValidation: { valid: true, adjudication: buildThreeDayAdjudication() },
      sevenDay: safeSevenDay,
    });
    expect(incomplete).toEqual(expect.objectContaining({
      productionCorrectnessPassed: true,
      performanceGainPassed: true,
      evidenceContractPassed: false,
      aggregateDecision: AGGREGATE_DECISION.FAILED,
      decision: AGGREGATE_DECISION.FAILED,
    }));
    expect(calculateAggregateDecision({
      sevenDayLiveExecutionStarted: true,
      adjudicationValidation: { valid: true, adjudication: buildThreeDayAdjudication() },
      sevenDayAdjudicationValidation: { valid: true, adjudication: { evidenceContractPassed: true } },
      sevenDay: { ...safeSevenDay, gain: { measurable: true, meetsAbsolute: false, meetsRelative: true, qualifies: false } },
    }).decision).toBe(AGGREGATE_DECISION.CORRECT_BUT_GAIN_INSUFFICIENT);
    expect(calculateAggregateDecision({
      sevenDayLiveExecutionStarted: true,
      adjudicationValidation: { valid: true, adjudication: buildThreeDayAdjudication() },
      sevenDayAdjudicationValidation: { valid: true, adjudication: { evidenceContractPassed: true } },
      sevenDay: { ...safeSevenDay, restorePassed: false },
    }).decision).toBe(AGGREGATE_DECISION.FAILED);
  });

  test('mints the new preflight contract', () => {
    expect(PREFLIGHT_VERSION).toBe('14.7R.1');
    expect(HASHED_FILES).toEqual(expect.arrayContaining([
      'server/src/eval/stage14_7/threeDayAdjudication.js',
      'server/src/eval/stage14_7/aggregateConfirmationManifest.js',
      'server/src/eval/stage14_7/aggregateDecision.js',
      'server/src/eval/stage14_7/sevenDayAdjudication.js',
      'server/src/eval/stage14_7/requiredEvidenceManifest.js',
      'artifacts/private/stage14_7-three-day-adjudication.json',
      'artifacts/private/stage14_7-seven-day-adjudication.json',
      'artifacts/private/stage14_7P-captured-replay.json',
      'server/eval/run-stage14_7-early-visibility-two.js',
      'server/src/eval/trailie/usageAccounting.js',
      'server/package-lock.json',
      'next-frontend/package-lock.json',
    ]));
  });
});
