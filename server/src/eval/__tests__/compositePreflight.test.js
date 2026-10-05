'use strict';

/**
 * Stage 14.7F7 §5/§6/§13/§14/§15 — the preflight's own guarantees.
 *
 * These are the checks that keep the runner honest: that a passing STATIC check
 * can never imply live readiness on its own, that readiness is computed rather
 * than read, that the entrypoint cannot fall into live execution, and that the
 * readiness receipt actually refuses a moved tree.
 */

const fs = require('fs');
const path = require('path');

const {
  PREFLIGHT_VERSION, PHASES, APPROVED_SCENARIOS, staticConfigurationPreflight, sanitizeMongoTarget,
} = require('../stage14_7/compositePreflight');
const {
  HASHED_FILES, buildReceipt, validateReceipt, configurationFingerprint, relevantFileHashes,
} = require('../stage14_7/readinessReceipt');

const SERVER_ROOT = path.resolve(__dirname, '../../..');
const rawRunnerSrc = fs.readFileSync(path.join(SERVER_ROOT, 'eval/run-stage14_7-early-visibility-two.js'), 'utf8');
/**
 * Assertions about what the runner DOES must read executable code, not prose.
 * The doc comment legitimately mentions the old "Preflight PASSED" behaviour and
 * the word "tokens" while explaining what is no longer done.
 */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const runnerSrc = stripComments(rawRunnerSrc);
const compositeSrc = fs.readFileSync(path.join(SERVER_ROOT, 'src/eval/stage14_7/compositePreflight.js'), 'utf8');

const GOOD_ENV = {
  TRAILIE_EVAL_MODEL_ALLOWLIST: 'claude:claude-sonnet-5',
  CLAUDE_PRIMARY_MODEL: 'claude-sonnet-5',
  TRAILIE_EVAL_MAX_TOTAL_COST_USD: '1.50',
  TRAILIE_EVAL_MAX_REQUESTS: '12',
  TRAILIE_EVAL_MAX_INPUT_TOKENS: '240000',
  TRAILIE_EVAL_MAX_OUTPUT_TOKENS: '100000',
  TRAILIE_EVAL_CAPTURE_PRIVATE_DRAFTS: 'true',
  TRAILIE_ITINERARY_GENERATION_MODE: 'tool_first',
  TRAILIE_ROLLOUT_KILL_SWITCH: 'false',
  TRAILIE_ROLLOUT_TOOL_FIRST_RATE: '1',
  TRAILIE_PROSE_CONSISTENCY_MODE: 'enforce',
  TRAILIE_EARLY_ITINERARY_EVENTS: 'true',
  TRAILIE_PROSE_RECOVERY: 'false',
  TRAILIE_REVIEW_ENQUEUE_ENABLED: 'false',
  TRAILIE_EVAL_TEST_MONGODB_URI: 'mongodb://127.0.0.1:27018/trailverse_eval_14_7',
};

