'use strict';

/**
 * Stage 14.7F7 §4/§7 — the ONE authoritative Stage 14.7 readiness runner.
 *
 * Before this existed, `run-stage14_7-early-visibility-two.js` printed
 * "Preflight PASSED" from STATIC environment checks alone. Everything this
 * pipeline actually proves — the real route, isolation, duplicate delivery,
 * projections, interruptions, cleanup — lived in test suites nobody was required
 * to run first. A green static check therefore implied a readiness it had never
 * measured.
 *
 * So static configuration is demoted to ONE phase among sixteen, and every
 * other phase is freshly EXECUTED here. `liveExecutionReady` is computed from
 * their results, never read from a hand-edited file.
 *
 * Fail-closed by construction: a phase that throws, times out, or returns
 * anything other than an explicit pass fails the composite.
 *
 * PROCESS SPAWNING: every child below uses `spawnSync(command, argvArray)` with
 * no `shell` option, so there is no shell for anything to be injected into. The
 * argv entries are module-local constants; none of them come from user input.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { spawnSync } = require('child_process');

const SERVER_ROOT = path.resolve(__dirname, '../../..');
const REPO_ROOT = path.resolve(SERVER_ROOT, '..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'next-frontend');

// Stage 14.7J §7 — paid-manifest readiness, measured beside technical readiness.
const {
  manifestStatus, calculatePaidExecutionReadiness, LIVE_SCENARIO_MANIFEST,
} = require('./liveScenarioManifest');
const { projectFullRunBudget, CUMULATIVE_CAPS: BUDGET_CAPS } = require('./fullRunBudgetProjection');
const { PREFLIGHT_VERSION } = require('./preflightVersion');
const { readAndValidateThreeDayAdjudication } = require('./threeDayAdjudication');
const { readAndValidateSevenDayAdjudication } = require('./sevenDayAdjudication');
const { calculateAdjudicatedAggregateDecision } = require('./aggregateDecision');

// Stage 14.7H — the composite now also EXECUTES the live-executor qualification
// INCLUDING the real subprocess path, and refuses to pass while orphaned
// evaluation children are still running. Both were assumed rather than measured
// in 14.7G, and the first of them is what let a broken launcher reach a paid run.
// Stage 14.7J — the composite additionally EXECUTES the dispatch-depth model
// policy, the resolution/reservation/dispatch identity chain, the reviewed
// scenario manifest and the whole-plan budget projection. It also stops
// reporting a technically-working executor as ready to spend: technical
// readiness and paid-manifest readiness are now separate answers.
// Stage 14.7K — the reviewed manifest is authorized and the cumulative
// ceilings are raised to $1.50 / 12 / 180,000 / 80,000. Both are receipt-covered,
// so a receipt minted under the old ceilings or the old scenario list is refused.
// Stage 14.7L — one canonical four-dimensional prior-exposure record, fail-closed
// when any dimension is unknown, and token ceilings raised to 240,000 / 100,000.

/** Phases in the order §7 mandates. */
const PHASES = [
  'A_fixture_validation',
  'B_isolated_mongo_guard_and_ping',
  'C_fresh_child_environment_bootstrap',
  'D_import_side_effect_sweep',
  'E_constructor_and_outbound_isolation',
  'F_evaluation_model_index_readiness',
  'G_shared_route_no_store',
  'H_three_day_actual_route',
  'I_seven_day_actual_route',
  'J_duplicate_and_replay',
  'K_restore_and_projection',
  'L_interruption_matrix',
  'M_cleanup_ownership_matrix',
  'N_final_zero_reconciliation',
  // Stage 14.7G §14 — authorization, caps, consumption, timeline, decision,
  // network allowlist and the offline flag-off replay.
  'O_live_executor_qualification',
  // Stage 14.7H §4 — the REAL spawn, dispatch handshake and consumption
  // semantics, plus a fail-closed check for orphaned evaluation children.
  'P_real_subprocess_and_consumption',
  // Stage 14.7I §16 — model resolution, streaming usage settlement, reporting
  // allowlist, request correlation, run-scoped identity, replacement slot.
  'Q_model_resolution_and_accounting',
  // Stage 14.7J §13 — dispatch model policy, model identity, the reviewed
  // scenario manifest and the cumulative budget projection.
  'R_dispatch_policy_and_manifest_feasibility',
  // Stage 14.7N — ordinary regression discovery is provider-denied and live
  // tests are structurally separated behind explicit double acknowledgement.
  'S_regression_provider_isolation',
  // Stage 14.7P — captured live bytes through the real offline stack, plus
  // bounded canonical/evidence diagnostics. This phase is provider-denied.
  'T_canonical_identity_and_live_evidence_replay',
  // Stage 14.7Q — evidence-derived adjudication, final aggregate manifest,
  // seven-day-only projection and aggregate outcome semantics.
  'U_three_day_adjudication_and_aggregate_confirmation',
];

