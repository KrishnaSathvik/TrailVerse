'use strict';

/**
 * Stage 14.7H §4/§7/§8 — the REAL default subprocess path.
 *
 * This is the coverage gap that let 14.7G reach a paid run with a broken
 * launcher. Every 14.7G test injected `runScenario`, so the one component that
 * had to work under real conditions — `spawnSync(vite-node, …)` and the ESM
 * import chain behind it — was the one component with no coverage at all.
 *
 * These tests invoke `defaultRunScenario` for real, with deterministic providers
 * and no Anthropic key. Zero provider calls, zero spend.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  defaultRunScenario, validateSubprocessPrerequisites,
  VITE_NODE_BIN, VITEST_CONFIG, DRIVER_ABS, executeLiveScenarios,
} = require('../liveExecutor');
const {
  assertIsolatedEvalMongoIfRequired,
  ISOLATED_EVAL_MONGO_HOST,
  ISOLATED_EVAL_MONGO_PORT,
} = require('../isolatedEvalMongo');
const consumption = require('../scenarioConsumption');
const { buildRunScopedEvaluationIdentity } = require('../evaluationIdentity');
const { hashOf } = require('../privateEvidence');
// Stage 14.7K §2 — the executor's default scenario list is the authorized
// manifest, so these assertions follow it rather than pinning stale ids.
// Historical executor mechanics remain qualified against the last paid slot;
// the production manifest itself is now intentionally empty after adjudication.
const APPROVED_SCENARIOS = Object.freeze(['basic-03-seven-day']);

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'next-frontend');

/**
 * Stage 14.7J §6/§9 — the manifest and budget gates run BEFORE the launch
 * prerequisites, so they are stubbed authorized here to keep this suite about
 * the real subprocess path. `liveManifestAndBudget.test.js` drives the same
 * function with the DEFAULT gates and proves both refusals.
 */
const SEQUENCING_GATES = {
  scenarios: APPROVED_SCENARIOS,
  manifestGate: () => ({ authorized: true, decision: null, boundedCode: null, refusals: [], status: {} }),
  budgetProjector: () => ({ cumulativeExposureResolved: true, cumulativeBudgetFeasible: true, blockingCaps: [], boundedCode: null }),
  // Stage 14.7L §3 — these suites redirect the evidence directory to a temp
  // path, so the real resolver would (correctly) refuse. The gate itself is
  // proven against the real evidence in priorCumulativeExposure.test.js.
  exposureResolver: () => ({
    resolved: true,
    priorTotals: { requests: 3, inputTokens: 60000, outputTokens: 20000, costUsd: 0.32, costKnown: true },
  }),
};

const CAPS = { maxRequests: 12, maxInputTokens: 180000, maxOutputTokens: 50000, maxCostUsd: 0.75 };
const PRIOR = { requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, costKnown: true };
const REAL_SUBPROCESS_RUN_ID = 'stage147m-realspawn';

/**
 * The overrides are installed at MODULE LOAD, not in `beforeEach`.
 *
 * Jest runs every `beforeAll` before the first `beforeEach`, so a spawn issued
 * from `beforeAll` would inherit an environment with NODE_ENV=test and no
 * override — and the driver would refuse to record state, exactly as designed.
 * Installing here guarantees the real subprocess never sees the live
 * directories, whichever hook spawns it.
 */
const tempMarkerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage147h-markers-'));
const tempEvidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage147h-evidence-'));
const savedMarkerDir = process.env.TRAILIE_EVAL_CONSUMPTION_DIR;
const savedEvidenceDir = process.env.TRAILIE_EVAL_EVIDENCE_DIR;
process.env.TRAILIE_EVAL_CONSUMPTION_DIR = tempMarkerDir;
process.env.TRAILIE_EVAL_EVIDENCE_DIR = tempEvidenceDir;

