'use strict';

/**
 * Stage 14.7F7 §15 — the cryptographic readiness receipt.
 *
 * A composite preflight proves readiness for the tree AS IT WAS WHEN IT RAN. The
 * gap this closes is the one between "preflight passed" and "the live run
 * happened": edit the persistence controller, the SSE parser or the cost caps in
 * between, and a stale green result would still authorize spending money against
 * code nobody verified.
 *
 * So the receipt fingerprints every load-bearing file plus the configuration
 * that bounds the run, and the live runner refuses to proceed when any of it
 * moved. It contains NO secrets: hashes, sanitized targets, caps and ids only.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SERVER_ROOT = path.resolve(__dirname, '../../..');
const REPO_ROOT = path.resolve(SERVER_ROOT, '..');

// Stage 14.7K §2/§9 — the authorized manifest and the reviewed cumulative caps
// are both receipt-covered, so a change to either invalidates the receipt.
const { LIVE_SCENARIO_MANIFEST } = require('./liveScenarioManifest');
const { CUMULATIVE_CAPS: BUDGET_CAPS } = require('./fullRunBudgetProjection');
const { projectFullRunBudget } = require('./fullRunBudgetProjection');
const { readAndValidateThreeDayAdjudication } = require('./threeDayAdjudication');
const { readAndValidateSevenDayAdjudication } = require('./sevenDayAdjudication');
const { AGGREGATE_CONFIRMATION_MANIFEST } = require('./aggregateConfirmationManifest');
// Stage 14.7L §2/§11 — the canonical four-dimensional prior-exposure record.
const { resolvePriorCumulativeExposure } = require('./priorCumulativeExposure');
const { PREFLIGHT_VERSION } = require('./preflightVersion');

const RECEIPT_PATH = path.join(REPO_ROOT, 'artifacts/private/stage14_7-readiness-receipt.json');

/**
 * Every file whose behaviour the preflight actually depends on. If one of these
 * changes, the preflight result no longer describes the code that would run.
 */
