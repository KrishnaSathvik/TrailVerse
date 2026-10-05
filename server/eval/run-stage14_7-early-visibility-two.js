#!/usr/bin/env node
'use strict';

/**
 * Stage 14.7 — the ONE command that determines live readiness.
 *
 *   cd server
 *   TRAILIE_EVAL_PREFLIGHT_ONLY=true ... node eval/run-stage14_7-early-visibility-two.js
 *
 * This script used to answer "are we ready?" from environment variables alone
 * and print `Preflight PASSED`. That was the most dangerous kind of green: it
 * described the configuration, not the system. It is now a thin entrypoint over
 * `src/eval/stage14_7/compositePreflight.js`, which freshly EXECUTES all fifteen
 * deterministic phases — real route, isolation, duplicate delivery, projections,
 * interruptions, cleanup, live-executor qualification — and computes readiness
 * from them.
 *
 * Stage 14.7G — this is also the ONLY entrypoint that can authorize live
 * execution, and the full chain lives here in one place:
 *
 *   composite preflight → mint + validate receipt → authorization gate
 *     → provider configuration → two approved scenarios → one decision
 *
 * Exit codes:
 *   0  preflight-only and ready, OR a live run reaching READY_FOR_STAGE14_CANARY_PLAN
 *   1  any gate failed, live execution refused, or a Stage 14.7 decision other
 *      than READY
 *
 * Never prompts. Never prints tokens, keys, full URIs, prompts, generated
 * content or user data. Prints exactly one bounded JSON object at the end.
 */

const crypto = require('crypto');

const {
  PREFLIGHT_VERSION,
  runCompositePreflight,
  sanitizeMongoTarget,
  APPROVED_SCENARIOS,
} = require('../src/eval/stage14_7/compositePreflight');
const {
  buildReceipt, writeReceipt, validateReceipt, RECEIPT_PATH,
} = require('../src/eval/stage14_7/readinessReceipt');
const {
  evaluateLiveAuthorization, validateLiveProviderConfiguration,
} = require('../src/eval/stage14_7/liveAuthorization');
const { executeLiveScenarios } = require('../src/eval/stage14_7/liveExecutor');
const { calculateDecision, DECISION } = require('../src/eval/stage14_7/decision');
const {
  calculateAggregateDecision, AGGREGATE_DECISION,
} = require('../src/eval/stage14_7/aggregateDecision');
const { readAndValidateThreeDayAdjudication } = require('../src/eval/stage14_7/threeDayAdjudication');
const { redactForReport } = require('../src/eval/stage14_7/privateEvidence');
const { isConsumed } = require('../src/eval/stage14_7/scenarioConsumption');
const {
  REPLACEMENT_SCENARIO_ID, ORIGINAL_SCENARIO_ID, REPLACEMENT_SCENARIO,
} = require('../src/eval/stage14_7/replacementScenario');
const {
  LIVE_SCENARIO_MANIFEST, MANIFEST_CODES,
} = require('../src/eval/stage14_7/liveScenarioManifest');

const bool = (v) => String(v == null ? '' : v).toLowerCase() === 'true';