/** Each test starts from a clean marker directory. */
beforeEach(() => {
  for (const f of fs.readdirSync(tempMarkerDir)) {
    fs.rmSync(path.join(tempMarkerDir, f), { recursive: true, force: true });
  }
});

afterAll(() => {
  if (savedMarkerDir === undefined) delete process.env.TRAILIE_EVAL_CONSUMPTION_DIR;
  else process.env.TRAILIE_EVAL_CONSUMPTION_DIR = savedMarkerDir;
  if (savedEvidenceDir === undefined) delete process.env.TRAILIE_EVAL_EVIDENCE_DIR;
  else process.env.TRAILIE_EVAL_EVIDENCE_DIR = savedEvidenceDir;
  fs.rmSync(tempMarkerDir, { recursive: true, force: true });
  fs.rmSync(tempEvidenceDir, { recursive: true, force: true });
});

// ── §3 — prerequisites ──────────────────────────────────────────────────────

const isolatedMongoReady = assertIsolatedEvalMongoIfRequired();
const describeIsolatedSpawn = isolatedMongoReady ? describe : describe.skip;

test('isolated eval Mongo availability is explicit, not a mysterious product failure', () => {
  if (!isolatedMongoReady) {
    // eslint-disable-next-line no-console
    console.warn(
      `[eval-isolated] ${ISOLATED_EVAL_MONGO_HOST}:${ISOLATED_EVAL_MONGO_PORT} is not listening; `
      + 'spawn/credential integration describes are skipped. '
      + 'Start isolated Mongo and run `npm run test:eval-isolated`.',
    );
  }
  expect(typeof isolatedMongoReady).toBe('boolean');
});