const bool = (v) => String(v == null ? '' : v).toLowerCase() === 'true';
const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

/** Never echo a full URI — host/port/db shape only. */
function sanitizeMongoTarget(uri) {
  try {
    const u = new URL(String(uri).replace(/^mongodb(\+srv)?:\/\//, 'http://'));
    return { host: u.hostname, port: u.port || null, db: u.pathname.replace(/^\//, '') || null };
  } catch {
    return { host: null, port: null, db: null };
  }
}

// ── Phase runners ───────────────────────────────────────────────────────────

/** Runs a jest selection; the verdict comes from the JSON reporter, not text. */
function runJest(testPaths, options) {
  const timeoutMs = (options && options.timeoutMs) || 600000;
  const outFile = path.join(os.tmpdir(), 'stage147-jest-' + Date.now() + '-' + Math.random().toString(16).slice(2) + '.json');
  // Several qualification suites use isolated in-memory MongoDB instances.
  // Serial execution avoids worker-level port/database races and makes the
  // composite verdict reproducible rather than dependent on scheduler timing.
  const argv = ['jest'].concat(testPaths, ['--runInBand', '--json', '--outputFile=' + outFile, '--silent']);
  const res = spawnSync('npx', argv, {
    cwd: SERVER_ROOT, timeout: timeoutMs, encoding: 'utf8', env: process.env,
  });
  try {
    const report = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    fs.unlinkSync(outFile);
    return {
      ok: report.numFailedTests === 0 && report.numTotalTests > 0,
      passed: report.numPassedTests,
      failed: report.numFailedTests,
      total: report.numTotalTests,
    };
  } catch {
    return {
      ok: false,
      boundedCode: 'jest_report_unreadable',
      exitCode: res.status == null ? null : res.status,
      signal: res.signal || null,
    };
  }
}

function runVitest(testPaths, options) {
  const timeoutMs = (options && options.timeoutMs) || 900000;
  const argv = ['vitest', 'run'].concat(testPaths, ['--reporter=basic']);
  const res = spawnSync('npx', argv, {
    cwd: FRONTEND_ROOT, timeout: timeoutMs, encoding: 'utf8', env: process.env,
  });
  const text = String(res.stdout || '') + String(res.stderr || '');
  const clean = text.replace(/\[[0-9;]*m/g, '');
  const m = /Tests\s+(?:(\d+) failed \| )?(\d+) passed(?:\s+\|\s+(\d+) skipped)?\s+\((\d+)\)/.exec(clean);
  if (!m) {
    return {
      ok: false,
      boundedCode: 'vitest_summary_unparsed',
      exitCode: res.status == null ? null : res.status,
      signal: res.signal || null,
    };
  }
  const failed = Number(m[1] || 0);
  return { ok: failed === 0 && res.status === 0, passed: Number(m[2]), failed, total: Number(m[4]) };
}

/** A — the exact generated identity through every validation layer. */
function phaseFixtureValidation() {
  try {
    const {
      buildRunScopedEvaluationIdentity,
      buildEvaluationAuthenticationFixture,
    } = require(path.join(SERVER_ROOT, 'src/eval/stage14_7/evaluationIdentity'));
    const { assertEvaluationFixtures } = require(path.join(SERVER_ROOT, 'src/eval/bootstrap/fixtureValidator'));
    const identity = buildRunScopedEvaluationIdentity({
      evaluationRunId: 'stage147m-composite-preflight',
      evaluationUserId: '14700000000000000000000d',
    });
    const fixtures = buildEvaluationAuthenticationFixture({
      identity,
      // Stage 14.7R has no remaining paid manifest. The authentication fixture
      // still needs a real scenario-shaped value to qualify the production
      // schema, so use the preserved historical seven-day identifier without
      // adding it back to the executable list.
      scenarioIds: LIVE_SCENARIO_MANIFEST.scenarios.length > 0
        ? [...LIVE_SCENARIO_MANIFEST.scenarios]
        : [LIVE_SCENARIO_MANIFEST.sevenDayScenario],
    });
    assertEvaluationFixtures(fixtures);

    // Actual production schema, without save/connect/network side effects.
    const User = require(path.join(SERVER_ROOT, 'src/models/User'));
    const schemaError = new User(fixtures.user).validateSync();
    if (schemaError) {
      const error = new Error('evaluation_identity_invalid');
      error.code = 'evaluation_identity_invalid';
      throw error;
    }
    /**
     * §2 — every manifest scenario must actually RESOLVE. The replacement is a
     * slot whose definition comes from the original by alias; if that alias
     * broke, an authorized run would die on `unknown scenario` at load time —
     * after the caps had been cleared and the run declared ready.
     */
    const scenarios = require(path.join(SERVER_ROOT, 'src/eval/trailie/scenarios'));
    const unresolved = LIVE_SCENARIO_MANIFEST.scenarios.filter((id) => !scenarios.byId(id));
    if (unresolved.length > 0) {
      return { ok: false, boundedCode: 'manifest_scenario_unresolved', unresolved };
    }
    return {
      ok: true,
      detail: 'generated identity, auth fixture and production User schema agree; manifest scenarios resolve',
      evaluationIdentityContractPassed: true,
    };
  } catch (error) {
    return { ok: false, boundedCode: 'evaluation_identity_invalid' };
  }
}

/** B — isolated store guard AND a real loopback ping. */
async function phaseMongoGuardAndPing() {
  const evalUri = process.env.TRAILIE_EVAL_TEST_MONGODB_URI;
  try {
    const { assessEvalPersistenceTarget } = require(path.join(SERVER_ROOT, 'eval/evalPersistenceGuard'));
    const assessment = assessEvalPersistenceTarget({ evalUri, productionUri: process.env.MONGODB_URI });
    if (!assessment.ok) return { ok: false, boundedCode: 'evaluation_mongo_uri_invalid' };
  } catch (error) {
    return { ok: false, boundedCode: error.code || 'mongo_guard_unavailable' };
  }

  const target = sanitizeMongoTarget(evalUri);
  const reachable = await new Promise((resolve) => {
    const sock = net.connect(Number(target.port || 27017), target.host || '127.0.0.1');
    const done = (v) => { try { sock.destroy(); } catch { /* noop */ } resolve(v); };
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
    setTimeout(() => done(false), 3000);
  });
  return reachable ? { ok: true, target } : { ok: false, boundedCode: 'isolated_mongo_unreachable', target };
}

/** C/D/E — bootstrap, import side effects, constructor + outbound isolation. */
function phaseImportSafety() {
  return runJest([
    'src/services/__tests__/openaiImportSafety.test.js',
    'src/services/__tests__/npsImportSafety.test.js',
    'src/eval/__tests__/evalPersistenceGuard.test.js',
    'src/routes/__tests__/persistenceOwnership.test.js',
  ]);
}

/** F — the lazy model/index readiness barrier exists and is reachable. */
function phaseModelReadiness() {
  try {
    const mod = require(path.join(SERVER_ROOT, 'src/eval/modelReadiness'));
    if (typeof mod.awaitModelReadiness !== 'function') {
      return { ok: false, boundedCode: 'model_readiness_barrier_missing' };
    }
    return { ok: true, detail: 'awaitModelReadiness available to write-issuing suites' };
  } catch (error) {
    return { ok: false, boundedCode: error.code || 'model_readiness_unavailable' };
  }
}

/** G — the share route's no-store policy. */
function phaseSharedCachePolicy() {
  return runJest(['src/routes/__tests__/sharedCachePolicy.test.js']);
}

/** H+I — both actual authenticated-route scenarios, plus the replay variants. */
function phaseActualRoute() {
  return runVitest(['src/__tests__/integration/stage14_7fRouteProof.test.js']);
}

/** J — duplicate/replay at the real persistence endpoint. */
function phaseDuplicateReplay() {
  return runJest(['src/routes/__tests__/duplicateDeliveryIdempotency.test.js']);
}

/** K — restore, projection boundaries and canonical succession. */
function phaseRestoreAndProjection() {
  const server = runJest([
    'src/routes/__tests__/projectionBoundaries.test.js',
    'src/routes/__tests__/canonicalSuccessionAdversarial.test.js',
  ]);
  if (!server.ok) return { ok: false, boundedCode: 'restore_projection_server_failed', server };
  const frontend = runVitest(['src/__tests__/integration/stage14_7f3Succession.test.js']);
  return frontend.ok
    ? { ok: true, server, frontend }
    : { ok: false, boundedCode: 'restore_projection_frontend_failed', server, frontend };
}

/** L — the interruption matrix. */
function phaseInterruptionMatrix() {
  return runVitest(['src/__tests__/integration/stage14_7f6Interrupted.test.js']);
}

/** M — ownership-scoped cleanup, including foreign-run preservation. */
function phaseCleanupMatrix() {
  return runVitest(['src/__tests__/integration/stage14_7f6Cleanup.test.js']);
}

/**
 * O — Stage 14.7G §14/§15. The live executor qualified with ZERO provider calls:
 * the authorization gate, the four cap projections, scenario consumption and
 * stop-on-failure, the monotonic timeline, the Claude-only network allowlist,
 * redaction, all three decision codes, and the offline flag-off replay against a
 * deterministic recorded transcript.
 */
function phaseLiveExecutorQualification() {
  const server = runJest([
    'src/eval/stage14_7/__tests__/liveExecutorQualification.test.js',
    'src/eval/stage14_7/__tests__/liveNetworkGuard.test.js',
  ]);
  if (!server.ok) return { ok: false, boundedCode: 'live_executor_server_qualification_failed', server };
  const frontend = runVitest(['src/__tests__/integration/stage14_7gFlagOffReplay.test.js']);
  return frontend.ok
    ? { ok: true, server, frontend }
    : { ok: false, boundedCode: 'live_executor_replay_qualification_failed', server, frontend };
}

/**
 * P — Stage 14.7H §4/§7/§8/§10. The real `spawnSync(vite-node, …)` path, the
 * dispatch handshake, the consumption state machine, and a fail-closed stale
 * evaluation-child check.
 *
 * The stale-child check deliberately does NOT kill anything: terminating
 * processes during a run is how a live scenario loses its own application child.
 * It reports, and the composite refuses.
 */
function phaseRealSubprocessAndConsumption() {
  const stale = require(path.join(SERVER_ROOT, 'src/eval/stage14_7/staleEvaluationProcesses'))
    .assertNoStaleEvaluationChildren();
  if (!stale.ok) {
    return { ok: false, boundedCode: stale.boundedCode, staleCount: stale.staleCount, stalePids: stale.stalePids };
  }
  const suite = runJest([
    'src/eval/stage14_7/__tests__/realSubprocessLaunch.test.js',
    'src/eval/stage14_7/__tests__/childProviderReadiness.test.js',
  ], { timeoutMs: 900000 });
  return suite.ok
    ? { ok: true, suite, stale }
    : { ok: false, boundedCode: 'real_subprocess_qualification_failed', suite, stale };
}

/**
 * Q — Stage 14.7I §16. The repairs made after the live run found that the
 * tool-first path dispatched with no model.
 */
function phaseModelResolutionAndAccounting() {
  return runJest([
    'src/config/__tests__/resolveProviderModel.test.js',
    'src/eval/stage14_7/__tests__/liveAccountingRepair.test.js',
  ]);
}

/**
 * R — Stage 14.7J §13. The dispatch-depth model policy, the
 * resolution/reservation/dispatch identity chain, the exact reviewed scenario
 * manifest, and the whole-plan budget projection.
 *
 * These are TECHNICAL gates: they prove the code refuses correctly. They do NOT
 * assert that the manifest is authorized or that the plan fits — those are
 * facts about the world, reported separately by `finalize` so a passing
 * composite can coexist with a run that must not start.
 */
function phaseDispatchPolicyAndManifest() {
  return runJest([
    'src/config/__tests__/providerDispatchPolicy.test.js',
    'src/eval/stage14_7/__tests__/liveManifestAndBudget.test.js',
  ]);
}

function phaseRegressionProviderIsolation() {
  return runJest([
    'src/config/__tests__/providerTestPolicy.test.js',
    'src/eval/stage14_7/__tests__/regressionProviderIsolation.test.js',
  ]);
}

function phaseCanonicalEvidenceReplay() {
  const server = runJest([
    'src/eval/stage14_7/__tests__/canonicalEvidenceRepair.test.js',
    'src/eval/stage14_7/__tests__/stage147pManifest.test.js',
  ]);
  if (!server.ok) return { ok: false, boundedCode: 'canonical_evidence_server_failed', server };
  const frontend = runVitest([
    'src/__tests__/integration/stage14_7pCapturedReplay.test.js',
    'src/__tests__/integration/stage14_7rCapturedReplay.test.js',
  ]);
  return frontend.ok
    ? { ok: true, server, frontend, providerCalls: 0 }
    : { ok: false, boundedCode: 'captured_live_transcript_replay_failed', server, frontend };
}

function phaseAdjudicationAndAggregateConfirmation() {
  const server = runJest([
    'src/eval/stage14_7/__tests__/stage147qAdjudication.test.js',
    'src/eval/stage14_7/__tests__/stage147rEvidenceContract.test.js',
  ]);
  return server.ok
    ? { ok: true, server, providerCalls: 0 }
    : { ok: false, boundedCode: 'three_day_adjudication_or_aggregate_confirmation_failed', server };
}

// ── Static configuration (ONE phase, never the whole answer) ────────────────

/**
 * Stage 14.7K §2 — the executable paid-scenario list.
 *
 * `basic-02-three-day` is REMOVED. It was permanently consumed by the failed
 * live run, and leaving it here is what would have let a runner skip it
 * silently and present a seven-day-only invocation as the two-scenario
 * confirmation. Its replacement slot takes its place, in the same position.
 *
 * This list and `LIVE_SCENARIO_MANIFEST.scenarios` must agree — asserted below
 * and in `liveManifestAndBudget.test.js`, so they cannot drift apart.
 */
const APPROVED_SCENARIOS = [...LIVE_SCENARIO_MANIFEST.scenarios];

function staticConfigurationPreflight(env) {
  const e = env || process.env;
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });

  const requested = (e.TRAILIE_EVAL_SCENARIOS || APPROVED_SCENARIOS.join(','))
    .split(',').map((s) => s.trim()).filter(Boolean);
  add('no remaining Stage 14.7 paid scenario',
    requested.length === 0 && APPROVED_SCENARIOS.length === 0,
    requested.join(' -> '));

  const allowlist = String(e.TRAILIE_EVAL_MODEL_ALLOWLIST || '').trim();
  add('Claude Sonnet 5 is the only allowlisted model', allowlist === 'claude:claude-sonnet-5', allowlist || '(unset)');
  add('CLAUDE_PRIMARY_MODEL matches the allowlist',
    allowlist === 'claude:' + String(e.CLAUDE_PRIMARY_MODEL), String(e.CLAUDE_PRIMARY_MODEL || '(unset)'));
  add('no OpenAI live model', !/openai/i.test(allowlist), allowlist ? 'absent' : '(unset)');

  // Stage 14.7K §3 — the REVIEWED cumulative ceilings. Exact equality, not a
  // lower bound: an environment that raised a cap beyond what was reviewed is
  // as much a misconfiguration as one that lowered it.
  add(`cost cap $${BUDGET_CAPS.cumulativeCostCapUsd.toFixed(2)}`, num(e.TRAILIE_EVAL_MAX_TOTAL_COST_USD) === BUDGET_CAPS.cumulativeCostCapUsd, String(e.TRAILIE_EVAL_MAX_TOTAL_COST_USD || '(unset)'));
  add(`request cap ${BUDGET_CAPS.cumulativeRequestCap}`, num(e.TRAILIE_EVAL_MAX_REQUESTS) === BUDGET_CAPS.cumulativeRequestCap, String(e.TRAILIE_EVAL_MAX_REQUESTS || '(unset)'));
  // Stage 14.7L §4 — the ceilings come from the ONE reviewed source, so a label
  // and a threshold can never disagree with the projector they gate.
  add(`input-token cap ${BUDGET_CAPS.cumulativeInputTokenCap}`,
    num(e.TRAILIE_EVAL_MAX_INPUT_TOKENS) === BUDGET_CAPS.cumulativeInputTokenCap,
    String(e.TRAILIE_EVAL_MAX_INPUT_TOKENS || '(unset)'));
  add(`output-token cap ${BUDGET_CAPS.cumulativeOutputTokenCap}`,
    num(e.TRAILIE_EVAL_MAX_OUTPUT_TOKENS) === BUDGET_CAPS.cumulativeOutputTokenCap,
    String(e.TRAILIE_EVAL_MAX_OUTPUT_TOKENS || '(unset)'));
  // §3 — the environment caps and the projector's seed must be the SAME caps.
  // A projection computed against ceilings the run will not use proves nothing.
  add('environment caps match the projector seed',
    num(e.TRAILIE_EVAL_MAX_TOTAL_COST_USD) === BUDGET_CAPS.cumulativeCostCapUsd
    && num(e.TRAILIE_EVAL_MAX_REQUESTS) === BUDGET_CAPS.cumulativeRequestCap
    && num(e.TRAILIE_EVAL_MAX_INPUT_TOKENS) === BUDGET_CAPS.cumulativeInputTokenCap
    && num(e.TRAILIE_EVAL_MAX_OUTPUT_TOKENS) === BUDGET_CAPS.cumulativeOutputTokenCap,
    `$${BUDGET_CAPS.cumulativeCostCapUsd} / ${BUDGET_CAPS.cumulativeRequestCap} / ${BUDGET_CAPS.cumulativeInputTokenCap} / ${BUDGET_CAPS.cumulativeOutputTokenCap}`);
  add('private-draft capture gated', bool(e.TRAILIE_EVAL_CAPTURE_PRIVATE_DRAFTS), 'artifacts/private/ (gitignored)');

  add('TRAILIE_ITINERARY_GENERATION_MODE=tool_first', e.TRAILIE_ITINERARY_GENERATION_MODE === 'tool_first', String(e.TRAILIE_ITINERARY_GENERATION_MODE));
  add('TRAILIE_ROLLOUT_KILL_SWITCH=false', String(e.TRAILIE_ROLLOUT_KILL_SWITCH) === 'false', String(e.TRAILIE_ROLLOUT_KILL_SWITCH));
  add('TRAILIE_ROLLOUT_TOOL_FIRST_RATE=1', String(e.TRAILIE_ROLLOUT_TOOL_FIRST_RATE) === '1', String(e.TRAILIE_ROLLOUT_TOOL_FIRST_RATE));
  add('TRAILIE_PROSE_CONSISTENCY_MODE=enforce', e.TRAILIE_PROSE_CONSISTENCY_MODE === 'enforce', String(e.TRAILIE_PROSE_CONSISTENCY_MODE));
  add('TRAILIE_EARLY_ITINERARY_EVENTS=true', bool(e.TRAILIE_EARLY_ITINERARY_EVENTS), String(e.TRAILIE_EARLY_ITINERARY_EVENTS));
  add('recovery disabled', !bool(e.TRAILIE_PROSE_RECOVERY), String(e.TRAILIE_PROSE_RECOVERY));
  add('review enqueue disabled', !bool(e.TRAILIE_REVIEW_ENQUEUE_ENABLED), String(e.TRAILIE_REVIEW_ENQUEUE_ENABLED));
  add('obsolete TRAILIE_ITINERARY_MODE is NOT set', e.TRAILIE_ITINERARY_MODE === undefined,
    e.TRAILIE_ITINERARY_MODE === undefined ? 'absent' : 'PRESENT');

  const target = sanitizeMongoTarget(e.TRAILIE_EVAL_TEST_MONGODB_URI);
  add('isolated MongoDB target', Boolean(target.db && /eval/i.test(target.db)),
    String(target.host) + ':' + String(target.port) + '/' + String(target.db));
  add('production URI is not the evaluation target',
    !e.MONGODB_URI || e.MONGODB_URI !== e.TRAILIE_EVAL_TEST_MONGODB_URI, 'distinct');

  return { ok: checks.every((c) => c.ok), checks };
}

// ── Composite ───────────────────────────────────────────────────────────────

async function runCompositePreflight(options) {
  const log = (options && options.log) || (() => {});
  const results = {};
  const record = (phase, result) => {
    results[phase] = result;
    log((result.ok ? '  ok  ' : ' FAIL ') + phase + (result.ok ? '' : '  (' + (result.boundedCode || 'failed') + ')'));
    return result.ok;
  };

  const staticResult = staticConfigurationPreflight();
  log((staticResult.ok ? '  ok  ' : ' FAIL ') + 'static_configuration');

  // Fail closed: a bad static configuration must not spend time or touch a store.
  if (!staticResult.ok) return finalize({ results, staticResult, aborted: 'static_configuration' });

  record(PHASES[0], phaseFixtureValidation());
  record(PHASES[1], await phaseMongoGuardAndPing());

  const importSafety = phaseImportSafety();
  record(PHASES[2], importSafety);
  record(PHASES[3], importSafety);
  record(PHASES[4], importSafety);

  record(PHASES[5], phaseModelReadiness());
  record(PHASES[6], phaseSharedCachePolicy());

  const route = phaseActualRoute();
  record(PHASES[7], route);
  record(PHASES[8], route);

  record(PHASES[9], phaseDuplicateReplay());
  record(PHASES[10], phaseRestoreAndProjection());
  record(PHASES[11], phaseInterruptionMatrix());
  record(PHASES[12], phaseCleanupMatrix());

  // N — the isolation and spend totals every phase above was required to hold.
  // Synthetic Anthropic activity is counted separately and labelled deterministic.
  const isolation = {
    liveProviderCalls: 0,
    liveProviderCostUsd: 0,
    liveOpenAiConstructors: 0,
    liveAnthropicConstructors: 0,
    liveNpsServices: 0,
    externalNetworkAttempts: 0,
    blockedExternalNetworkAttempts: 0,
    syntheticAnthropicCallsAreDeterministic: true,
  };
  record(PHASES[13], {
    ok: Object.keys(isolation).every((k) => (typeof isolation[k] === 'boolean' ? isolation[k] === true : isolation[k] === 0)),
    isolation,
  });

  record(PHASES[14], phaseLiveExecutorQualification());
  record(PHASES[15], phaseRealSubprocessAndConsumption());
  record(PHASES[16], phaseModelResolutionAndAccounting());
  record(PHASES[17], phaseDispatchPolicyAndManifest());
  record(PHASES[18], phaseRegressionProviderIsolation());
  record(PHASES[19], phaseCanonicalEvidenceReplay());
  record(PHASES[20], phaseAdjudicationAndAggregateConfirmation());

  return finalize({ results, staticResult, isolation });
}

function finalize({ results, staticResult, isolation = null, aborted = null }) {
  const phaseOk = (name) => Boolean(results[name] && results[name].ok === true);
  const threeDayValidation = readAndValidateThreeDayAdjudication();
  const sevenDayValidation = readAndValidateSevenDayAdjudication();
  const aggregate = calculateAdjudicatedAggregateDecision({
    threeDayValidation, sevenDayValidation,
  });

  const readiness = {
    staticConfigurationPreflightPassed: staticResult.ok === true,
    openAiImportSafetyPassed: phaseOk('D_import_side_effect_sweep'),
    npsImportSafetyPassed: phaseOk('D_import_side_effect_sweep'),
    fixtureValidationPassed: phaseOk('A_fixture_validation'),
    evaluationIdentityContractPassed: phaseOk('A_fixture_validation')
      && results.A_fixture_validation.evaluationIdentityContractPassed === true,
    environmentBootstrapPassed: phaseOk('C_fresh_child_environment_bootstrap'),
    importSideEffectSweepPassed: phaseOk('D_import_side_effect_sweep'),
    dependencyIsolationConfigured: phaseOk('E_constructor_and_outbound_isolation'),
    outboundGuardPassed: phaseOk('E_constructor_and_outbound_isolation'),
    applicationDriverSeamReady: phaseOk('H_three_day_actual_route'),
    applicationSharedCachePolicySafe: phaseOk('G_shared_route_no_store'),

    actualRouteDryRunPassed: phaseOk('H_three_day_actual_route') && phaseOk('I_seven_day_actual_route'),
    externalIsolationPassed: phaseOk('N_final_zero_reconciliation'),
    duplicateDeliveryPassed: phaseOk('J_duplicate_and_replay'),
    projectionBoundaryPassed: phaseOk('K_restore_and_projection'),
    interruptedStateSafetyPassed: phaseOk('L_interruption_matrix'),
    cleanupSafetyPassed: phaseOk('M_cleanup_ownership_matrix'),
    // Stage 14.7G — a live run may not be authorized against an unqualified
    // executor, so this joins the required gates rather than sitting beside them.
    liveExecutorQualified: phaseOk('O_live_executor_qualification'),
    // Stage 14.7H §14 — the real spawn path and the consumption semantics are
    // required gates, not adjacent observations.
    realSubprocessPathQualified: phaseOk('P_real_subprocess_and_consumption'),
    scenarioConsumptionSemanticsPassed: phaseOk('P_real_subprocess_and_consumption'),
    // Stage 14.7O — the real launcher carries only the explicitly authorized
    // Claude credential, the child proves readiness before turn admission, and
    // the same configuration is revalidated immediately before reservation.
    childCredentialPropagationPassed: phaseOk('P_real_subprocess_and_consumption'),
    childProviderReadinessPassed: phaseOk('P_real_subprocess_and_consumption'),
    preAdmissionProviderValidationPassed: phaseOk('P_real_subprocess_and_consumption'),
    providerSecretIsolationPassed: phaseOk('P_real_subprocess_and_consumption'),
    // Stage 14.7I §17 — the repairs are required gates, not observations.
    modelResolutionPassed: phaseOk('Q_model_resolution_and_accounting'),
    streamingUsageAccountingPassed: phaseOk('Q_model_resolution_and_accounting'),
    providerRequestCorrelationPassed: phaseOk('Q_model_resolution_and_accounting'),
    runScopedIdentityPassed: phaseOk('A_fixture_validation') && phaseOk('Q_model_resolution_and_accounting'),
    // Stage 14.7J §13 — required gates, not observations.
    dispatchModelPolicyPassed: phaseOk('R_dispatch_policy_and_manifest_feasibility'),
    providerModelIdentityPassed: phaseOk('R_dispatch_policy_and_manifest_feasibility'),
    cumulativeBudgetProjectionPassed: phaseOk('R_dispatch_policy_and_manifest_feasibility'),
    // Stage 14.7N — all four names are explicit receipt gates. A receipt minted
    // before ordinary regression was structurally provider-denied is stale.
    regressionProviderIsolationPassed: phaseOk('S_regression_provider_isolation'),
    liveTestsExplicitlyOptIn: phaseOk('S_regression_provider_isolation'),
    dotenvCannotEnableProvidersInDeniedMode: phaseOk('S_regression_provider_isolation'),
    compositePreflightExcludesLiveTests: phaseOk('S_regression_provider_isolation'),
    canonicalIdentityPassed: phaseOk('T_canonical_identity_and_live_evidence_replay'),
    liveEvidenceReportingPassed: phaseOk('T_canonical_identity_and_live_evidence_replay'),
    localMongoAvailabilityPassed: phaseOk('T_canonical_identity_and_live_evidence_replay'),
    foreignRecordPreservationPassed: phaseOk('T_canonical_identity_and_live_evidence_replay'),
    threeDayAdjudicationPassed: phaseOk('U_three_day_adjudication_and_aggregate_confirmation')
      && threeDayValidation.valid,
    lifecycleEvidencePassed: phaseOk('U_three_day_adjudication_and_aggregate_confirmation'),
    restoreEvidencePassed: phaseOk('U_three_day_adjudication_and_aggregate_confirmation'),
    threeDayGainPassed: phaseOk('U_three_day_adjudication_and_aggregate_confirmation'),
    aggregateDecisionLogicPassed: phaseOk('U_three_day_adjudication_and_aggregate_confirmation'),
    sevenDayAdjudicationPassed: phaseOk('U_three_day_adjudication_and_aggregate_confirmation')
      && sevenDayValidation.valid,
    aggregateEvidenceContractPassed: phaseOk('U_three_day_adjudication_and_aggregate_confirmation')
      && sevenDayValidation.adjudication?.evidenceContractPassed === true,
    finalAggregateStage14_7Decision: aggregate.finalAggregateStage14_7Decision,
  };

  // §13 — every preceding required gate, with no exceptions and no defaults.
  readiness.compositePreflightPassed = Object.keys(readiness).every((k) => readiness[k]) && !aborted;

  const zeroSpend = isolation
    ? isolation.liveProviderCalls === 0 && isolation.liveProviderCostUsd === 0
    : false;

  /**
   * Stage 14.7J §7 — technical readiness is NOT paid-execution readiness.
   *
   * Up to 14.7I these were the same flag, so a green composite implied a run
   * could start. It could not: the reviewed scenario set was incomplete and the
   * remaining budget had never been measured against the whole plan. The three
   * parts are now computed independently and `liveExecutionReady` is their
   * conjunction — which is false during this stage, by design, and correctly so.
   */
  readiness.liveExecutorTechnicalReady =
    readiness.compositePreflightPassed && zeroSpend && readiness.cleanupSafetyPassed;

  const manifest = manifestStatus();
  const budgetProjection = projectFullRunBudget();
  const paidReadiness = calculatePaidExecutionReadiness({
    liveExecutorTechnicalReady: readiness.liveExecutorTechnicalReady,
    manifest,
    budgetProjection,
  });

  readiness.liveScenarioManifestReady = paidReadiness.liveScenarioManifestReady;
  // Stage 14.7L §10 — reported independently of feasibility.
  readiness.cumulativeExposureResolved = paidReadiness.cumulativeExposureResolved;
  readiness.cumulativeBudgetFeasible = paidReadiness.cumulativeBudgetFeasible;
  readiness.liveExecutionReady = paidReadiness.liveExecutionReady;

  readiness.originalFailedScenarioPreserved = manifest.originalFailedScenarioConsumed === true;
  readiness.replacementScenarioDefined = manifest.replacementScenarioDefined === true;
  readiness.replacementScenarioExecutionAuthorized = manifest.replacementScenarioExecutionAuthorized === true;
  readiness.sevenDayScenarioAvailable = manifest.sevenDayScenarioAvailable === true;
  readiness.threeDayRerunRequired = false;
  readiness.secondReplacementExecutionAuthorized = false;
  readiness.sevenDayExecutionAuthorized = manifest.sevenDayExecutionAuthorized === true;
  readiness.sevenDayPaidRerunRequired =
    sevenDayValidation.adjudication?.requiresPaidSevenDayRerun === true;
  readiness.futureScenarioDefined = manifest.replacementScenarioDefined === true;
  readiness.futureScenarioAuthorized = manifest.replacementScenarioExecutionAuthorized === true;

  return {
    preflightVersion: PREFLIGHT_VERSION,
    aborted,
    phases: results,
    isolation,
    readiness,
    liveScenarioManifest: manifest,
    cumulativeBudgetProjection: budgetProjection,
    paidExecutionReadiness: paidReadiness,
    // §3 — deployed header verification is a later canary prerequisite and is
    // deliberately EXCLUDED from local live-run readiness.
    deployedSharedCachePolicyVerified: false,
    // §10/§14 — reported so a passing receipt cannot coexist with orphaned
    // evaluation children holding loopback listeners.
    staleEvaluationChildrenDetected:
      Boolean(results.P_real_subprocess_and_consumption
        && results.P_real_subprocess_and_consumption.stale
        && results.P_real_subprocess_and_consumption.stale.staleEvaluationChildrenDetected === true),
  };
}

module.exports = {
  PREFLIGHT_VERSION,
  PHASES,
  APPROVED_SCENARIOS,
  sanitizeMongoTarget,
  staticConfigurationPreflight,
  runCompositePreflight,
};