describe('§5 — static configuration covers every required check', () => {
  const { checks } = staticConfigurationPreflight(GOOD_ENV);
  const names = checks.map((c) => c.name).join(' | ');

  test('the good configuration passes', () => {
    expect(staticConfigurationPreflight(GOOD_ENV).ok).toBe(true);
  });

  test.each([
    ['no remaining paid scenario', /no remaining Stage 14\.7 paid scenario/],
    ['Claude Sonnet 5 allowlist', /Claude Sonnet 5/],
    ['no OpenAI live model', /no OpenAI/],
    ['cost cap', /cost cap \$1\.50/],
    ['request cap', /request cap 12/],
    ['input cap', /input-token cap 240000/],
    ['output cap', /output-token cap 100000/],
    ['private-draft gating', /private-draft capture gated/],
    ['isolated MongoDB', /isolated MongoDB target/],
    ['production URI rejection', /production URI is not/],
    ['tool-first env name', /TRAILIE_ITINERARY_GENERATION_MODE/],
    ['recovery disabled', /recovery disabled/],
    ['early events enabled', /TRAILIE_EARLY_ITINERARY_EVENTS/],
    ['prose consistency enforced', /TRAILIE_PROSE_CONSISTENCY_MODE/],
    ['review enqueue disabled', /review enqueue disabled/],
  ])('checks %s', (_label, pattern) => {
    expect(names).toMatch(pattern);
  });

  test.each([
    ['wrong cost cap', { TRAILIE_EVAL_MAX_TOTAL_COST_USD: '5' }],
    ['wrong request cap', { TRAILIE_EVAL_MAX_REQUESTS: '999' }],
    ['openai in the allowlist', { TRAILIE_EVAL_MODEL_ALLOWLIST: 'claude:claude-sonnet-5,openai:gpt' }],
    ['kill switch on', { TRAILIE_ROLLOUT_KILL_SWITCH: 'true' }],
    ['recovery enabled', { TRAILIE_PROSE_RECOVERY: 'true' }],
    ['prose consistency off', { TRAILIE_PROSE_CONSISTENCY_MODE: 'off' }],
    ['non-isolated mongo target', { TRAILIE_EVAL_TEST_MONGODB_URI: 'mongodb://prod-host/trailverse' }],
    ['obsolete alias set', { TRAILIE_ITINERARY_MODE: 'tool_first' }],
  ])('fails closed on %s', (_label, override) => {
    expect(staticConfigurationPreflight({ ...GOOD_ENV, ...override }).ok).toBe(false);
  });
});