describe('Stage 14.7H §3 — subprocess prerequisites', () => {
  test('all prerequisites hold in a healthy tree', () => {
    expect(validateSubprocessPrerequisites()).toEqual({ ok: true, failures: [] });
  });

  test('the launcher uses ABSOLUTE paths, not cwd-relative ones', () => {
    for (const p of [VITE_NODE_BIN, VITEST_CONFIG, DRIVER_ABS]) {
      expect(path.isAbsolute(p)).toBe(true);
      expect(fs.existsSync(p)).toBe(true);
    }
  });

  test('the vitest config really defines the @ alias the driver needs', () => {
    const src = fs.readFileSync(VITEST_CONFIG, 'utf8');
    expect(/alias\s*:\s*\{[\s\S]*?['"]@['"]\s*:/.test(src)).toBe(true);
  });

  test('the launcher never builds a shell command string', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'liveExecutor.js'), 'utf8');
    expect(src).not.toMatch(/shell\s*:\s*true/);
    expect(src).toMatch(/spawnSync\(VITE_NODE_BIN, \[/);
  });
});

// ── §4 — the real spawn, end to end, deterministic ──────────────────────────

describeIsolatedSpawn('Stage 14.7H §4 — the real default spawn path', () => {
  let result;
  // Captured the moment the subprocess returns: the per-test marker cleanup
  // would otherwise erase the state this spawn produced.
  let markerAfterSpawn;

  beforeAll(() => {
    // Real subprocess. Deterministic providers, no key, no spend.
    result = defaultRunScenario({
      scenarioId: 'basic-02-three-day',
      runId: REAL_SUBPROCESS_RUN_ID,
      caps: CAPS,
      priorTotals: PRIOR,
      model: 'claude-sonnet-5',
      executionMode: 'deterministic',
      timeoutMs: 240000,
    });
    markerAfterSpawn = consumption.readConsumption('basic-02-three-day');
  }, 300000);

  test('the driver launches and produces a readable result (the 14.7G failure)', () => {
    expect(result).toBeTruthy();
    expect(result.boundedCode).not.toBe('driver_output_unreadable');
    expect(result.ok).toBe(true);
  });

  test('the actual generated address passed fixture, production-schema, user-creation and authentication gates', () => {
    const expected = buildRunScopedEvaluationIdentity({
      evaluationRunId: REAL_SUBPROCESS_RUN_ID,
      evaluationUserId: '0123456789abcdef01234567',
    });
    expect(result.evaluationIdentity).toEqual({
      contractPassed: true,
      authenticationFixtureCreated: true,
      productionSchemaValidated: true,
      evaluationUserCreated: true,
      authenticationSucceeded: true,
      generatedAddressHash: hashOf(expected.evaluationUserEmail),
      sharedFallbackUsed: false,
    });
  });

  test('the @/services/aiService import chain resolves', () => {
    // A resolution failure could not have produced a completed turn.
    expect(result.parsedEvents).toEqual(expect.arrayContaining(['itinerary_ready']));
  });

  test('the real Stage 14.7F harness ran the turn', () => {
    expect(result.journal).toEqual(expect.arrayContaining([
      'revision_1_received', 'revision_1_persist_succeeded',
      'itinerary_revealed', 'revision_2_persist_succeeded', 'prose_revealed',
    ]));
  });

  test('real SSE parsing, persistence, restore and cleanup completed', () => {
    expect(result.persistence.persistenceHttpRequests).toBe(2);
    expect(result.persistence.acceptedWrites).toBe(2);
    expect(result.restore.presentationState).toBe('prose_complete');
    expect(result.cleanup.ok).toBe(true);
    expect(result.cleanup.counts.evaluationUsersBeforeCleanup).toBe(1);
    expect(result.cleanup.counts.evaluationUsersAfterCleanup).toBe(0);
    expect(result.cleanup.counts.evaluationTripsAfterCleanup).toBe(0);
  });

  test('current-run cleanup preserves the separately seeded historical evaluation record', () => {
    expect(result.foreignPreservation).toEqual({
      before: { trips: 1, users: 1, leases: 0 },
      afterCurrentRunCleanup: { trips: 1, users: 1, leases: 0 },
      foreignUsersBefore: 1,
      foreignUsersAfter: 1,
      foreignTripsBefore: 1,
      foreignTripsAfter: 1,
      foreignLeasesBefore: 0,
      foreignLeasesAfter: 0,
      unchanged: true,
      fixtureTeardownSucceeded: true,
    });
  });

  test('the offline flag-off replay ran with zero provider calls', () => {
    expect(result.offlineReplay.providerCalls).toBe(0);
    expect(result.offlineReplay.ok).toBe(true);
  });

  test('NO live provider was constructed and no external network attempted', () => {
    expect(result.childLedger.liveAnthropicConstructors).toBe(0);
    expect(result.childLedger.liveAnthropicCalls).toBe(0);
    expect(result.isolation.OpenAIConstructors).toBe(0);
    expect(result.isolation.externalNonProviderNetworkAttempts).toBe(0);
    expect(result.network.approvedClaudeProviderAttempts).toBe(0);
  });

  test('the child exits and leaves one bounded JSON result', () => {
    expect(typeof result).toBe('object');
    expect(result.scenarioId).toBe('basic-02-three-day');
  });

  /**
   * §12 — the dispatch handshake is exercised by the REAL spawn. Deterministic
   * mode routes through the identical reserve → authorize → settle sequence, so
   * this proves the ordering the live run depends on, at zero cost.
   */
  test('the full dispatch handshake ran through the real subprocess', () => {
    expect(result.dispatchAuthorizations).toBe(2); // Phase A + Phase B
    expect(result.providerCallsStarted).toBe(2);
    expect(result.ledger.entries).toHaveLength(2);
    expect(result.ledger.entries.map((e) => e.phase)).toEqual(['structured', 'prose']);
    expect(result.ledger.entries.every((e) => e.settlementStatus !== 'open')).toBe(true);
  });

  test('the consumption state advanced to settled through the real spawn', () => {
    expect(markerAfterSpawn).toBeTruthy();
    expect(markerAfterSpawn.status).toBe(consumption.STATE.ATTEMPT_SETTLED);
    // The whole ordered progression happened, ending past the consuming state.
    expect(consumption.stateIndex(markerAfterSpawn.status))
      .toBeGreaterThanOrEqual(consumption.CONSUMING_FROM_INDEX);
  });

  test('the monotonic timeline was recorded across the real subprocess', () => {
    const c = result.timeline.checkpoints;
    expect(result.timeline.monotonic).toBe(true);
    expect(typeof c.turnStart).toBe('number');
    expect(c.revision1PersistenceSuccess).toBeLessThanOrEqual(c.itineraryVisible);
    expect(c.revision2PersistenceSuccess).toBeLessThanOrEqual(c.proseVisible);
    expect(result.ordering.revision1PersistedBeforeItineraryVisible).toBe(true);
    expect(result.ordering.revision2PersistedBeforeProseVisible).toBe(true);
  });

  test('no secret or complete URI appears in the driver result', () => {
    const text = JSON.stringify(result);
    expect(text).not.toMatch(/sk-[A-Za-z0-9_-]{16,}/);
    expect(text).not.toMatch(/mongodb(\+srv)?:\/\//);
    expect(text).not.toMatch(/\beyJ[A-Za-z0-9_-]{8,}\./);
  });
});

describeIsolatedSpawn('Stage 14.7O — real subprocess credential readiness path', () => {
  const sentinel = 'sk-ant-stage147o-real-subprocess-sentinel';
  const liveGates = {
    executeLive: true,
    liveProviders: true,
    providerDenyInactive: true,
    receiptValid: true,
    manifestReady: true,
    cumulativeBudgetFeasible: true,
  };
  const liveEnv = (extra = {}) => ({
    PATH: process.env.PATH,
    NODE_ENV: 'test',
    ANTHROPIC_API_KEY: sentinel,
    OPENAI_API_KEY: 'sk-openai-stage147o-must-not-cross',
    CLAUDE_PRIMARY_MODEL: 'claude-sonnet-5',
    TRAILIE_EVAL_EXECUTE_LIVE: 'true',
    TRAILIE_EVAL_LIVE_PROVIDERS: 'true',
    TRAILIE_EVAL_MODEL_ALLOWLIST: 'claude:claude-sonnet-5',
    TRAILIE_EVAL_TEST_MONGODB_URI: 'mongodb://127.0.0.1:27018/trailverse_eval_14_7',
    TRAILIE_EVAL_CONSUMPTION_DIR: tempMarkerDir,
    TRAILIE_EVAL_EVIDENCE_DIR: tempEvidenceDir,
    ...extra,
  });

  test('sentinel reaches the real child and provider adapter without a provider call or secret leak', () => {
    const result = defaultRunScenario({
      scenarioId: 'basic-02-three-day',
      runId: 'stage147o-readiness-proof',
      caps: CAPS,
      priorTotals: PRIOR,
      model: 'claude-sonnet-5',
      executionMode: 'live',
      env: liveEnv(),
      liveGates,
      readinessOnly: true,
      timeoutMs: 240000,
    });

    expect(result.ok).toBe(true);
    expect(result.credentialTrace).toEqual({
      authoritativeRunner: true,
      liveExecutor: true,
      subprocessLauncher: true,
      viteNodeScenarioDriver: true,
      scenarioChild: true,
      applicationProviderAdapter: true,
    });
    expect(result.childReadiness).toEqual({
      type: 'live_child_ready',
      providerConfigured: true,
      providerPolicyAllowsLive: true,
      providerMode: 'live',
      modelResolved: true,
      modelAllowlisted: true,
      resolvedModel: 'claude-sonnet-5',
      isolatedMongoConfigured: true,
    });
    expect(result.providerCallsStarted).toBe(0);
    expect(result.dispatchAuthorizations).toBe(0);
    expect(result.providerCorrelation.providerHttpRequests).toBe(0);
    expect(result.providerCorrelation.providerSocketConnections).toBe(0);
    expect(result.childLedger.liveOpenAiConstructors).toBe(0);
    expect(consumption.isConsumed('basic-02-three-day')).toBe(false);
    expect(JSON.stringify(result)).not.toContain(sentinel);
    expect(JSON.stringify(result)).not.toContain('sk-openai-stage147o-must-not-cross');
  }, 300000);

  test.each([
    ['missing parent key', liveEnv({ ANTHROPIC_API_KEY: '' }), liveGates, 'live_provider_not_configured'],
    ['unauthorized live run', liveEnv(), { ...liveGates, receiptValid: false }, 'live_provider_not_configured'],
    ['deny mode', liveEnv({ TRAILIE_TEST_PROVIDER_MODE: 'deny_live' }), liveGates, 'live_provider_forbidden_in_test'],
  ])('%s is refused before admission and remains non-consuming', (_label, env, gates, code) => {
    const result = defaultRunScenario({
      scenarioId: 'basic-02-three-day',
      runId: `stage147o-refusal-${code}`,
      caps: CAPS,
      priorTotals: PRIOR,
      model: 'claude-sonnet-5',
      executionMode: 'live',
      env,
      liveGates: gates,
      readinessOnly: true,
      timeoutMs: 240000,
    });
    expect(result.ok).toBe(false);
    expect(result.boundedCode).toBe(code);
    expect(result.providerCallsStarted).toBe(0);
    expect(result.dispatchAuthorizations).toBe(0);
    expect(result.parsedEvents || []).not.toContain('response_started');
    expect(consumption.isConsumed('basic-02-three-day')).toBe(false);
  }, 300000);

  test('credential removal after readiness is detected before any reservation or HTTP request', () => {
    const result = defaultRunScenario({
      scenarioId: 'basic-02-three-day',
      runId: 'stage147o-readiness-revalidation',
      caps: CAPS,
      priorTotals: PRIOR,
      model: 'claude-sonnet-5',
      executionMode: 'live',
      env: liveEnv(),
      liveGates,
      readinessOnly: true,
      removeCredentialAfterReadiness: true,
      timeoutMs: 240000,
    });
    expect(result.preDispatchRevalidation).toEqual({
      ok: false,
      boundedCode: 'live_provider_configuration_changed',
      providerReservations: 0,
      dispatchAuthorizations: 0,
    });
    expect(result.providerCorrelation.providerHttpRequests).toBe(0);
    expect(consumption.isConsumed('basic-02-three-day')).toBe(false);
  }, 300000);
});

/**
 * §4 — the test must FAIL when the explicit config argument is removed. Without
 * this, the fix could silently regress and nothing would notice until a paid run.
 */
describe('Stage 14.7H §4 — removing --config reproduces the 14.7G failure', () => {
  test('vite-node without the explicit config cannot resolve the @ alias', () => {
    const stamp = String(Date.now());
    const cfg = path.join(os.tmpdir(), `stage147h-nocfg-${stamp}.json`);
    const out = path.join(os.tmpdir(), `stage147h-nocfg-out-${stamp}.json`);
    fs.writeFileSync(cfg, JSON.stringify({
      scenarioId: 'basic-02-three-day', runId: 'stage147h-nocfg',
      caps: CAPS, priorTotals: PRIOR, model: 'claude-sonnet-5',
      executionMode: 'deterministic',
    }));

    // Deliberately WITHOUT --config: the 14.7G invocation.
    const res = spawnSync(VITE_NODE_BIN, [DRIVER_ABS, '--', cfg, out], {
      cwd: FRONTEND_ROOT, timeout: 120000, encoding: 'utf8', env: process.env,
    });

    const stderr = String(res.stderr || '');
    expect(res.status).not.toBe(0);
    expect(stderr).toMatch(/ERR_MODULE_NOT_FOUND|Failed to load url @\//);
    expect(fs.existsSync(out)).toBe(false);

    for (const f of [cfg, out]) { try { fs.unlinkSync(f); } catch { /* gone */ } }
  }, 180000);
});

// ── §7 — pre-provider failures must not consume ─────────────────────────────

describe('Stage 14.7H §7 — no pre-provider failure consumes a scenario', () => {
  // Stage 14.7K §2 — the executor's default list is the AUTHORIZED manifest.
  const SCEN = [...APPROVED_SCENARIOS];

  /** Each prerequisite failure, through the REAL validator's failure path. */
  const prerequisiteFailures = [
    'vite_node_executable_missing',
    'vitest_config_missing',
    'driver_module_missing',
    'config_missing_at_alias',
    'frontend_cwd_missing',
  ];

  test.each(prerequisiteFailures)('prerequisite failure %s does not consume', async (code) => {
    const result = await executeLiveScenarios({
      ...SEQUENCING_GATES,
      env: {
        TRAILIE_EVAL_MAX_REQUESTS: '12', TRAILIE_EVAL_MAX_INPUT_TOKENS: '180000',
        TRAILIE_EVAL_MAX_OUTPUT_TOKENS: '80000', TRAILIE_EVAL_MAX_TOTAL_COST_USD: '1.50',
        CLAUDE_PRIMARY_MODEL: 'claude-sonnet-5', NODE_ENV: 'test',
      },
      runId: 'stage147h-prereq',
      validatePrerequisites: () => ({ ok: false, failures: [code] }),
      runScenario: async () => { throw new Error('must not spawn'); },
    });

    expect(result.liveExecutionStarted).toBe(false);
    expect(result.scenariosRun).toBe(0);
    expect(result.consumedScenarios).toBe(0);
    expect(result.stopReason).toBe(`launch_prerequisites_failed:${code}`);
    expect(consumption.availability(SCEN).consumedScenarios).toBe(0);
    // No consuming marker was written, so no reset acknowledgement is needed.
    expect(consumption.isConsumed(APPROVED_SCENARIOS[0])).toBe(false);
  });

  /** Failures that occur inside the driver, after launch but before dispatch. */
  const driverFailures = [
    'driver_output_unreadable',       // import / bootstrap failure
    'child_boot_timeout',             // child bootstrap failure
    'evaluation_mongo_uri_invalid',   // local Mongo unavailable
    'child_failed',                   // authentication fixture failure
    'live_provider_not_configured',   // missing Anthropic configuration
  ];

  test.each(driverFailures)('driver failure %s does not consume', async (code) => {
    const result = await executeLiveScenarios({
      ...SEQUENCING_GATES,
      env: {
        TRAILIE_EVAL_MAX_REQUESTS: '12', TRAILIE_EVAL_MAX_INPUT_TOKENS: '180000',
        TRAILIE_EVAL_MAX_OUTPUT_TOKENS: '80000', TRAILIE_EVAL_MAX_TOTAL_COST_USD: '1.50',
        CLAUDE_PRIMARY_MODEL: 'claude-sonnet-5', NODE_ENV: 'test',
      },
      runId: 'stage147h-driverfail',
      runScenario: async ({ scenarioId }) => ({
        scenarioId, ok: false, boundedCode: code, providerCallsStarted: 0,
      }),
    });

    expect(result.liveExecutionStarted).toBe(false);
    expect(result.consumedScenarios).toBe(0);
    expect(consumption.isConsumed(APPROVED_SCENARIOS[0])).toBe(false);
    // `launch_attempted` was recorded, and is explicitly NON-consuming.
    expect(consumption.readConsumption(APPROVED_SCENARIOS[0]).status)
      .toBe(consumption.STATE.LAUNCH_ATTEMPTED);
  });

  test('a cap refusal before dispatch does not consume', () => {
    // The driver refuses at reserve and never reaches dispatch authorization.
    consumption.recordState({
      scenarioId: 'basic-02-three-day', runId: 'r', state: consumption.STATE.RESERVATION_APPROVED,
    });
    expect(consumption.isConsumed(APPROVED_SCENARIOS[0])).toBe(false);
  });
});

// ── §8 — post-dispatch crashes remain consumed ──────────────────────────────

describe('Stage 14.7H §8 — a crash after dispatch authorization stays consumed', () => {
  test('dispatch authorization alone consumes, with no settlement evidence', () => {
    consumption.authorizeProviderDispatch({
      scenarioId: 'basic-02-three-day', runId: 'crash-run', providerAttemptNumber: 1,
    });
    // Simulates the crash: nothing further is ever recorded.
    expect(consumption.isConsumed('basic-02-three-day')).toBe(true);
    const marker = consumption.readConsumption('basic-02-three-day');
    expect(marker.status).toBe(consumption.STATE.DISPATCH_AUTHORIZED);
    expect(marker.providerAttemptNumber).toBe(1);
  });

  test('an automatic rerun is refused', async () => {
    consumption.authorizeProviderDispatch({ scenarioId: APPROVED_SCENARIOS[0], runId: 'crash-run' });
    const result = await executeLiveScenarios({
      ...SEQUENCING_GATES,
      env: {
        TRAILIE_EVAL_MAX_REQUESTS: '12', TRAILIE_EVAL_MAX_INPUT_TOKENS: '180000',
        TRAILIE_EVAL_MAX_OUTPUT_TOKENS: '80000', TRAILIE_EVAL_MAX_TOTAL_COST_USD: '1.50',
        CLAUDE_PRIMARY_MODEL: 'claude-sonnet-5', NODE_ENV: 'test',
      },
      runId: 'later-run',
      runScenario: async () => { throw new Error('must not run a consumed scenario'); },
    });
    expect(result.stopReason).toBe('scenario_already_consumed');
    expect(result.scenariosRun).toBe(0);
  });

  test('the reviewed reset REFUSES a scenario that actually dispatched', () => {
    // A literal id, not the manifest's: this test is about the reset mechanism
    // itself, and it must keep working for ANY scenario the mechanism is
    // pointed at — including the permanently-consumed original.
    consumption.authorizeProviderDispatch({ scenarioId: 'basic-02-three-day', runId: 'crash-run' });
    consumption.recordVoidedAttempt({
      scenarioId: 'basic-02-three-day', runId: 'crash-run', reason: 'crash', providerCallsStarted: 1,
    });
    const r = consumption.resetConsumptionForReviewedInstruction({
      scenarioId: 'basic-02-three-day', runId: 'crash-run',
      acknowledgement: consumption.REVIEWED_RESET_ACK,
      evidence: {
        providerCallsStarted: 1, providerLedgerEntries: 1, providerReservations: 1,
        childApplicationBoots: 1, evaluationUsersCreated: 1, evaluationTripsCreated: 1,
        inputTokens: 1500, outputTokens: 900, costUsd: 0.02,
      },
    });
    expect(r.reset).toBe(false);
    expect(r.refusals).toEqual(expect.arrayContaining(['provider_calls_started_nonzero']));
    expect(consumption.isConsumed('basic-02-three-day')).toBe(true);
  });

  test('unknown usage is never silently recorded as zero cost', () => {
    const { createLiveProviderLedger, OUTCOME } = require('../liveProviderLedger');
    const ledger = createLiveProviderLedger({ model: 'claude-sonnet-5', caps: CAPS });
    const a = ledger.beginAttempt({ scenarioId: 's', phase: 'structured', attemptNumber: 1, maxOutputTokens: 6000 });
    ledger.settleAttempt(a.reservationId, { usage: null, outcome: OUTCOME.FAILED });
    const row = ledger.report().entries[0];
    expect(row.settlementStatus).toBe('settled_reserved');
    expect(row.estimatedCostUsd).toBeGreaterThan(0);
  });
});

// ── §2 — the reviewed reset, end to end ─────────────────────────────────────

describe('Stage 14.7H §2 — reviewed reset of a pre-provider launch failure', () => {
  const SCEN = 'basic-02-three-day';
  const RUN = 'stage147g-msfhjxlj-de436b';
  const evidence = {
    providerCallsStarted: 0, providerLedgerEntries: 0, providerReservations: 0,
    childApplicationBoots: 0, evaluationUsersCreated: 0, evaluationTripsCreated: 0,
    inputTokens: 0, outputTokens: 0, costUsd: 0,
  };

  function seedLegacyConsumedMarker() {
    fs.writeFileSync(consumption.markerPath(SCEN), JSON.stringify({
      stage: '14.7', scenarioId: SCEN, runId: RUN, providerAttemptStarted: true,
    }));
  }

  test('a legacy marker with no status reads as CONSUMED (conservative)', () => {
    seedLegacyConsumedMarker();
    expect(consumption.isConsumed(SCEN)).toBe(true);
  });

  test('the reset requires the exact acknowledgement string', () => {
    seedLegacyConsumedMarker();
    consumption.recordVoidedAttempt({ scenarioId: SCEN, runId: RUN, reason: 'driver_output_unreadable' });
    for (const ack of ['', 'yes', 'REVIEWED_RESET', consumption.REVIEWED_RESET_ACK.toLowerCase()]) {
      const r = consumption.resetConsumptionForReviewedInstruction({ scenarioId: SCEN, runId: RUN, acknowledgement: ack, evidence });
      expect(r.reset).toBe(false);
      expect(r.refusals).toContain('acknowledgement_mismatch');
    }
  });

  test('the reset requires a matching run id', () => {
    seedLegacyConsumedMarker();
    consumption.recordVoidedAttempt({ scenarioId: SCEN, runId: RUN, reason: 'driver_output_unreadable' });
    const r = consumption.resetConsumptionForReviewedInstruction({
      scenarioId: SCEN, runId: 'some-other-run', acknowledgement: consumption.REVIEWED_RESET_ACK, evidence,
    });
    expect(r.reset).toBe(false);
    expect(r.refusals).toContain('run_id_mismatch');
  });

  test('the reset requires the void audit record to exist FIRST', () => {
    seedLegacyConsumedMarker();
    const r = consumption.resetConsumptionForReviewedInstruction({
      scenarioId: SCEN, runId: RUN, acknowledgement: consumption.REVIEWED_RESET_ACK, evidence,
    });
    expect(r.reset).toBe(false);
    expect(r.refusals).toContain('voided_audit_record_missing');
  });

  test('with every precondition met the scenario returns to available', () => {
    seedLegacyConsumedMarker();
    const v = consumption.recordVoidedAttempt({
      scenarioId: SCEN, runId: RUN, reason: 'driver_output_unreadable', providerCallsStarted: 0,
    });
    expect(v.record.status).toBe('voided_pre_provider_launch_failure');
    expect(v.record.costUsd).toBe(0);

    const r = consumption.resetConsumptionForReviewedInstruction({
      scenarioId: SCEN, runId: RUN, acknowledgement: consumption.REVIEWED_RESET_ACK, evidence,
    });
    expect(r.reset).toBe(true);
    expect(consumption.isConsumed(SCEN)).toBe(false);
    // The audit record SURVIVES the reset — the attempt is never erased.
    expect(consumption.readVoidedAttempts().some((x) => x.runId === RUN)).toBe(true);
  });

  test('the void record carries no secrets, paths, prompts or user data', () => {
    const v = consumption.recordVoidedAttempt({ scenarioId: SCEN, runId: RUN, reason: 'driver_output_unreadable' });
    expect(Object.keys(v.record).sort()).toEqual([
      'costUsd', 'inputTokens', 'outputTokens', 'providerCallsStarted',
      'providerRequests', 'reason', 'runId', 'scenarioId', 'status', 'voidedAt',
    ]);
  });
});