const HASHED_FILES = [
  // live runner + evaluation drivers
  'server/eval/run-stage14_7-early-visibility-two.js',
  'server/src/eval/stage14_7/compositePreflight.js',
  'server/src/eval/stage14_7/preflightVersion.js',
  'server/src/eval/stage14_7/evaluationIdentity.js',
  'server/src/eval/stage14_7/nonExecutionEvidence.js',
  // Stage 14.7N — regression-provider containment and its separate incident.
  'server/src/config/providerTestPolicy.js',
  'server/tests/providerDisabledBootstrap.js',
  'server/tests/liveAuthorizationBootstrap.js',
  'server/tests/setup.js',
  'server/jest.config.js',
  'server/jest.live.config.js',
  'server/package.json',
  'server/scripts/run-provider-disabled-tests.js',
  'server/scripts/run-live-tests.js',
  'server/src/config/__tests__/providerTestPolicy.test.js',
  'server/src/eval/stage14_7/__tests__/regressionProviderIsolation.test.js',
  'artifacts/private/stage14_7N-accidental-provider-incident.json',
  'artifacts/private/stage14_7O-non-execution.json',
  'server/src/eval/stage14_7e/scenarioChild.js',
  'server/src/eval/stage14_7/childProviderReadiness.js',
  'server/src/eval/stage14_7/__tests__/childProviderReadiness.test.js',
  'next-frontend/src/__tests__/integration/stage14_7fHarness.js',

  // Stage 14.7G §16 — the live executor itself. Everything that decides whether
  // a paid call may happen, what it costs, when it is measured, what is written
  // and what the run concludes. A change to any of these invalidates a receipt
  // minted against the previous behaviour.
  'server/src/eval/stage14_7/liveAuthorization.js',
  'server/src/eval/stage14_7/liveExecutor.js',
  'server/src/eval/stage14_7/liveProviderLedger.js',
  'server/src/eval/stage14_7/liveNetworkAllowlist.js',
  'server/src/eval/stage14_7/timeline.js',
  'server/src/eval/stage14_7/decision.js',
  'server/src/eval/stage14_7/scenarioConsumption.js',
  'server/src/eval/stage14_7/privateEvidence.js',
  'server/src/eval/stage14_7/canonicalEvidenceRepair.js',
  'server/src/eval/stage14_7/threeDayAdjudication.js',
  'server/src/eval/stage14_7/aggregateConfirmationManifest.js',
  'server/src/eval/stage14_7/aggregateDecision.js',
  'server/src/eval/stage14_7/requiredEvidenceManifest.js',
  'server/src/eval/stage14_7/identityEvidence.js',
  'server/src/eval/stage14_7/historicalSevenDayEvidence.js',
  'server/src/eval/stage14_7/sevenDayAdjudication.js',
  'server/src/eval/stage14_7/__tests__/canonicalEvidenceRepair.test.js',
  'server/src/eval/stage14_7/__tests__/stage147pManifest.test.js',
  'server/src/eval/stage14_7/__tests__/stage147qAdjudication.test.js',
  'server/src/eval/stage14_7/__tests__/stage147rEvidenceContract.test.js',
  'server/src/eval/trailie/usageAccounting.js',
  'server/src/eval/trailie/pricing.js',
  'server/src/utils/canonicalResponse.js',
  'next-frontend/src/__tests__/integration/stage14_7gLiveScenarioDriver.mjs',
  'next-frontend/src/__tests__/integration/stage14_7gFlagOffReplay.js',
  'next-frontend/src/__tests__/integration/stage14_7pCapturedReplay.test.js',
  'next-frontend/src/__tests__/integration/stage14_7rCapturedReplay.test.js',
  // Stage 14.7P — the immutable captured input and its bounded, plan-free
  // replay/cumulative records are receipt inputs, not untracked assumptions.
  'artifacts/private/stage14_7-live/stage147g-msga12h5-30340b/basic-02-three-day.json',
  'artifacts/private/stage14_7-live/stage147g-mshqzkal-cda9db/basic-02-three-day-model-fix-validation-1.json',
  'artifacts/private/stage14_7P-cumulative-exposure.json',
  'artifacts/private/stage14_7P-captured-replay.json',
  'artifacts/private/stage14_7-three-day-adjudication.json',
  'artifacts/private/stage14_7-live/stage147g-mshyixvk-52ed4e/basic-03-seven-day.json',
  'artifacts/private/stage14_7-consumption/basic-03-seven-day.json',
  'artifacts/private/stage14_7R-cumulative-exposure.json',
  'artifacts/private/stage14_7R-cache-reconciliation.json',
  'artifacts/private/stage14_7R-identity-reconciliation.json',
  'artifacts/private/stage14_7R-captured-replay.json',
  'artifacts/private/stage14_7-seven-day-adjudication.json',
  'docs/TRAILIE-STAGE14_7Q-THREE-DAY-ADJUDICATION-AND-FINAL-MANIFEST.md',
  'docs/TRAILIE-STAGE14_7R-EVIDENCE-CONTRACT-REPAIR.md',
  // Stage 14.7H §14 — the corrected subprocess launcher, the consumption state
  // machine and dispatch handshake, the reset/void audit mechanism, the
  // stale-process diagnostic, and the vitest config the launcher depends on.
  // A change to the config's alias silently breaks the launch, so it is hashed.
  'next-frontend/vitest.config.mjs',
  'server/src/eval/stage14_7/staleEvaluationProcesses.js',
  // Stage 14.7I §17 — model resolution, the failed-run audit + cumulative
  // budget, and the replacement-scenario manifest.
  'server/src/config/resolveProviderModel.js',
  'server/src/config/aiModels.js',
  'server/src/services/trailieV2ExecutionService.js',
  'server/src/services/trailieV2RouteBridge.js',
  'server/src/services/claudeService.js',
  'server/src/services/openaiService.js',
  'server/src/services/trailieLiteLlm.js',
  'server/src/eval/stage14_7/failedRunAudit.js',
  'server/src/eval/stage14_7/replacementScenario.js',
  // Stage 14.7J §13 — the dispatch model policy, the identity assertion, the
  // reviewed scenario manifest, the whole-run budget projector, and the
  // structured generator that now asserts on the request it assembles. A change
  // to any of these changes what may be dispatched or what a run would cost, so
  // a receipt minted against the previous behaviour must not survive it.
  'server/src/config/providerDispatchPolicy.js',
  'server/src/services/structuredItineraryGenerator.js',
  'server/src/services/responsesAdapter.js',
  'server/src/services/providers/openaiResponsesAdapter.js',
  'server/src/eval/stage14_7/liveScenarioManifest.js',
  'server/src/eval/stage14_7/fullRunBudgetProjection.js',
  // Stage 14.7L §11 — the ONE canonical prior-exposure source. A change here
  // changes every cumulative dimension the caps are enforced against.
  'server/src/eval/stage14_7/priorCumulativeExposure.js',
  'server/src/eval/stage14_7/__tests__/priorCumulativeExposure.test.js',
  // Stage 14.7K §9 — the scenario inventory now carries the replacement-slot
  // alias, so the manifest's second entry resolves through it. A change there
  // changes WHAT would run under an authorized manifest.
  'server/src/eval/trailie/scenarios/index.js',
  // (scenarioChild.js and stage14_7fHarness.js are already hashed above — they
  // now also carry the child-side policy and the boot plumbing for it.)
  // Load-bearing: these define what "qualified" means, so a weakened assertion
  // must invalidate the receipt exactly as a weakened implementation would.
  'server/src/eval/stage14_7/__tests__/liveExecutorQualification.test.js',
  'server/src/eval/stage14_7/__tests__/liveNetworkGuard.test.js',
  'server/src/eval/stage14_7/__tests__/realSubprocessLaunch.test.js',
  'server/src/eval/stage14_7/__tests__/evaluationIdentity.test.js',
  'server/src/eval/bootstrap/__tests__/fixtureValidator.test.js',
  'server/src/validation/__tests__/emailValidation.test.js',
  'server/src/eval/stage14_7/__tests__/liveAccountingRepair.test.js',
  'server/src/config/__tests__/resolveProviderModel.test.js',
  'server/src/config/__tests__/providerDispatchPolicy.test.js',
  'server/src/eval/stage14_7/__tests__/liveManifestAndBudget.test.js',
  'next-frontend/src/__tests__/integration/stage14_7gFlagOffReplay.test.js',
  // request path
  'server/src/routes/ai.js',
  'server/src/routes/trips.js',
  // persistence
  'server/src/controllers/tripController.js',
  'server/src/models/TripPlan.js',
  'server/src/models/User.js',
  'server/src/validation/emailValidation.js',
  'server/src/validation/tripWriteContract.js',
  'server/src/utils/frozenSuccessionPlan.js',
  'server/src/utils/planPersistence.js',
  'server/src/utils/canonicalPersistence.js',
  // projections + cache policy
  'server/src/utils/planProjection.js',
  'server/src/utils/sharedTripPayload.js',
  'server/src/utils/trailieStoredPresentation.js',
  // frontend lifecycle
  'next-frontend/src/services/aiService.js',
  'next-frontend/src/utils/earlyRevisionCoordinator.js',
  'next-frontend/src/utils/earlyRevisionLifecycle.js',
  'next-frontend/src/utils/earlyRevisionMessages.js',
  'next-frontend/src/utils/persistenceDecision.js',
  'next-frontend/src/utils/responseSavePayload.js',
  'next-frontend/src/lib/pdf/buildTripExportPayload.js',
  // isolation + cleanup utilities
  'server/src/eval/bootstrap/outboundNetworkGuard.js',
  'server/src/eval/bootstrap/deterministicAdapters.js',
  'server/src/eval/bootstrap/fixtureValidator.js',
  'server/src/eval/modelReadiness.js',
  'server/eval/evalPersistenceGuard.js',
  // lockfiles
  'server/package-lock.json',
  'next-frontend/package-lock.json',
];