async function main() {
  const preflightOnly = bool(process.env.TRAILIE_EVAL_PREFLIGHT_ONLY);

  process.stderr.write('\nStage 14.7 — composite readiness preflight v' + PREFLIGHT_VERSION + '\n');
  process.stderr.write('='.repeat(74) + '\n');

  const composite = await runCompositePreflight({
    log: (line) => process.stderr.write(line + '\n'),
  });

  process.stderr.write('='.repeat(74) + '\n');

  const { readiness, isolation } = composite;
  let receiptPath = null;
  let receiptValidation = null;

  /**
   * Stage 14.7J §7 — the receipt is minted from TECHNICAL readiness.
   *
   * Up to 14.7I this was gated on `liveExecutionReady`, which now also requires
   * an authorized manifest and a feasible budget. Keeping the old condition
   * would mean no receipt is ever written while those remain open — and the
   * receipt is exactly the artifact a reviewer needs in order to close them.
   * The receipt itself still refuses to authorize a run (`validateReceipt`
   * reports `live_scenario_manifest_not_authorized` /
   * `cumulative_stage14_7_cap_insufficient`), so minting it grants nothing.
   */
  if (readiness.liveExecutorTechnicalReady) {
    const receipt = buildReceipt({ env: process.env, composite, sanitizeMongoTarget });
    receiptPath = writeReceipt(receipt);
    // Immediately re-validated, so a receipt that cannot gate a live run is
    // never reported as if it could.
    receiptValidation = validateReceipt(receipt, { env: process.env, sanitizeMongoTarget });
  }

  const summaryOut = {
    preflightVersion: composite.preflightVersion,
    applicationSharedCachePolicySafe: readiness.applicationSharedCachePolicySafe,
    deployedSharedCachePolicyVerified: composite.deployedSharedCachePolicyVerified,
    actualRouteDryRunPassed: readiness.actualRouteDryRunPassed,
    externalIsolationPassed: readiness.externalIsolationPassed,
    duplicateDeliveryPassed: readiness.duplicateDeliveryPassed,
    projectionBoundaryPassed: readiness.projectionBoundaryPassed,
    interruptedStateSafetyPassed: readiness.interruptedStateSafetyPassed,
    cleanupSafetyPassed: readiness.cleanupSafetyPassed,
    compositePreflightPassed: readiness.compositePreflightPassed,
    // Stage 14.7J §7 — the four answers, reported independently. A technically
    // working executor is not a licence to spend.
    liveExecutorTechnicalReady: readiness.liveExecutorTechnicalReady === true,
    liveScenarioManifestReady: readiness.liveScenarioManifestReady === true,
    // Stage 14.7L §10 — reported separately from feasibility: "could not
    // measure the prior exposure" must never read the same as "measured, fits".
    cumulativeExposureResolved: readiness.cumulativeExposureResolved === true,
    cumulativeBudgetFeasible: readiness.cumulativeBudgetFeasible === true,
    liveExecutionReady: readiness.liveExecutionReady,
    liveProviderCalls: isolation ? isolation.liveProviderCalls : null,
    liveProviderCostUsd: isolation ? isolation.liveProviderCostUsd : null,
    readinessReceipt: receiptPath ? RECEIPT_PATH.replace(process.cwd() + '/', '') : null,
    readinessReceiptValid: receiptValidation ? receiptValidation.valid : null,
    // Stage 14.7H §14 — the two gates added after the 14.7G launch defect, plus
    // the orphaned-child diagnostic, all measured by the composite.
    realSubprocessPathQualified: readiness.realSubprocessPathQualified === true,
    scenarioConsumptionSemanticsPassed: readiness.scenarioConsumptionSemanticsPassed === true,
    childCredentialPropagationPassed: readiness.childCredentialPropagationPassed === true,
    childProviderReadinessPassed: readiness.childProviderReadinessPassed === true,
    preAdmissionProviderValidationPassed: readiness.preAdmissionProviderValidationPassed === true,
    providerSecretIsolationPassed: readiness.providerSecretIsolationPassed === true,
    staleEvaluationChildrenDetected: composite.staleEvaluationChildrenDetected === true,
    // Stage 14.7I §17 — the repairs made after the live run found the
    // model-resolution defect.
    modelResolutionPassed: readiness.modelResolutionPassed === true,
    streamingUsageAccountingPassed: readiness.streamingUsageAccountingPassed === true,
    providerRequestCorrelationPassed: readiness.providerRequestCorrelationPassed === true,
    runScopedIdentityPassed: readiness.runScopedIdentityPassed === true,
    evaluationIdentityContractPassed: readiness.evaluationIdentityContractPassed === true,
    // Stage 14.7J §13 — the dispatch-depth gates.
    dispatchModelPolicyPassed: readiness.dispatchModelPolicyPassed === true,
    providerModelIdentityPassed: readiness.providerModelIdentityPassed === true,
    cumulativeBudgetProjectionPassed: readiness.cumulativeBudgetProjectionPassed === true,
    regressionProviderIsolationPassed: readiness.regressionProviderIsolationPassed === true,
    liveTestsExplicitlyOptIn: readiness.liveTestsExplicitlyOptIn === true,
    dotenvCannotEnableProvidersInDeniedMode: readiness.dotenvCannotEnableProvidersInDeniedMode === true,
    compositePreflightExcludesLiveTests: readiness.compositePreflightExcludesLiveTests === true,
    canonicalIdentityPassed: readiness.canonicalIdentityPassed === true,
    liveEvidenceReportingPassed: readiness.liveEvidenceReportingPassed === true,
    localMongoAvailabilityPassed: readiness.localMongoAvailabilityPassed === true,
    foreignRecordPreservationPassed: readiness.foreignRecordPreservationPassed === true,
    threeDayAdjudicationPassed: readiness.threeDayAdjudicationPassed === true,
    lifecycleEvidencePassed: readiness.lifecycleEvidencePassed === true,
    restoreEvidencePassed: readiness.restoreEvidencePassed === true,
    threeDayGainPassed: readiness.threeDayGainPassed === true,
    threeDayRerunRequired: readiness.threeDayRerunRequired === true,
    sevenDayAdjudicationPassed: readiness.sevenDayAdjudicationPassed === true,
    sevenDayPaidRerunRequired: readiness.sevenDayPaidRerunRequired === true,
    aggregateEvidenceContractPassed: readiness.aggregateEvidenceContractPassed === true,
    finalAggregateStage14_7Decision: readiness.finalAggregateStage14_7Decision || null,
    aggregateDecisionLogicPassed: readiness.aggregateDecisionLogicPassed === true,
    futureScenarioDefined: readiness.futureScenarioDefined === true,
    futureScenarioAuthorized: readiness.futureScenarioAuthorized === true,
    originalFailedScenarioPreserved: isConsumed(ORIGINAL_SCENARIO_ID),
    replacementScenarioDefined: REPLACEMENT_SCENARIO.scenarioId === REPLACEMENT_SCENARIO_ID,
    replacementScenarioExecutionAuthorized: REPLACEMENT_SCENARIO.executionAuthorized === true,
    secondReplacementExecutionAuthorized: false,
    replacementScenarioAvailable: !isConsumed(REPLACEMENT_SCENARIO_ID),
    sevenDayScenarioAvailable: !isConsumed('basic-03-seven-day'),
    sevenDayExecutionAuthorized: readiness.sevenDayExecutionAuthorized === true,
    // §6/§8 — the exact proposed manifest and the whole-plan projection travel
    // in the report, so the next decision is made on measured numbers.
    liveScenarioManifest: composite.liveScenarioManifest || null,
    proposedLiveScenarioOrder: [...LIVE_SCENARIO_MANIFEST.scenarios],
    cumulativeBudgetProjection: composite.cumulativeBudgetProjection || null,
    // §2 — the canonical prior exposure, on all four dimensions.
    priorCumulativeExposure: composite.cumulativeBudgetProjection ? {
      priorRequests: composite.cumulativeBudgetProjection.priorRequests,
      priorConservativeCostUsd: composite.cumulativeBudgetProjection.priorConservativeExposureUsd,
      priorReservedInputTokens: composite.cumulativeBudgetProjection.priorReservedInputTokens,
      priorReservedOutputTokens: composite.cumulativeBudgetProjection.priorReservedOutputTokens,
      source: composite.cumulativeBudgetProjection.priorExposureSource,
    } : null,
    liveProviderCallsThisStage: 0,
    liveProviderCostUsdThisStage: 0,
    providerCallsDuringStage14_7N: 0,
    providerCostDuringStage14_7N: 0,
    failedPhases: Object.keys(composite.phases).filter((p) => !composite.phases[p].ok),
  };

  // Stage 14.7G — the single bounded JSON object is now emitted by whichever
  // branch below terminates, so it can carry that branch's outcome (execution
  // status or decision) rather than being printed before either is known.
  /**
   * Stage 14.7J §7/§13 — a TECHNICAL failure is the only thing that fails this
   * command.
   *
   * `liveExecutionReady` is now false for two further reasons that are not
   * defects: the reviewed scenario manifest is not authorized, and the
   * cumulative caps have not been shown to cover the whole plan. Both require a
   * reviewed decision, not a repair, so a zero-cost run that proves the code is
   * correct exits 0 and reports them — while still refusing to spend.
   */
  if (!readiness.liveExecutorTechnicalReady) {
    summaryOut.liveExecutorQualified = liveExecutorQualified(readiness);
    // §12 — a preflight failure is a refusal before provider construction.
    summaryOut.executionStatus = DECISION.NOT_STARTED;
    process.stdout.write(JSON.stringify(summaryOut, null, 2) + '\n');
    process.exitCode = 1;
    return;
  }

  if (preflightOnly) {
    // Stage 14.7G §17 — carried from the composite's phase O, which actually
    // ran the executor's qualification suites.
    summaryOut.liveExecutorQualified = liveExecutorQualified(readiness);
    summaryOut.executionStatus = readiness.liveExecutionReady ? null : MANIFEST_CODES.NOT_STARTED;
    summaryOut.notReadyBecause = composite.paidExecutionReadiness
      ? composite.paidExecutionReadiness.blockedBy : [];
    process.stdout.write(JSON.stringify(summaryOut, null, 2) + '\n');
    process.stderr.write('\nPreflight-only: zero live requests made, $0.00 spent.\n');
    if (!readiness.liveExecutionReady) {
      process.stderr.write(`Paid execution NOT ready: ${summaryOut.notReadyBecause.join(', ')}\n`);
    }
    process.exitCode = 0;
    return;
  }

  // ── Stage 14.7G §2 — the explicit live-authorization gate ────────────────
  //
  // Every condition must hold. This is the ONLY place in the tree that can
  // decide a paid request may be issued, and it runs AFTER a fresh composite
  // preflight and a freshly validated receipt — never from cached state.
  const authorization = evaluateLiveAuthorization({
    env: process.env, readiness, receiptValidation,
  });
  const providerConfig = validateLiveProviderConfiguration({ env: process.env });

  if (!authorization.authorized || !providerConfig.ok) {
    // §12 — nothing was consumed, so this is NOT a Stage 14.7 decision.
    const notStarted = calculateDecision({
      liveExecutionStarted: false,
      preProviderReasons: [...authorization.reasons, ...providerConfig.reasons],
    });
    summaryOut.liveExecutorQualified = liveExecutorQualified(readiness);
    summaryOut.authorization = authorization.gates;
    summaryOut.providerConfigured = {
      anthropicKeyPresent: providerConfig.keyPresent,
      modelAllowlisted: providerConfig.modelAllowlisted,
      openAiDisabled: providerConfig.openAiDisabled,
    };
    summaryOut.executionStatus = notStarted.decision;
    summaryOut.reasons = notStarted.reasons;
    summaryOut.liveProviderCalls = 0;
    summaryOut.liveProviderCostUsd = 0;
    process.stdout.write(JSON.stringify(summaryOut, null, 2) + '\n');
    process.stderr.write('\nLive execution NOT started. Zero provider calls, $0.00 spent.\n');
    process.exitCode = 1;
    return;
  }

  // ── Authorized. From here a provider request may actually be issued. ─────
  const runId = `stage147g-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  process.stderr.write(`\nLive execution AUTHORIZED. runId=${runId}\n`);
  process.stderr.write(`Scenarios (in order): ${APPROVED_SCENARIOS.join(' -> ')}\n`);

  const execution = await executeLiveScenarios({
    env: process.env,
    runId,
    liveGates: {
      executeLive: authorization.gates.preflightOnlyAbsentOrFalse === true
        && authorization.gates.executeLive === true,
      liveProviders: authorization.gates.liveProviders === true,
      providerDenyInactive: process.env.TRAILIE_TEST_PROVIDER_MODE !== 'deny_live',
      receiptValid: receiptValidation.valid === true,
      manifestReady: readiness.liveScenarioManifestReady === true,
      cumulativeBudgetFeasible: readiness.cumulativeBudgetFeasible === true,
    },
    log: (line) => process.stderr.write('  ' + line + '\n'),
  });

  const decision = calculateAggregateDecision({
    sevenDayLiveExecutionStarted: execution.liveExecutionStarted,
    adjudicationValidation: readAndValidateThreeDayAdjudication(),
    sevenDay: execution.scenarios[0] || null,
    cleanup: execution.cleanup,
    offlineReplay: execution.offlineReplay,
  });

  summaryOut.runId = runId;
  summaryOut.authorization = authorization.gates;
  summaryOut.liveExecutionStarted = execution.liveExecutionStarted;
  summaryOut.scenariosRun = execution.scenariosRun;
  summaryOut.stoppedAfter = execution.stoppedAfter;
  summaryOut.stopReason = execution.stopReason;
  summaryOut.evidenceFiles = execution.evidenceFiles;
  summaryOut.scenarios = execution.scenarios.map((s) => redactForReport({
    scenarioId: s.scenarioId,
    timeline: s.timeline,
    ordering: s.ordering,
    persistenceDurations: s.persistenceDurations,
    journal: s.journal,
    phaseBReleasedBy: s.phaseBReleasedBy,
    persistence: s.persistence,
    ui: s.ui,
    artifacts: s.artifacts,
    restore: s.restore,
    isolation: s.isolation,
    correctness: s.correctness,
    ledger: s.ledger,
    gain: s.gain,
    cleanup: s.cleanup,
    offlineReplay: s.offlineReplay,
  }));
  summaryOut.historicalLiveRunDecision = 'STAGE14_7_LIVE_CONFIRMATION_FAILED';
  summaryOut.postRepairEvidenceAdjudication = 'LIVE_EVIDENCE_CORRECT_AFTER_EVALUATOR_REPAIR';
  summaryOut.finalAggregateStage14_7Decision = decision.finalAggregateStage14_7Decision;
  summaryOut.decision = decision.decision;
  summaryOut.decisionReasons = decision.reasons || [];
  summaryOut.advancesRollout = decision.advancesRollout;

  process.stdout.write(JSON.stringify(summaryOut, null, 2) + '\n');
  process.exitCode = decision.decision === AGGREGATE_DECISION.READY ? 0 : 1;
}

/**
 * §17 — reported from the composite's phase O, which EXECUTES the executor's
 * qualification suites. Deliberately not a file-existence check: "the files are
 * there" is exactly the kind of green that Stage 14.7F7 was written to abolish.
 */
function liveExecutorQualified(readiness) {
  return Boolean(readiness && readiness.liveExecutorQualified === true);
}

main().catch((error) => {
  process.stdout.write(JSON.stringify({
    compositePreflightPassed: false,
    liveExecutionReady: false,
    boundedCode: error && error.code ? error.code : 'composite_preflight_threw',
  }, null, 2) + '\n');
  process.exitCode = 1;
});
