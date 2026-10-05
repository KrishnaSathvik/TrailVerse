'use strict';

/**
 * Stage 14.7G §4/§13, revised by Stage 14.7H §3/§5/§9 — live execution
 * orchestration.
 *
 * Called by the authoritative runner AFTER authorization. Its job is sequencing
 * and stopping, not deciding whether the run may happen.
 *
 * The ordering IS the safety property:
 *
 *   0. validate subprocess prerequisites    ← before ANY marker is written
 *   for each approved scenario, IN ORDER:
 *     1. refuse if already consumed          ← consumed = dispatch authorized
 *     2. record `launch_attempted`           ← NON-consuming
 *     3. run the scenario in a fresh child   ← the driver consumes, at dispatch
 *     4. evaluate hard invariants
 *     5. stop the whole run if any failed    ← scenario 2 is never started
 *
 * 14.7G wrote a single consuming marker at step 2. When the driver died during
 * module resolution, a scenario was spent on a run that never reached Claude.
 * Consumption now happens inside the driver, fsynced immediately before dispatch
 * is acknowledged — so a launch failure costs nothing while a crash with a
 * request in flight is still conservatively consumed.
 *
 * `runScenario` and `validatePrerequisites` are injectable so every branch here
 * is testable with zero provider calls and zero subprocesses.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SERVER_ROOT = path.resolve(__dirname, '../../..');
const REPO_ROOT = path.resolve(SERVER_ROOT, '..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'next-frontend');
const DRIVER_ENTRY = 'src/__tests__/integration/stage14_7gLiveScenarioDriver.mjs';

const crypto = require('crypto');

const { APPROVED_SCENARIOS } = require('./compositePreflight');
const { hardInvariantFailures, calculateGain } = require('./decision');
const { isConsumed, recordState, STATE } = require('./scenarioConsumption');
const { writeEvidence, redactForReport } = require('./privateEvidence');
// Stage 14.7I §15 — a replacement run inherits the failed run's exposure.
const { cumulativeExposure } = require('./failedRunAudit');
// Stage 14.7J §6/§9 — the reviewed manifest and the whole-plan budget check.
const { assertLiveScenarioManifestAuthorized, MANIFEST_CODES } = require('./liveScenarioManifest');
const { projectFullRunBudget } = require('./fullRunBudgetProjection');
const {
  EVALUATION_IDENTITY_INVALID,
  buildRunScopedEvaluationIdentity,
  validateRunScopedEvaluationIdentity,
} = require('./evaluationIdentity');
const { buildSecureScenarioEnvironment } = require('./childProviderReadiness');

/** Absolute, repository-resolved. Never dependent on the caller's cwd. */
const VITE_NODE_BIN = path.join(FRONTEND_ROOT, 'node_modules/.bin/vite-node');
const DRIVER_ABS = path.join(FRONTEND_ROOT, DRIVER_ENTRY);

/**
 * The config is DISCOVERED rather than hardcoded. Hardcoding `vitest.config.js`
 * when the repository actually ships `vitest.config.mjs` would reintroduce the
 * same class of defect as 14.7G: a launcher confidently pointing at a file that
 * is not there.
 */
const VITEST_CONFIG_CANDIDATES = [
  'vitest.config.mjs', 'vitest.config.js', 'vitest.config.ts', 'vitest.config.mts',
];