function hashFile(relPath) {
  const abs = path.join(REPO_ROOT, relPath);
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
  } catch {
    return null;
  }
}

function relevantFileHashes() {
  const out = {};
  for (const rel of HASHED_FILES) out[rel] = hashFile(rel);
  return out;
}

function gitHead() {
  try {
    return fs.readFileSync(path.join(REPO_ROOT, '.git/HEAD'), 'utf8').trim().replace(/^ref:\s*/, '');
  } catch {
    return null;
  }
}

/**
 * The configuration that BOUNDS the run. Values are names, caps and shapes —
 * never keys, tokens or full URIs.
 */
function configurationFingerprint(env, sanitizeMongoTarget) {
  const config = {
    itineraryGenerationMode: env.TRAILIE_ITINERARY_GENERATION_MODE,
    rolloutKillSwitch: String(env.TRAILIE_ROLLOUT_KILL_SWITCH),
    rolloutToolFirstRate: String(env.TRAILIE_ROLLOUT_TOOL_FIRST_RATE),
    proseConsistencyMode: env.TRAILIE_PROSE_CONSISTENCY_MODE,
    earlyItineraryEvents: String(env.TRAILIE_EARLY_ITINERARY_EVENTS),
    proseRecovery: String(env.TRAILIE_PROSE_RECOVERY),
    reviewEnqueueEnabled: String(env.TRAILIE_REVIEW_ENQUEUE_ENABLED),
    obsoleteAliasPresent: env.TRAILIE_ITINERARY_MODE !== undefined,
  };
  return {
    config,
    digest: crypto.createHash('sha256').update(JSON.stringify(config)).digest('hex'),
  };
}

