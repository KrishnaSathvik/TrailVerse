'use strict';

let identityModule = null;
try { identityModule = require('../identityEvidence'); } catch { identityModule = null; }
let recoveryModule = null;
try { recoveryModule = require('../historicalSevenDayEvidence'); } catch { recoveryModule = null; }
let adjudicationModule = null;
try { adjudicationModule = require('../sevenDayAdjudication'); } catch { adjudicationModule = null; }
const { resolvePriorCumulativeExposure } = require('../priorCumulativeExposure');
const {
  calculateAggregateDecision, calculateAdjudicatedAggregateDecision, AGGREGATE_DECISION,
} = require('../aggregateDecision');
const { manifestStatus, LIVE_SCENARIO_MANIFEST } = require('../liveScenarioManifest');
const { PREFLIGHT_VERSION } = require('../preflightVersion');

describe('Stage 14.7R — exact assistant identity evidence', () => {
  test('requires six attributable component snapshots, not a broad boolean', () => {
    expect(identityModule).not.toBeNull();
    const { evaluateIdentityEvidence } = identityModule;
    expect(evaluateIdentityEvidence({ identityStable: true })).toEqual(expect.objectContaining({
      responseIdentityStable: false,
      numericMessageIdStable: false,
      messageTimestampStable: false,
      assistantSlotStable: false,
      identityEvidenceComplete: false,
    }));
  });

  test('proves numeric ID, timestamp, slot and response identity independently', () => {
    expect(identityModule).not.toBeNull();
    const { REQUIRED_IDENTITY_SOURCES, evaluateIdentityEvidence } = identityModule;
    const snapshots = REQUIRED_IDENTITY_SOURCES.map((source) => ({
      source,
      responseId: 'response-1', responseVersion: 1,
      assistantMessageId: 1234, assistantMessageIdType: 'number',
      assistantMessageTimestamp: '2026-08-06T20:17:13.000Z', assistantSlotIndex: 1,
    }));
    expect(evaluateIdentityEvidence({ snapshots })).toEqual(expect.objectContaining({
      responseIdentityStable: true,
      numericMessageIdStable: true,
      messageTimestampStable: true,
      assistantSlotStable: true,
      identityEvidenceComplete: true,
    }));
  });
});

describe('Stage 14.7R — historical recovery and bounded adjudication', () => {
  test('promotes the seven-day ledger into the canonical four-dimensional exposure', () => {
    expect(resolvePriorCumulativeExposure()).toEqual(expect.objectContaining({
      resolved: true,
      exposure: { requests: 7, inputTokens: 134519, outputTokens: 40202, costUsd: 0.671058 },
    }));
  });
  test('derives the exact seven-call cumulative exposure without rewriting history', () => {
    expect(recoveryModule).not.toBeNull();
    expect(recoveryModule.buildHistoricalSevenDayReconciliation()).toEqual(expect.objectContaining({
      cumulativeExposure: {
        requests: 7, inputTokens: 134519, outputTokens: 40202, costUsd: 0.671058,
      },
      exactReconciliation: true,
      cacheReconciliation: expect.objectContaining({
        structuredAttempt: expect.objectContaining({ recovered: false, evidenceSource: 'historical_not_retained' }),
        proseAttempt: expect.objectContaining({ recovered: false, evidenceSource: 'historical_not_retained' }),
      }),
      identityReconciliation: expect.objectContaining({
        identityEvidenceComplete: false,
        evidenceSource: 'historical_not_retained',
      }),
    }));
  });

  test('permits only an explicit, cap-safe, replay-proven historical limitation', () => {
    expect(adjudicationModule).not.toBeNull();
    const adjudication = adjudicationModule.buildSevenDayAdjudication();
    expect(adjudication).toEqual(expect.objectContaining({
      historicalDecision: 'STAGE14_7_LIVE_CONFIRMATION_FAILED',
      adjudicationStatus: 'LIVE_EVIDENCE_CORRECT_AFTER_EVIDENCE_CONTRACT_REPAIR',
      correctnessPassed: true,
      persistencePassed: true,
      lifecyclePassed: true,
      restorePassed: true,
      replayPassed: true,
      cleanupPassed: true,
      gainPassed: true,
      evidenceContractPassed: true,
      requiresPaidSevenDayRerun: false,
    }));
    expect(adjudication.historicalLimitations).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'provider_cache_usage', status: 'historical_not_retained' }),
      expect.objectContaining({ field: 'assistant_message_identity', status: 'historical_not_retained' }),
    ]));
  });

  test('closes paid execution and computes readiness only from both adjudications', () => {
    const seven = adjudicationModule.buildSevenDayAdjudication();
    const result = calculateAggregateDecision({
      sevenDayLiveExecutionStarted: true,
      adjudicationValidation: { valid: true, adjudication: { gainThresholdPassed: true } },
      sevenDayAdjudicationValidation: { valid: true, adjudication: seven },
      sevenDay: {
        hardInvariantsPassed: true,
        capsRespected: true, restorePassed: true, offlineReplayPassed: true, cleanupPassed: true,
        gain: seven.gain,
      },
    });
    expect(result).toEqual(expect.objectContaining({
      productionCorrectnessPassed: true,
      performanceGainPassed: true,
      evidenceContractPassed: true,
      aggregateDecision: AGGREGATE_DECISION.READY,
    }));
    expect(typeof calculateAdjudicatedAggregateDecision).toBe('function');
    expect(calculateAdjudicatedAggregateDecision({
      threeDayValidation: { valid: true, adjudication: { gainThresholdPassed: true } },
      sevenDayValidation: { valid: true, adjudication: seven },
    })).toEqual(expect.objectContaining({
      finalAggregateStage14_7Decision: AGGREGATE_DECISION.READY,
      evidenceContractPassed: true,
    }));
    expect(LIVE_SCENARIO_MANIFEST.scenarios).toEqual([]);
    expect(manifestStatus()).toEqual(expect.objectContaining({
      sevenDayAdjudicationPassed: true,
      sevenDayPaidRerunRequired: false,
      sevenDayExecutionAuthorized: false,
      liveExecutionReady: false,
    }));
    expect(PREFLIGHT_VERSION).toBe('14.7R.1');
  });
});