function resolveVitestConfig() {
  for (const name of VITEST_CONFIG_CANDIDATES) {
    const candidate = path.join(FRONTEND_ROOT, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const VITEST_CONFIG = resolveVitestConfig();

/**
 * Stage 14.7H §3 — everything that must be true before a subprocess is spawned.
 *
 * The 14.7G failure was precisely here: `vite-node` resolves its config from
 * `vite.config.*`, this project defines the `@` alias only in
 * `vitest.config.js`, and nothing checked. The driver died on its first aliased
 * import — after a consumption marker had been written.
 *
 * Every prerequisite is now verified BEFORE any marker is written, so a
 * misconfigured launch costs nothing.
 */
function validateSubprocessPrerequisites() {
  const failures = [];
  const check = (ok, code) => { if (!ok) failures.push(code); };

  check(fs.existsSync(VITE_NODE_BIN), 'vite_node_executable_missing');
  // Re-resolved per call so a config removed after module load is still caught.
  const configPathNow = resolveVitestConfig();
  check(Boolean(configPathNow) && fs.existsSync(configPathNow), 'vitest_config_missing');
  check(fs.existsSync(DRIVER_ABS), 'driver_module_missing');
  check(fs.existsSync(FRONTEND_ROOT), 'frontend_cwd_missing');
  check(fs.existsSync(SERVER_ROOT), 'server_cwd_missing');

  // The alias the driver's import chain actually needs. Checked by reading the
  // config rather than by trusting that it is still there.
  let aliasDefined = false;
  try {
    const src = fs.readFileSync(configPathNow, 'utf8');
    aliasDefined = /alias\s*:\s*\{[\s\S]*?['"]@['"]\s*:/.test(src);
  } catch { aliasDefined = false; }
  check(aliasDefined, 'config_missing_at_alias');

  return { ok: failures.length === 0, failures };
}

/**
 * Runs ONE scenario in its own `vite-node` process.
 *
 * A subprocess rather than an in-process import because the frontend half is
 * ESM with build-time aliases, and because one crashed scenario must not be able
 * to take the orchestrator's ledger and markers down with it.
 */
function defaultRunScenario({
  scenarioId, runId, caps, priorTotals, model, evaluationUserId, evaluationUserEmail,
  executionMode = 'live', timeoutMs = 300000, env = process.env, liveGates = {},
  readinessOnly = false, removeCredentialAfterReadiness = false,
}) {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const configPath = path.join(os.tmpdir(), `stage147h-cfg-${stamp}.json`);
  const outputPath = path.join(os.tmpdir(), `stage147h-out-${stamp}.json`);

  const generatedIdentity = buildRunScopedEvaluationIdentity({
    evaluationRunId: runId,
    evaluationUserId: evaluationUserId || crypto.randomBytes(12).toString('hex'),
  });
  const identity = {
    ...generatedIdentity,
    ...(evaluationUserEmail ? { evaluationUserEmail } : {}),
  };
  const identityValidation = validateRunScopedEvaluationIdentity(identity);
  if (!identityValidation.ok) {
    const error = new Error(EVALUATION_IDENTITY_INVALID);
    error.code = EVALUATION_IDENTITY_INVALID;
    throw error;
  }

  fs.writeFileSync(configPath, JSON.stringify({
    scenarioId, runId, caps, priorTotals, model,
    evaluationUserId: identity.evaluationUserId,
    evaluationUserEmail: identity.evaluationUserEmail,
    executionMode,
    liveGates,
    readinessOnly,
    removeCredentialAfterReadiness,
  }));

  const secureEnvironment = buildSecureScenarioEnvironment({
    parentEnv: env, executionMode, liveGates,
  });

  // No shell: argv is an array of absolute, module-local constants plus
  // generated temp paths, so there is nothing for a shell to interpret. The
  // explicit --config is what makes the `@` alias resolve; without it the
  // driver dies on its first import (the 14.7G defect).
  const res = spawnSync(VITE_NODE_BIN, [
    '--config', resolveVitestConfig(),
    DRIVER_ABS,
    '--', configPath, outputPath,
  ], {
    // vite-node resolves its config relative to this; the application CHILD is
    // forked with cwd=server by the harness, which is what Babel/email-template
    // loading requires.
    cwd: FRONTEND_ROOT,
    timeout: timeoutMs,
    encoding: 'utf8',
    env: secureEnvironment.env,
  });

  let parsed = null;
  try {
    parsed = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    parsed.credentialTrace = {
      authoritativeRunner: secureEnvironment.credentialPresence.parent,
      liveExecutor: secureEnvironment.credentialPresence.parent,
      subprocessLauncher: secureEnvironment.credentialPresence.subprocess,
      ...(parsed.credentialTrace || {}),
    };
  } catch {
    parsed = {
      scenarioId,
      ok: false,
      boundedCode: 'driver_output_unreadable',
      exitCode: res.status == null ? null : res.status,
      signal: res.signal || null,
      // Bounded tail only — the driver never prints secrets, but the tail is
      // still truncated so an unexpected throw cannot dump an environment.
      boundedStderr: String(res.stderr || '').slice(-600),
    };
  }

  for (const f of [configPath, outputPath]) {
    try { fs.unlinkSync(f); } catch { /* already gone */ }
  }
  return parsed;
}


/**
 * A unique-per-run evaluation identity. The email must satisfy the production
 * User schema while being unmistakably scoped to one run.
 */
function makeRunScopedIdentity(runId) {
  return buildRunScopedEvaluationIdentity({
    evaluationRunId: runId,
    // Decided by the parent before the child exists; email stability comes from
    // the run id, while record ownership remains a fresh ObjectId.
    evaluationUserId: crypto.randomBytes(12).toString('hex'),
  });
}

/**
 * @param {Object} params
 * @param {Object} params.env
 * @param {string} params.runId
 * @param {Function} [params.runScenario] injectable for tests
 * @returns {Promise<Object>} execution evidence for the runner's decision step
 */
async function executeLiveScenarios({
  env,
  runId,
  scenarios = APPROVED_SCENARIOS,
  runScenario = defaultRunScenario,
  validatePrerequisites = validateSubprocessPrerequisites,
  log = () => {},
  evaluationUserId = null,
  evaluationUserEmail = null,
  /** §13 — 'deterministic' qualifies the real spawn path at zero cost. */
  executionMode = 'live',
  /**
   * Stage 14.7J §6/§9 — the two pre-consumption gates, injectable so the
   * sequencing behaviour BELOW them (consumption, stop-on-failure, cap
   * carry-forward) stays testable in isolation. The defaults are the real
   * gates, and `liveManifestAndBudget.test.js` exercises those defaults
   * directly — so an injected stub can weaken a sequencing test but can never
   * weaken the gate itself.
   */
  manifestGate = assertLiveScenarioManifestAuthorized,
  budgetProjector = projectFullRunBudget,
  /**
   * Stage 14.7L §3 — the canonical prior-exposure resolver, injectable for the
   * same reason the two gates above are: suites that redirect the evidence
   * directory to a temp path are exercising the sequencing BELOW this gate.
   * The gate itself is proven against the real resolver in
   * `priorCumulativeExposure.test.js`.
   */
  exposureResolver = cumulativeExposure,
  identityBuilder = makeRunScopedIdentity,
  liveGates = {},
} = {}) {
  /**
   * Stage 14.7I §12 — a RUN-SCOPED evaluation identity.
   *
   * The Stage 14.7 live run fell back to the shared `stage147eval@example.com`,
   * so its records were indistinguishable by ownership from every earlier run's.
   * Cleanup correctly left them alone, but only because the run happened to
   * create nothing. A run that does create records needs an identity of its own,
   * decided HERE, before the child exists (Stage 14.7F6 §12).
   */
  const e = env || process.env;
  const caps = {
    maxRequests: Number(e.TRAILIE_EVAL_MAX_REQUESTS),
    maxInputTokens: Number(e.TRAILIE_EVAL_MAX_INPUT_TOKENS),
    maxOutputTokens: Number(e.TRAILIE_EVAL_MAX_OUTPUT_TOKENS),
    maxCostUsd: Number(e.TRAILIE_EVAL_MAX_TOTAL_COST_USD),
  };
  const model = String(e.CLAUDE_PRIMARY_MODEL || '');

  const results = [];
  const evidenceFiles = [];
  let liveExecutionStarted = false;
  let stoppedAfter = null;
  let stopReason = null;

  // Stage 14.7M — identity is the first runtime gate. A bad generated identity
  // is non-execution evidence, not a scenario failure, and precedes exposure,
  // manifest, markers, reservations, child boot and network access.
  let identity;
  try {
    const generated = identityBuilder(runId);
    identity = {
      ...generated,
      ...(evaluationUserId ? { evaluationUserId } : {}),
      ...(evaluationUserEmail ? { evaluationUserEmail } : {}),
    };
    if (!validateRunScopedEvaluationIdentity(identity).ok) throw Object.assign(
      new Error(EVALUATION_IDENTITY_INVALID), { code: EVALUATION_IDENTITY_INVALID },
    );
  } catch (error) {
    return {
      runId,
      executionStatus: MANIFEST_CODES.NOT_STARTED,
      liveExecutionStarted: false,
      scenariosRun: 0,
      stoppedAfter: null,
      stopReason: EVALUATION_IDENTITY_INVALID,
      refusalReasons: [error.code || EVALUATION_IDENTITY_INVALID],
      scenarios: [],
      cleanup: { ok: true, note: 'nothing_created' },
      offlineReplay: { ok: true, note: 'not_reached' },
      evidenceFiles: [],
      caps,
      consumedScenarios: scenarios.filter((id) => isConsumed(id)).length,
      totals: null,
      liveProviderCalls: 0,
      liveProviderCostUsd: 0,
    };
  }

  /**
   * Stage 14.7I §15 — carried between scenarios AND across runs.
   *
   * The Stage 14.7 live run already spent 3 requests and up to $0.32 against the
   * cumulative $0.75. Restarting from zero here would let a replacement run
   * spend the full cap a second time, so the ledger is seeded with the prior
   * exposure and its own cap projection does the refusing.
   */
  /**
   * Stage 14.7L §3 — an unresolved prior exposure stops the run HERE, before
   * the manifest gate, the prerequisite check, any marker and any reservation.
   *
   * Reaching for `priorTotals` and finding zeros is the exact failure this
   * refuses: a run that cannot state what the failed attempt already spent
   * cannot enforce a cumulative ceiling against it.
   */
  const exposure = exposureResolver();
  if (exposure.resolved !== true) {
    log(`${MANIFEST_CODES.NOT_STARTED}: ${exposure.boundedCode} (${(exposure.reasons || []).join(', ')})`);
    return {
      runId,
      executionStatus: MANIFEST_CODES.NOT_STARTED,
      liveExecutionStarted: false,
      scenariosRun: 0,
      stoppedAfter: null,
      stopReason: exposure.boundedCode,
      refusalReasons: exposure.reasons || [],
      unknownExposureDimensions: exposure.unknownDimensions || [],
      cumulativeExposureResolved: false,
      scenarios: [],
      cleanup: { ok: true, note: 'nothing_created' },
      offlineReplay: { ok: true, note: 'not_reached' },
      evidenceFiles: [],
      caps,
      consumedScenarios: scenarios.filter((id) => isConsumed(id)).length,
      totals: null,
      liveProviderCalls: 0,
      liveProviderCostUsd: 0,
    };
  }
  let priorTotals = { ...exposure.priorTotals };

  /**
   * Stage 14.7J §6/§9/§11 — the two refusals that must precede EVERYTHING,
   * including the subprocess prerequisite check, because both are decidable
   * without touching the filesystem, a child, or a marker.
   *
   *   1. is the set about to run the exact reviewed manifest?
   *   2. does the COMPLETE remaining plan fit inside every cumulative cap?
   *
   * (2) is checked for both scenarios together. Starting the replacement and
   * only then discovering that the seven-day turn cannot finish would spend a
   * second scenario permanently — the same mistake as the first, one stage later.
   */
  const manifest = manifestGate({ requestedScenarios: scenarios });
  const budget = budgetProjector();

  const refusal = !manifest.authorized
    ? { code: manifest.boundedCode, reasons: manifest.refusals }
    : (!budget.cumulativeBudgetFeasible
      ? { code: budget.boundedCode, reasons: budget.blockingCaps }
      : null);

  if (refusal) {
    log(`${MANIFEST_CODES.NOT_STARTED}: ${refusal.code} (${refusal.reasons.join(', ')})`);
    return {
      runId,
      executionStatus: MANIFEST_CODES.NOT_STARTED,
      liveExecutionStarted: false,
      scenariosRun: 0,
      stoppedAfter: null,
      stopReason: refusal.code,
      refusalReasons: refusal.reasons,
      scenarios: [],
      cleanup: { ok: true, note: 'nothing_created' },
      offlineReplay: { ok: true, note: 'not_reached' },
      evidenceFiles: [],
      caps,
      // Nothing was consumed, so nothing new is reported as consumed. The
      // original's marker is untouched and still reads as consumed.
      consumedScenarios: scenarios.filter((id) => isConsumed(id)).length,
      totals: priorTotals,
      liveScenarioManifest: manifest.status,
      cumulativeBudgetProjection: budget,
      liveProviderCalls: 0,
      liveProviderCostUsd: 0,
    };
  }

  // Stage 14.7H §3/§9 — subprocess prerequisites are checked ONCE, before any
  // scenario is touched and before any marker of any kind is written. A launch
  // that cannot succeed must cost nothing.
  const prerequisites = validatePrerequisites();
  if (!prerequisites.ok) {
    log(`launch prerequisites failed: ${prerequisites.failures.join(', ')}`);
    return {
      runId,
      liveExecutionStarted: false,
      scenariosRun: 0,
      stoppedAfter: null,
      stopReason: `launch_prerequisites_failed:${prerequisites.failures[0]}`,
      launchPrerequisiteFailures: prerequisites.failures,
      scenarios: [],
      cleanup: { ok: true, note: 'nothing_created' },
      offlineReplay: { ok: true, note: 'not_reached' },
      evidenceFiles: [],
      caps,
      consumedScenarios: 0,
      totals: priorTotals,
    };
  }

  for (const scenarioId of scenarios) {
    // §13 — a consumed scenario is never re-run automatically, whatever the
    // reason it was consumed. `isConsumed` is now true only at or past dispatch
    // authorization, so a previous launch failure does not block anything.
    if (isConsumed(scenarioId)) {
      stoppedAfter = scenarioId;
      stopReason = 'scenario_already_consumed';
      log(`refused ${scenarioId}: already consumed`);
      break;
    }

    // §5 — NON-consuming. Records that an attempt began, so an abandoned launch
    // is still visible, without spending the scenario.
    recordState({ scenarioId, runId, state: STATE.LAUNCH_ATTEMPTED });
    log(`launch_attempted for ${scenarioId} (non-consuming)`);

    const raw = await runScenario({
      scenarioId, runId, caps, priorTotals, model, executionMode,
      evaluationUserId: identity.evaluationUserId,
      evaluationUserEmail: identity.evaluationUserEmail,
      env: e,
      liveGates,
    });

    if (raw && raw.providerCallsStarted > 0) liveExecutionStarted = true;

    // §10/§16 — raw evidence to gitignored private storage; the returned object
    // keeps only what may be reported.
    const evidence = writeEvidence({ runId, scenarioId, evidence: raw, env: e });
    if (evidence.written) evidenceFiles.push(evidence.file);

    const scenarioResult = { ...raw };
    delete scenarioResult.rawSseTranscript;
    delete scenarioResult.terminalProse;

    // §9 — gain, from the run's own monotonic marks.
    const checkpoints = (raw && raw.timeline && raw.timeline.checkpoints) || {};
    scenarioResult.gain = calculateGain({
      timeToItineraryVisibleMs: checkpoints.itineraryVisible,
      timeToProseVisibleMs: checkpoints.proseVisible,
    });

    results.push(scenarioResult);

    // Carry this scenario's spend forward.
    const cumulativeTotals = raw?.ledger?.cumulative || null;
    const t = cumulativeTotals || raw?.ledger?.totals;
    if (t) {
      priorTotals = {
        requests: cumulativeTotals
          ? (t.requests ?? priorTotals.requests)
          : ((priorTotals.requests || 0) + (t.providerRequests || 0)),
        inputTokens: cumulativeTotals
          ? (t.inputTokens || 0)
          : ((priorTotals.inputTokens || 0) + (t.inputTokens || 0)),
        outputTokens: cumulativeTotals
          ? (t.outputTokens || 0)
          : ((priorTotals.outputTokens || 0) + (t.outputTokens || 0)),
        costUsd: typeof (t.costUsd ?? t.estimatedCostUsd) === 'number'
          ? (cumulativeTotals
            ? (t.costUsd ?? t.estimatedCostUsd)
            : (priorTotals.costUsd || 0) + (t.costUsd ?? t.estimatedCostUsd))
          : priorTotals.costUsd,
        costKnown: t.costKnown !== false,
      };
    }

    // §13 — a hard failure in scenario 1 stops the run. Low gain does NOT: both
    // scenarios are required before a gain verdict can be reached at all.
    const invariants = hardInvariantFailures(scenarioResult);
    if (!invariants.ok || raw?.ok === false) {
      stoppedAfter = scenarioId;
      stopReason = raw?.ok === false
        ? (raw.boundedCode || 'scenario_driver_failed')
        : `hard_invariant_failed:${invariants.failures[0]}`;
      log(`stopping after ${scenarioId}: ${stopReason}`);
      break;
    }
  }

  // §17 — a cleanup failure in ANY scenario fails the confirmation.
  const cleanupOk = results.length > 0 && results.every((r) => r.cleanup && r.cleanup.ok === true);
  const replayOk = results.length > 0 && results.every((r) => r.offlineReplay && r.offlineReplay.ok === true);

  return {
    runId,
    liveExecutionStarted,
    scenariosRun: results.length,
    stoppedAfter,
    stopReason,
    scenarios: results,
    cleanup: { ok: cleanupOk },
    offlineReplay: { ok: replayOk },
    evidenceFiles,
    caps,
    cumulativeExposure: exposure,
    liveScenarioManifest: manifest.status,
    cumulativeBudgetProjection: budget,
    consumedScenarios: scenarios.filter((id) => isConsumed(id)).length,
    // Belt and braces: the orchestrator's own output is redacted too, so a field
    // added to the driver later cannot leak by default.
    redacted: true,
    totals: priorTotals,
  };
}

module.exports = {
  DRIVER_ENTRY,
  VITE_NODE_BIN,
  VITEST_CONFIG,
  VITEST_CONFIG_CANDIDATES,
  resolveVitestConfig,
  DRIVER_ABS,
  validateSubprocessPrerequisites,
  makeRunScopedIdentity,
  defaultRunScenario,
  executeLiveScenarios,
  // Exported for the runner's report assembly.
  redactForReport,
};