/**
 * Stage 14.7K §9 — the reviewed decision itself, fingerprinted.
 *
 * The manifest, the cumulative ceilings and the prior-exposure seed are what a
 * reviewer actually approved. Hashing the FILES that contain them is not enough:
 * a refactor can move a constant between files without changing the decision,
 * and an edit can change the decision without touching a hashed file's role.
 * This digest is over the values.
 */
function reviewedDecisionFingerprint() {
  /**
   * Stage 14.7L §2/§11 — the prior exposure enters the fingerprint on ALL FOUR
   * dimensions, from the canonical resolver.
   *
   * The 14.7K fingerprint carried only requests and cost, which is precisely
   * the asymmetry that let the token exposure go unnoticed: a receipt cannot
   * detect drift in a dimension it never recorded.
   */
  const prior = resolvePriorCumulativeExposure();
  const adjudication = readAndValidateThreeDayAdjudication();
  const sevenDayAdjudication = readAndValidateSevenDayAdjudication();
  const projection = projectFullRunBudget();
  const decision = {
    scenarios: [...LIVE_SCENARIO_MANIFEST.scenarios],
    originalFailedScenario: LIVE_SCENARIO_MANIFEST.originalFailedScenario,
    originalFailedScenarioConsumed: LIVE_SCENARIO_MANIFEST.originalFailedScenarioConsumed,
    replacementScenarioExecutionAuthorized: LIVE_SCENARIO_MANIFEST.replacementScenarioExecutionAuthorized,
    executionOrderFixed: LIVE_SCENARIO_MANIFEST.executionOrderFixed,
    aggregateManifestId: AGGREGATE_CONFIRMATION_MANIFEST.manifestId,
    completedLiveEvidence: AGGREGATE_CONFIRMATION_MANIFEST.completedLiveEvidence,
    remainingLiveExecution: AGGREGATE_CONFIRMATION_MANIFEST.remainingLiveExecution,
    threeDayAdjudicationPassed: adjudication.valid,
    threeDayAdjudicationSourceHashes: adjudication.adjudication?.sourceEvidenceHashes || null,
    threeDayRerunRequired: false,
    sevenDayAdjudicationPassed: sevenDayAdjudication.valid,
    sevenDayAdjudicationSourceHashes: sevenDayAdjudication.adjudication?.sourceEvidenceHashes || null,
    sevenDayPaidRerunRequired: sevenDayAdjudication.adjudication?.requiresPaidSevenDayRerun !== false,
    aggregateEvidenceContractPassed: sevenDayAdjudication.adjudication?.evidenceContractPassed === true,
    sevenDayExecutionAuthorized: LIVE_SCENARIO_MANIFEST.sevenDayExecutionAuthorized,
    // §3 — an unresolved exposure is recorded as UNRESOLVED, never as zeros.
    priorCumulativeExposureResolved: prior.resolved === true,
    priorRequests: prior.resolved ? prior.exposure.requests : null,
    priorConservativeCostUsd: prior.resolved ? prior.exposure.costUsd : null,
    priorReservedInputTokens: prior.resolved ? prior.exposure.inputTokens : null,
    priorReservedOutputTokens: prior.resolved ? prior.exposure.outputTokens : null,
    cumulativeCostCapUsd: BUDGET_CAPS.cumulativeCostCapUsd,
    cumulativeRequestCap: BUDGET_CAPS.cumulativeRequestCap,
    cumulativeInputTokenCap: BUDGET_CAPS.cumulativeInputTokenCap,
    cumulativeOutputTokenCap: BUDGET_CAPS.cumulativeOutputTokenCap,
    remainingPlanProjection: {
      requests: projection.sevenDayWorstCaseRequests,
      costUsd: projection.sevenDayWorstCaseExposureUsd,
      inputTokens: projection.sevenDayWorstCaseInputTokens,
      outputTokens: projection.sevenDayWorstCaseOutputTokens,
      cumulativeProjectedRequests: projection.cumulativeProjectedRequests,
      cumulativeProjectedCostUsd: projection.cumulativeProjectedCostUsd,
      cumulativeProjectedInputTokens: projection.cumulativeProjectedInputTokens,
      cumulativeProjectedOutputTokens: projection.cumulativeProjectedOutputTokens,
      feasible: projection.cumulativeBudgetFeasible,
    },
  };
  return {
    decision,
    digest: crypto.createHash('sha256').update(JSON.stringify(decision)).digest('hex'),
  };
}