describe('§6 — the obsolete alias is absent from executable Stage 14.7 paths', () => {
  const childSrc = fs.readFileSync(path.join(SERVER_ROOT, 'src/eval/stage14_7e/scenarioChild.js'), 'utf8');

  test('the scenario child does not SET the obsolete variable', () => {
    expect(childSrc).not.toMatch(/TRAILIE_ITINERARY_MODE\s*:/);
    // Reading it to prove absence is fine; assigning it is not.
    expect(childSrc).toMatch(/TRAILIE_ITINERARY_GENERATION_MODE:\s*'tool_first'/);
  });

  test('neither the runner nor the composite sets it', () => {
    expect(runnerSrc).not.toMatch(/TRAILIE_ITINERARY_MODE\s*=/);
    expect(compositeSrc).not.toMatch(/TRAILIE_ITINERARY_MODE\s*=\s*['"]/);
  });
});

describe('§4/§7 — one authoritative entrypoint over all twenty-one phases', () => {
  test('Stage 14.7R is the current receipt version', () => {
    // 14.7P.1 was invalidated when adjudication/aggregate confirmation landed.
    expect(PREFLIGHT_VERSION).toBe('14.7R.1');
  });

  test('phase A validates the exact run-scoped generator through fixture and User schema contracts', () => {
    expect(compositeSrc).toMatch(/buildRunScopedEvaluationIdentity/);
    expect(compositeSrc).toMatch(/buildEvaluationAuthenticationFixture/);
    expect(compositeSrc).toMatch(/assertEvaluationFixtures/);
    expect(compositeSrc).toMatch(/new User\(fixtures\.user\)\.validateSync\(\)/);
    expect(compositeSrc.indexOf('buildRunScopedEvaluationIdentity'))
      .toBeLessThan(compositeSrc.indexOf('phaseMongoGuardAndPing'));
  });
  test('the phase list is complete and ordered', () => {
    // Stage 14.7G added phase O: the live executor is qualified by the same
    // composite that gates the run, so an unqualified executor cannot be
    // authorized. Stage 14.7H added phase P: the REAL subprocess path and the
    // consumption state machine, which 14.7G only ever exercised through
    // injected callbacks. Stage 14.7J added phase R: the dispatch-depth model
    // policy, the model-identity chain, the reviewed scenario manifest and the
    // whole-plan budget projection.
    expect(PHASES).toHaveLength(21);
    expect(PHASES[0]).toBe('A_fixture_validation');
    expect(PHASES[7]).toBe('H_three_day_actual_route');
    expect(PHASES[8]).toBe('I_seven_day_actual_route');
    expect(PHASES[13]).toBe('N_final_zero_reconciliation');
    expect(PHASES[14]).toBe('O_live_executor_qualification');
    expect(PHASES[15]).toBe('P_real_subprocess_and_consumption');
    expect(PHASES[16]).toBe('Q_model_resolution_and_accounting');
    expect(PHASES[17]).toBe('R_dispatch_policy_and_manifest_feasibility');
    expect(PHASES[18]).toBe('S_regression_provider_isolation');
    expect(PHASES[19]).toBe('T_canonical_identity_and_live_evidence_replay');
    expect(PHASES[20]).toBe('U_three_day_adjudication_and_aggregate_confirmation');
  });

  test('phase T executes the captured live transcript and bounded evidence qualification', () => {
    expect(compositeSrc).toMatch(/stage14_7pCapturedReplay\.test\.js/);
    expect(compositeSrc).toMatch(/canonicalEvidenceRepair\.test\.js/);
    expect(compositeSrc).toMatch(/providerCalls:\s*0/);
  });

  test('phase P executes the real spawn and refuses stale evaluation children', () => {
    expect(compositeSrc).toMatch(/realSubprocessLaunch\.test\.js/);
    expect(compositeSrc).toMatch(/assertNoStaleEvaluationChildren/);
  });

  test('phase O executes the executor qualification suites', () => {
    expect(compositeSrc).toMatch(/liveExecutorQualification\.test\.js/);
    expect(compositeSrc).toMatch(/liveNetworkGuard\.test\.js/);
    expect(compositeSrc).toMatch(/stage14_7gFlagOffReplay\.test\.js/);
  });

  test('the entrypoint delegates to the composite runner, not to static checks', () => {
    expect(runnerSrc).toMatch(/runCompositePreflight\(/);
    // The old failure mode: printing a pass from static checks alone.
    expect(runnerSrc).not.toMatch(/Preflight PASSED/);
  });

  test('the composite executes the real route and cleanup suites', () => {
    expect(compositeSrc).toMatch(/stage14_7fRouteProof\.test\.js/);
    expect(compositeSrc).toMatch(/stage14_7f6Interrupted\.test\.js/);
    expect(compositeSrc).toMatch(/stage14_7f6Cleanup\.test\.js/);
    expect(compositeSrc).toMatch(/duplicateDeliveryIdempotency\.test\.js/);
    expect(compositeSrc).toMatch(/sharedCachePolicy\.test\.js/);
  });

  test('both approved scenarios are the only ones named', () => {
    // Stage 14.7K §2 — the consumed original is REMOVED from the executable
    // list and its replacement slot takes the same position. Leaving it here is
    // what would have let a runner skip it silently.
    // Paid Stage 14.7 confirmation is closed; the executable list is empty.
    expect(APPROVED_SCENARIOS).toEqual([]);
    expect(APPROVED_SCENARIOS).not.toContain('basic-02-three-day');
    expect(APPROVED_SCENARIOS).not.toContain('basic-02-three-day-model-fix-validation-1');
    expect(APPROVED_SCENARIOS).not.toContain('basic-03-seven-day');
  });

  test('the runner reports replacement availability from consumption, not authorization', () => {
    expect(rawRunnerSrc).toMatch(/replacementScenarioAvailable:\s*!isConsumed\(REPLACEMENT_SCENARIO_ID\),/);
    expect(rawRunnerSrc).not.toMatch(/replacementScenarioAvailable:[^\n]*executionAuthorized\s*===\s*false/);
  });

  test('the approved list and the reviewed manifest cannot drift apart', () => {
    const { LIVE_SCENARIO_MANIFEST } = require('../stage14_7/liveScenarioManifest');
    expect(APPROVED_SCENARIOS).toEqual([...LIVE_SCENARIO_MANIFEST.scenarios]);
  });
});

describe('§14 — exit behaviour is fail-closed and non-interactive', () => {
  test('a failed preflight exits nonzero and reports NOT_STARTED', () => {
    expect(runnerSrc).toMatch(/if \(!readiness\.liveExecutionReady\) \{/);
    expect(runnerSrc).toMatch(/executionStatus = DECISION\.NOT_STARTED/);
  });

  /**
   * Stage 14.7G replaced the unconditional exit-2 withholding with a real
   * authorization gate. The safety property is unchanged and now stronger: a
   * preflight-only build still cannot reach the executor, but the reason is an
   * evaluated gate rather than a dead branch.
   */
  test('live execution is never entered from a preflight-only build', () => {
    expect(runnerSrc).toMatch(/if \(preflightOnly\) \{/);
    // The preflight-only branch returns BEFORE the authorization gate is even
    // evaluated, so no ordering of environment variables can fall through.
    const preflightIdx = runnerSrc.indexOf('if (preflightOnly) {');
    const gateIdx = runnerSrc.indexOf('evaluateLiveAuthorization({');
    expect(preflightIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeGreaterThan(preflightIdx);
    // And the gate itself refuses when the flag is set.
    const { evaluateLiveAuthorization } = require('../stage14_7/liveAuthorization');
    const refused = evaluateLiveAuthorization({
      env: {
        TRAILIE_EVAL_PREFLIGHT_ONLY: 'true', TRAILIE_EVAL_EXECUTE_LIVE: 'true',
        TRAILIE_EVAL_LIVE_PROVIDERS: 'true',
      },
      readiness: { compositePreflightPassed: true, liveExecutionReady: true },
      receiptValidation: { valid: true },
    });
    expect(refused.authorized).toBe(false);
  });

  test('the executor is entered only through the explicit gate', () => {
    // The one call site, guarded by both the authorization and provider checks.
    expect(runnerSrc).toMatch(/executeLiveScenarios\(/);
    expect(runnerSrc).toMatch(/if \(!authorization\.authorized \|\| !providerConfig\.ok\) \{/);
    const guardIdx = runnerSrc.indexOf('if (!authorization.authorized || !providerConfig.ok) {');
    const execIdx = runnerSrc.indexOf('await executeLiveScenarios({');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(execIdx).toBeGreaterThan(guardIdx);
  });

  test('there is exactly one live entrypoint and no alternate paid runner', () => {
    const fs = require('fs');
    const path = require('path');
    const evalDir = path.resolve(__dirname, '../../../eval');
    const runners = fs.readdirSync(evalDir).filter((f) => f.endsWith('.js'));
    const withExecutor = runners.filter((f) => fs.readFileSync(path.join(evalDir, f), 'utf8').includes('executeLiveScenarios'));
    expect(withExecutor).toEqual(['run-stage14_7-early-visibility-two.js']);
  });

  test('there is no interactive prompt', () => {
    expect(runnerSrc).not.toMatch(/readline|createInterface|prompt\(/);
  });

  test('a thrown composite still exits nonzero with a bounded code', () => {
    expect(runnerSrc).toMatch(/composite_preflight_threw/);
    expect(runnerSrc).toMatch(/main\(\)\.catch\(/);
  });

  test('nothing sensitive is printed', () => {
    expect(runnerSrc).not.toMatch(/ANTHROPIC_API_KEY|process\.env\.MONGODB_URI/i);
    /**
     * Stage 14.7L — this used to be a bare `/token/i`, which was a blunt proxy
     * for "no auth token". It now false-positives on the token-COUNT fields
     * this stage exists to report (`priorReservedInputTokens`), so it targets
     * the actual secrets instead: bearer/auth/JWT tokens and key material.
     * Token counts are numbers and are required evidence.
     */
    const sourceWithoutBoundedSecretIsolationGate = runnerSrc
      .replaceAll('providerSecretIsolationPassed', 'providerIsolationPassed');
    expect(sourceWithoutBoundedSecretIsolationGate)
      .not.toMatch(/authToken|accessToken|bearerToken|jwt|apiKey|api_key|secret/i);
    // And no raw credential-shaped literal.
    expect(runnerSrc).not.toMatch(/sk-ant-|mongodb(\+srv)?:\/\/[^'"`\s]*:[^'"`\s]*@/);
  });
});

describe('§13 — readiness is COMPUTED, never defaulted', () => {
  test('compositePreflightPassed requires every preceding gate', () => {
    expect(compositeSrc).toMatch(/readiness\.compositePreflightPassed =\s*Object\.keys\(readiness\)\.every/);
  });

  test('liveExecutionReady additionally requires zero spend and cleanup', () => {
    expect(compositeSrc).toMatch(/readiness\.compositePreflightPassed && zeroSpend && readiness\.cleanupSafetyPassed/);
  });

  test('deployedSharedCachePolicyVerified is excluded from live readiness', () => {
    expect(compositeSrc).toMatch(/deployedSharedCachePolicyVerified: false/);
    const readinessBlock = compositeSrc.slice(compositeSrc.indexOf('const readiness = {'), compositeSrc.indexOf('readiness.compositePreflightPassed'));
    expect(readinessBlock).not.toMatch(/deployedSharedCachePolicyVerified/);
  });
});

describe('§15 — the readiness receipt refuses a moved tree', () => {
  const composite = {
    preflightVersion: '14.7R.1',
    readiness: {
      cleanupSafetyPassed: true,
      liveExecutionReady: true,
      evaluationIdentityContractPassed: true,
      runScopedIdentityPassed: true,
      // Stage 14.7H §14 — the receipt now REFUSES a tree that has not qualified
      // the real subprocess path and the consumption semantics.
      realSubprocessPathQualified: true,
      scenarioConsumptionSemanticsPassed: true,
      childCredentialPropagationPassed: true,
      childProviderReadinessPassed: true,
      preAdmissionProviderValidationPassed: true,
      providerSecretIsolationPassed: true,
      modelResolutionPassed: true,
      streamingUsageAccountingPassed: true,
      /**
       * Stage 14.7J §13 — the dispatch-depth gates, plus the two facts a
       * receipt could not previously carry: whether the scenario set is the
       * reviewed one, and whether the whole plan fits the caps.
       *
       * Both are TRUE in this fixture because the subject of this test is
       * receipt VALIDATION. In the real tree today they are false, which is why
       * `validateReceipt` refuses the live run — proven below.
       */
      dispatchModelPolicyPassed: true,
      providerModelIdentityPassed: true,
      cumulativeBudgetProjectionPassed: true,
      regressionProviderIsolationPassed: true,
      liveTestsExplicitlyOptIn: true,
      dotenvCannotEnableProvidersInDeniedMode: true,
      compositePreflightExcludesLiveTests: true,
      canonicalIdentityPassed: true,
      liveEvidenceReportingPassed: true,
      localMongoAvailabilityPassed: true,
      foreignRecordPreservationPassed: true,
      futureScenarioDefined: true,
      futureScenarioAuthorized: false,
      originalFailedScenarioPreserved: true,
      liveExecutorTechnicalReady: true,
      liveScenarioManifestReady: true,
      // Stage 14.7L §10 — resolving the prior exposure is its own gate.
      cumulativeExposureResolved: true,
      cumulativeBudgetFeasible: true,
      // Stage 14.7Q/R — adjudication + aggregate confirmation (closed paid list).
      threeDayAdjudicationPassed: true,
      lifecycleEvidencePassed: true,
      restoreEvidencePassed: true,
      threeDayGainPassed: true,
      aggregateDecisionLogicPassed: true,
      threeDayRerunRequired: false,
      secondReplacementExecutionAuthorized: false,
      sevenDayExecutionAuthorized: false,
      sevenDayAdjudicationPassed: true,
      sevenDayPaidRerunRequired: false,
      aggregateEvidenceContractPassed: true,
    },
    isolation: { liveProviderCalls: 0, liveProviderCostUsd: 0 },
    deployedSharedCachePolicyVerified: false,
    staleEvaluationChildrenDetected: false,
  };
  const receipt = buildReceipt({ env: GOOD_ENV, composite, sanitizeMongoTarget });
  const validate = (r, env) => validateReceipt(r, { env: env || GOOD_ENV, sanitizeMongoTarget });

  test('a fresh receipt validates against the tree that produced it', () => {
    expect(receipt.preflightVersion).toBe('14.7R.1');
    expect(validate(receipt).valid).toBe(true);
    expect(validate(receipt).liveExecutionAuthorized).toBe(true);
  });

  test('Stage 14.7J §7 — validity and live authorization are SEPARATE answers', () => {
    // The state this stage actually leaves: the receipt tells the truth about a
    // technically-ready tree, and authorizes nothing.
    const truthfulButUnauthorized = buildReceipt({
      env: GOOD_ENV,
      composite: {
        ...composite,
        readiness: {
          ...composite.readiness,
          liveExecutionReady: false,
          liveScenarioManifestReady: false,
          cumulativeBudgetFeasible: false,
        },
      },
      sanitizeMongoTarget,
    });
    const v = validate(truthfulButUnauthorized);
    expect(v.valid).toBe(true);
    expect(v.reasons).toEqual([]);
    expect(v.liveExecutionAuthorized).toBe(false);
    expect(v.authorizationRefusals).toEqual(expect.arrayContaining([
      'receipt_not_live_ready',
      'live_scenario_manifest_not_authorized',
      'cumulative_stage14_7_cap_insufficient',
    ]));
  });

  test('an INVALID receipt authorizes nothing, whatever it records', () => {
    const v = validateReceipt(null, { env: GOOD_ENV, sanitizeMongoTarget });
    expect(v.valid).toBe(false);
    expect(v.liveExecutionAuthorized).toBe(false);
  });

  test('a receipt minted before the 14.7H gates existed is REFUSED', () => {
    const legacy = buildReceipt({
      env: GOOD_ENV,
      composite: {
        preflightVersion: '14.7G.1',
        readiness: { cleanupSafetyPassed: true, liveExecutionReady: true },
        isolation: { liveProviderCalls: 0, liveProviderCostUsd: 0 },
        deployedSharedCachePolicyVerified: false,
      },
      sanitizeMongoTarget,
    });
    const v = validate(legacy);
    expect(v.valid).toBe(false);
    expect(v.reasons).toEqual(expect.arrayContaining([
      'receipt_does_not_show_real_subprocess_qualification',
      'receipt_does_not_show_consumption_semantics',
    ]));
  });

  test('a receipt without the Stage 14.7M identity contract is refused', () => {
    const stale = JSON.parse(JSON.stringify(receipt));
    stale.compositeResult.readiness.evaluationIdentityContractPassed = false;
    expect(validate(stale).reasons).toContain('receipt_does_not_show_evaluation_identity_contract');
  });

  test('Stage 14.7J §13 — a 14.7I.1 receipt is REFUSED after these changes', () => {
    // The 14.7I receipt was minted against a tree with no dispatch-depth policy,
    // no model-identity chain and no whole-plan budget projection — and against
    // a `liveExecutionReady` that meant something weaker than it means now.
    const receipt147I = buildReceipt({
      env: GOOD_ENV,
      composite: {
        preflightVersion: '14.7I.1',
        readiness: {
          cleanupSafetyPassed: true,
          liveExecutionReady: true,
          realSubprocessPathQualified: true,
          scenarioConsumptionSemanticsPassed: true,
          modelResolutionPassed: true,
          streamingUsageAccountingPassed: true,
        },
        isolation: { liveProviderCalls: 0, liveProviderCostUsd: 0 },
        deployedSharedCachePolicyVerified: false,
        staleEvaluationChildrenDetected: false,
      },
      sanitizeMongoTarget,
    });
    const v = validate(receipt147I);
    expect(v.valid).toBe(false);
    expect(v.reasons).toEqual(expect.arrayContaining([
      'receipt_does_not_show_dispatch_model_policy',
      'receipt_does_not_show_provider_model_identity',
      'receipt_does_not_show_budget_projection',
      'receipt_does_not_show_original_failed_scenario_preserved',
    ]));
    expect(v.liveExecutionAuthorized).toBe(false);
    expect(v.authorizationRefusals).toEqual(expect.arrayContaining([
      'live_scenario_manifest_not_authorized',
      'cumulative_stage14_7_cap_insufficient',
    ]));
  });

  test('Stage 14.7J §6/§9 — a receipt cannot authorize an unauthorized manifest or an infeasible plan', () => {
    for (const [key, refusal] of [
      ['liveScenarioManifestReady', 'live_scenario_manifest_not_authorized'],
      ['cumulativeBudgetFeasible', 'cumulative_stage14_7_cap_insufficient'],
    ]) {
      const r = buildReceipt({
        env: GOOD_ENV,
        composite: { ...composite, readiness: { ...composite.readiness, [key]: false } },
        sanitizeMongoTarget,
      });
      const v = validate(r);
      expect(v.liveExecutionAuthorized).toBe(false);
      expect(v.authorizationRefusals).toContain(refusal);
    }

    // A LOST consumption marker for the failed run is an integrity failure, not
    // merely an authorization one: the receipt would be describing a tree in
    // which the permanently-consumed scenario reads as available.
    const lostMarker = buildReceipt({
      env: GOOD_ENV,
      composite: { ...composite, readiness: { ...composite.readiness, originalFailedScenarioPreserved: false } },
      sanitizeMongoTarget,
    });
    expect(validate(lostMarker).reasons).toContain('receipt_does_not_show_original_failed_scenario_preserved');
  });

  test('a receipt showing stale evaluation children is REFUSED', () => {
    const stale = buildReceipt({
      env: GOOD_ENV,
      composite: { ...composite, staleEvaluationChildrenDetected: true },
      sanitizeMongoTarget,
    });
    expect(validate(stale).reasons).toContain('receipt_shows_stale_evaluation_children');
  });

  test('it hashes every load-bearing file, and they all resolve', () => {
    const hashes = relevantFileHashes();
    const missing = Object.keys(hashes).filter((k) => hashes[k] === null);
    expect(missing).toEqual([]);
    expect(HASHED_FILES.length).toBeGreaterThanOrEqual(25);
    for (const required of [
      'server/src/controllers/tripController.js',
      'server/src/routes/ai.js',
      'server/src/routes/trips.js',
      'server/src/models/TripPlan.js',
      'server/src/validation/tripWriteContract.js',
      'server/src/validation/emailValidation.js',
      'server/src/models/User.js',
      'server/src/eval/stage14_7/evaluationIdentity.js',
      'server/src/eval/stage14_7/__tests__/evaluationIdentity.test.js',
      'server/src/eval/bootstrap/__tests__/fixtureValidator.test.js',
      'server/src/eval/stage14_7/__tests__/realSubprocessLaunch.test.js',
      'server/eval/run-stage14_7-early-visibility-two.js',
      'server/src/utils/frozenSuccessionPlan.js',
      'server/src/utils/canonicalResponse.js',
      'server/src/eval/stage14_7/canonicalEvidenceRepair.js',
      'next-frontend/src/__tests__/integration/stage14_7pCapturedReplay.test.js',
      'artifacts/private/stage14_7-live/stage147g-msga12h5-30340b/basic-02-three-day.json',
      'artifacts/private/stage14_7-live/stage147g-mshqzkal-cda9db/basic-02-three-day-model-fix-validation-1.json',
      'artifacts/private/stage14_7P-cumulative-exposure.json',
      'artifacts/private/stage14_7P-captured-replay.json',
      'server/src/utils/planProjection.js',
      'next-frontend/src/services/aiService.js',
      'next-frontend/src/utils/earlyRevisionCoordinator.js',
      'next-frontend/src/utils/persistenceDecision.js',
      'next-frontend/src/lib/pdf/buildTripExportPayload.js',
      'server/package-lock.json',
      'next-frontend/package-lock.json',
    ]) {
      expect(HASHED_FILES).toContain(required);
    }
  });

  test.each([
    ['a changed file hash', (r) => { r.relevantFileHashes['server/src/controllers/tripController.js'] = 'deadbeef'; }, 'relevant_file_hash_changed:1'],
    ['changed scenario ids', (r) => { r.scenarioIds = ['basic-01']; }, 'scenario_ids_changed'],
    ['nonzero spend', (r) => { r.compositeResult.isolation.liveProviderCalls = 1; }, 'receipt_does_not_show_zero_spend'],
    ['incomplete cleanup', (r) => { r.compositeResult.readiness.cleanupSafetyPassed = false; }, 'receipt_does_not_show_complete_cleanup'],
  ])('rejects %s', (_label, mutate, expectedReason) => {
    const copy = JSON.parse(JSON.stringify(receipt));
    mutate(copy);
    const result = validate(copy);
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain(expectedReason);
  });

  test.each([
    ['changed configuration', { TRAILIE_PROSE_RECOVERY: 'true' }, 'configuration_changed'],
    ['changed cost caps', { TRAILIE_EVAL_MAX_TOTAL_COST_USD: '5' }, 'cost_caps_changed'],
    ['changed model allowlist', { TRAILIE_EVAL_MODEL_ALLOWLIST: 'claude:other' }, 'model_allowlist_changed'],
    ['changed mongo target', { TRAILIE_EVAL_TEST_MONGODB_URI: 'mongodb://127.0.0.1:27017/other_eval' }, 'mongo_target_changed'],
  ])('rejects %s', (_label, override, expectedReason) => {
    const result = validate(receipt, { ...GOOD_ENV, ...override });
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain(expectedReason);
  });

  test('a missing receipt is a refusal, not a pass', () => {
    expect(validateReceipt(null, { env: GOOD_ENV, sanitizeMongoTarget })).toEqual({
      valid: false,
      reasons: ['receipt_missing'],
      // Stage 14.7J §7 — the authorization answer is reported too, and a
      // missing receipt refuses on both.
      liveExecutionAuthorized: false,
      authorizationRefusals: ['receipt_missing'],
    });
  });

  test('the receipt carries no secrets', () => {
    const serialized = JSON.stringify(receipt);
    expect(serialized).not.toContain('mongodb://');
    expect(serialized).not.toMatch(/sk-|api[_-]?key/i);
    expect(serialized).not.toContain('Evaluation-Only-Password-1');
    // Only the sanitized shape of the target is recorded.
    expect(receipt.sanitizedMongoTarget).toEqual({ host: '127.0.0.1', port: '27018', db: 'trailverse_eval_14_7' });
  });

  test('the configuration fingerprint changes when configuration changes', () => {
    const a = configurationFingerprint(GOOD_ENV, sanitizeMongoTarget).digest;
    const b = configurationFingerprint({ ...GOOD_ENV, TRAILIE_PROSE_RECOVERY: 'true' }, sanitizeMongoTarget).digest;
    expect(a).not.toBe(b);
  });
});