function buildReceipt({ env, composite, sanitizeMongoTarget }) {
  const costCaps = {
    maxTotalCostUsd: Number(env.TRAILIE_EVAL_MAX_TOTAL_COST_USD),
    maxRequests: Number(env.TRAILIE_EVAL_MAX_REQUESTS),
    maxInputTokens: Number(env.TRAILIE_EVAL_MAX_INPUT_TOKENS),
    maxOutputTokens: Number(env.TRAILIE_EVAL_MAX_OUTPUT_TOKENS),
  };

  return {
    preflightVersion: composite.preflightVersion,
    createdAt: new Date().toISOString(),
    gitHead: gitHead(),
    relevantFileHashes: relevantFileHashes(),
    // Stage 14.7K §2/§9 — the AUTHORIZED manifest. A receipt minted against the
    // old list (which still named the consumed original) no longer validates.
    scenarioIds: [...LIVE_SCENARIO_MANIFEST.scenarios],
    sanitizedMongoTarget: sanitizeMongoTarget(env.TRAILIE_EVAL_TEST_MONGODB_URI),
    modelAllowlist: String(env.TRAILIE_EVAL_MODEL_ALLOWLIST || ''),
    costCaps,
    configurationFingerprint: configurationFingerprint(env, sanitizeMongoTarget),
    reviewedDecisionFingerprint: reviewedDecisionFingerprint(),
    /**
     * Stage 14.7J §6/§8 — the paid-execution state the receipt is about.
     *
     * A receipt that recorded only technical readiness could be waved at a live
     * command while the reviewed scenario set was incomplete and the plan did
     * not fit the caps. Both now travel WITH the receipt, so the two questions
     * are answered by the same artifact.
     */
    liveScenarioManifest: composite.liveScenarioManifest || null,
    cumulativeBudgetProjection: composite.cumulativeBudgetProjection || null,
    paidExecutionReadiness: composite.paidExecutionReadiness || null,
    compositeResult: {
      readiness: composite.readiness,
      isolation: composite.isolation,
      deployedSharedCachePolicyVerified: composite.deployedSharedCachePolicyVerified,
      // Stage 14.7H §14 — persisted, not merely logged: a receipt must not be
      // able to read "valid" while orphaned evaluation children are still
      // holding loopback listeners the next run will collide with.
      staleEvaluationChildrenDetected: composite.staleEvaluationChildrenDetected === true,
    },
  };
}

function writeReceipt(receipt) {
  fs.mkdirSync(path.dirname(RECEIPT_PATH), { recursive: true });
  fs.writeFileSync(RECEIPT_PATH, JSON.stringify(receipt, null, 2) + '\n');
  return RECEIPT_PATH;
}

function readReceipt() {
  try {
    return JSON.parse(fs.readFileSync(RECEIPT_PATH, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * The gate the FUTURE live runner must call. Returns every reason it refuses, so
 * an operator sees the whole story rather than the first failure.
 *
 * TWO ANSWERS, Stage 14.7J §7/§13
 * -------------------------------
 * `valid` means: this receipt still faithfully describes THIS tree, and every
 * technical gate it records passed. It is an integrity statement.
 *
 * `liveExecutionAuthorized` means: a paid run may proceed. It additionally
 * requires an authorized scenario manifest and a whole-plan budget that fits.
 *
 * Conflating them is what let 14.7I report readiness for a paid run while the
 * reviewed scenario set was incomplete. A receipt can be perfectly valid and
 * still authorize nothing — which is exactly the state Stage 14.7J leaves.
 *
 * @returns {{valid: boolean, reasons: string[],
 *   liveExecutionAuthorized: boolean, authorizationRefusals: string[]}}
 */
function validateReceipt(receipt, { env, sanitizeMongoTarget } = {}) {
  const reasons = [];
  const authorizationRefusals = [];
  if (!receipt) {
    return {
      valid: false,
      reasons: ['receipt_missing'],
      liveExecutionAuthorized: false,
      authorizationRefusals: ['receipt_missing'],
    };
  }

  if (receipt.preflightVersion !== PREFLIGHT_VERSION) reasons.push('preflight_version_changed');

  const current = relevantFileHashes();
  const changed = Object.keys(current).filter((rel) => current[rel] !== receipt.relevantFileHashes[rel]);
  if (changed.length > 0) reasons.push('relevant_file_hash_changed:' + changed.length);

  const e = env || process.env;
  const fp = configurationFingerprint(e, sanitizeMongoTarget);
  if (fp.digest !== (receipt.configurationFingerprint || {}).digest) reasons.push('configuration_changed');

  const scenarios = [...LIVE_SCENARIO_MANIFEST.scenarios];
  if (JSON.stringify(receipt.scenarioIds) !== JSON.stringify(scenarios)) reasons.push('scenario_ids_changed');

  const caps = receipt.costCaps || {};
  if (caps.maxTotalCostUsd !== Number(e.TRAILIE_EVAL_MAX_TOTAL_COST_USD)
    || caps.maxRequests !== Number(e.TRAILIE_EVAL_MAX_REQUESTS)
    || caps.maxInputTokens !== Number(e.TRAILIE_EVAL_MAX_INPUT_TOKENS)
    || caps.maxOutputTokens !== Number(e.TRAILIE_EVAL_MAX_OUTPUT_TOKENS)) {
    reasons.push('cost_caps_changed');
  }

  if (receipt.modelAllowlist !== String(e.TRAILIE_EVAL_MODEL_ALLOWLIST || '')) reasons.push('model_allowlist_changed');

  // Stage 14.7K §9 — the reviewed decision (manifest + ceilings + prior seed).
  const decisionNow = reviewedDecisionFingerprint();
  if (decisionNow.digest !== (receipt.reviewedDecisionFingerprint || {}).digest) {
    reasons.push('reviewed_decision_changed');
  }
  // §3 — the run's environment caps must BE the reviewed ceilings. A receipt
  // that records different numbers from the ones the run would enforce cannot
  // gate that run.
  if (caps.maxTotalCostUsd !== BUDGET_CAPS.cumulativeCostCapUsd
    || caps.maxRequests !== BUDGET_CAPS.cumulativeRequestCap
    || caps.maxInputTokens !== BUDGET_CAPS.cumulativeInputTokenCap
    || caps.maxOutputTokens !== BUDGET_CAPS.cumulativeOutputTokenCap) {
    reasons.push('cost_caps_do_not_match_reviewed_ceilings');
  }

  const target = sanitizeMongoTarget(e.TRAILIE_EVAL_TEST_MONGODB_URI);
  if (JSON.stringify(receipt.sanitizedMongoTarget) !== JSON.stringify(target)) reasons.push('mongo_target_changed');

  const iso = (receipt.compositeResult || {}).isolation;
  if (!iso || iso.liveProviderCalls !== 0 || iso.liveProviderCostUsd !== 0) reasons.push('receipt_does_not_show_zero_spend');

  const readiness = (receipt.compositeResult || {}).readiness || {};
  if (readiness.cleanupSafetyPassed !== true) reasons.push('receipt_does_not_show_complete_cleanup');
  /**
   * Stage 14.7J §7 — technical readiness is what makes a receipt VALID.
   *
   * A pre-14.7J receipt has no `liveExecutorTechnicalReady`, so its
   * `liveExecutionReady` (which then meant the same thing) is accepted in its
   * place. That is a compatibility read, not a loosening: such a receipt is
   * refused anyway by the 14.7J gates below.
   */
  const technicalReady = readiness.liveExecutorTechnicalReady === true
    || (readiness.liveExecutorTechnicalReady === undefined && readiness.liveExecutionReady === true);
  if (!technicalReady) reasons.push('receipt_not_technically_ready');
  // Authorization, kept separate — see the function header.
  if (readiness.liveExecutionReady !== true) authorizationRefusals.push('receipt_not_live_ready');

  // Stage 14.7H §14 — the two gates added after the launch defect, plus the
  // orphaned-child check. A receipt minted before these existed is refused.
  if (readiness.realSubprocessPathQualified !== true) reasons.push('receipt_does_not_show_real_subprocess_qualification');
  if (readiness.scenarioConsumptionSemanticsPassed !== true) reasons.push('receipt_does_not_show_consumption_semantics');
  if (readiness.childCredentialPropagationPassed !== true) reasons.push('receipt_does_not_show_child_credential_propagation');
  if (readiness.childProviderReadinessPassed !== true) reasons.push('receipt_does_not_show_child_provider_readiness');
  if (readiness.preAdmissionProviderValidationPassed !== true) reasons.push('receipt_does_not_show_pre_admission_provider_validation');
  if (readiness.providerSecretIsolationPassed !== true) reasons.push('receipt_does_not_show_provider_secret_isolation');
  // Stage 14.7I — a receipt minted before the model-resolution repair is refused.
  if (readiness.modelResolutionPassed !== true) reasons.push('receipt_does_not_show_model_resolution');
  if (readiness.streamingUsageAccountingPassed !== true) reasons.push('receipt_does_not_show_streaming_usage_accounting');
  if (readiness.evaluationIdentityContractPassed !== true) {
    reasons.push('receipt_does_not_show_evaluation_identity_contract');
  }
  if (readiness.runScopedIdentityPassed !== true) reasons.push('receipt_does_not_show_run_scoped_identity');

  // Stage 14.7J §13 — the dispatch-depth gates. These are TECHNICAL: a receipt
  // minted before they existed does not describe the code that would run.
  if (readiness.dispatchModelPolicyPassed !== true) reasons.push('receipt_does_not_show_dispatch_model_policy');
  if (readiness.providerModelIdentityPassed !== true) reasons.push('receipt_does_not_show_provider_model_identity');
  if (readiness.cumulativeBudgetProjectionPassed !== true) reasons.push('receipt_does_not_show_budget_projection');
  if (readiness.regressionProviderIsolationPassed !== true) reasons.push('receipt_does_not_show_regression_provider_isolation');
  if (readiness.liveTestsExplicitlyOptIn !== true) reasons.push('receipt_does_not_show_live_test_opt_in');
  if (readiness.dotenvCannotEnableProvidersInDeniedMode !== true) reasons.push('receipt_does_not_show_dotenv_provider_denial');
  if (readiness.compositePreflightExcludesLiveTests !== true) reasons.push('receipt_does_not_show_live_test_exclusion');
  if (readiness.canonicalIdentityPassed !== true) reasons.push('receipt_does_not_show_canonical_identity');
  if (readiness.liveEvidenceReportingPassed !== true) reasons.push('receipt_does_not_show_live_evidence_reporting');
  if (readiness.localMongoAvailabilityPassed !== true) reasons.push('receipt_does_not_show_local_mongo_availability');
  if (readiness.foreignRecordPreservationPassed !== true) reasons.push('receipt_does_not_show_foreign_record_preservation');
  if (readiness.threeDayAdjudicationPassed !== true) reasons.push('receipt_does_not_show_three_day_adjudication');
  if (readiness.lifecycleEvidencePassed !== true) reasons.push('receipt_does_not_show_lifecycle_evidence');
  if (readiness.restoreEvidencePassed !== true) reasons.push('receipt_does_not_show_restore_evidence');
  if (readiness.threeDayGainPassed !== true) reasons.push('receipt_does_not_show_three_day_gain');
  if (readiness.aggregateDecisionLogicPassed !== true) reasons.push('receipt_does_not_show_aggregate_decision_logic');
  if (readiness.threeDayRerunRequired !== false) reasons.push('receipt_unexpectedly_requires_three_day_rerun');
  if (readiness.secondReplacementExecutionAuthorized !== false) reasons.push('receipt_authorizes_second_replacement');
  if (readiness.sevenDayExecutionAuthorized !== false) reasons.push('receipt_unexpectedly_authorizes_seven_day');
  if (readiness.sevenDayAdjudicationPassed !== true) reasons.push('receipt_does_not_show_seven_day_adjudication');
  if (readiness.sevenDayPaidRerunRequired !== false) reasons.push('receipt_unexpectedly_requires_seven_day_rerun');
  if (readiness.aggregateEvidenceContractPassed !== true) reasons.push('receipt_does_not_show_aggregate_evidence_contract');
  if (readiness.futureScenarioDefined !== true) reasons.push('receipt_does_not_show_future_scenario_definition');
  if (readiness.futureScenarioAuthorized !== false) reasons.push('receipt_unexpectedly_authorizes_future_scenario');
  if (readiness.originalFailedScenarioPreserved !== true) reasons.push('receipt_does_not_show_original_failed_scenario_preserved');
  if ((receipt.compositeResult || {}).staleEvaluationChildrenDetected === true) {
    reasons.push('receipt_shows_stale_evaluation_children');
  }

  /**
   * §6/§9 — the two facts a receipt could not previously carry. They are
   * AUTHORIZATION refusals, not integrity failures: the receipt is telling the
   * truth about a tree that is not yet allowed to spend.
   */
  // Stage 14.7L §3/§10 — an unresolved prior exposure is its own refusal, and a
  // receipt recording one authorizes nothing.
  if (readiness.cumulativeExposureResolved !== true) authorizationRefusals.push('prior_cumulative_exposure_unresolved');
  if (readiness.liveScenarioManifestReady !== true) authorizationRefusals.push('live_scenario_manifest_not_authorized');
  if (readiness.cumulativeBudgetFeasible !== true) authorizationRefusals.push('cumulative_stage14_7_cap_insufficient');

  const valid = reasons.length === 0;
  return {
    valid,
    reasons,
    // Fail closed: an invalid receipt authorizes nothing, whatever it records.
    liveExecutionAuthorized: valid && authorizationRefusals.length === 0,
    authorizationRefusals: valid
      ? authorizationRefusals
      : [...authorizationRefusals, 'readiness_receipt_invalid'],
  };
}

module.exports = {
  RECEIPT_PATH,
  HASHED_FILES,
  relevantFileHashes,
  configurationFingerprint,
  buildReceipt,
  writeReceipt,
  readReceipt,
  validateReceipt,
};
