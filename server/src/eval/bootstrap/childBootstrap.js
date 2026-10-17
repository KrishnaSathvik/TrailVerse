'use strict';

/**
 * Stage 14.7D2 §3 — the one fresh-child bootstrap.
 *
 * Runs as a child process (see runChildBootstrap.js). A fresh process is the
 * point: the module cache starts empty, so an import-time side effect cannot be
 * hidden by a module another test already loaded.
 *
 * Mandated order — each step is recorded so the parent can prove it happened
 * before the next one:
 *
 *   1 loadEnv                  load server/.env explicitly
 *   2 applyEvaluationOverrides evaluation values win over .env
 *   3 isolateProviderConfig    remove live provider configuration
 *   4 validateFixtures         pure fixture preflight
 *   5 validateMongoUri         eval URI is the only target
 *   6 installNetworkGuard      before ANY application import
 *   7 installAdapters          deterministic seams
 *   8 importApplication        models + application modules
 *   9 report                   bounded JSON only
 *
 * Output discipline: stdout carries one bounded JSON document. Nothing here
 * prints credentials, complete URIs, prompts, user input or provider messages.
 */

const path = require('path');

const SERVER_ROOT = path.join(__dirname, '../../..');

/** Live provider configuration removed from the child before any import. */
const LIVE_PROVIDER_KEYS = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'NPS_API_KEY',
  'RESEND_API_KEY',
  'OPENWEATHER_API_KEY',
  'GMAPS_SERVER_KEY',
  'GOOGLE_MAPS_API_KEY',
  'TAVILY_API_KEY',
  'SERPER_API_KEY',
  'BRAVE_SEARCH_API_KEY',
  'UNSPLASH_ACCESS_KEY',
  // RIDB (Recreation.gov) permits — found dialing out during the Stage 14.7E
  // route proof because it was missing from this list.
  'RIDB_API_KEY'
];

/** Evaluation overrides that must win over anything in .env. */
const EVALUATION_OVERRIDES = {
  NODE_ENV: 'test',
  TRAILIE_REVIEW_WORKER_ENABLED: 'false',
  TRAILIE_REVIEW_ENQUEUE_ENABLED: 'false',
  TRAILIE_ROLLOUT_KILL_SWITCH: 'true',
  // Prose recovery must do no lease or provider work during evaluation.
  TRAILIE_PROSE_CONSISTENCY_MODE: 'off'
};

const DEFAULT_FIXTURES = {
  user: {
    name: 'Stage 147 Eval',
    email: 'stage147eval@example.com',
    password: 'eval-fixture-password'
  },
  scenarioIds: ['stage147-early-visibility', 'stage147-interrupted-cleanup']
};

const MODULE_CLASSES = {
  openaiService: '../../services/openaiService',
  npsService: '../../services/npsService',
  anthropicAdapter: '../../services/claudeService',
  weather: '../../services/enhancedParkService',
  parkImages: '../../services/parkExploreIndexService',
  blogContext: '../../services/factsService',
  webSearch: '../../services/trailieFetchPlanner',
  geocoding: '../../services/geocodePlaceService',
  authMiddleware: '../../middleware/auth',
  aiRouter: '../../routes/ai',
  application: '../../app'
};

/** Bounded step recorder. */
function createTrace() {
  const steps = [];
  return {
    steps,
    run(name, fn) {
      const startedAt = Date.now();
      try {
        const detail = fn();
        steps.push({ step: name, order: steps.length + 1, outcome: 'ok', elapsedMs: Date.now() - startedAt, ...(detail ? { detail } : {}) });
        return { ok: true, value: detail };
      } catch (error) {
        steps.push({
          step: name,
          order: steps.length + 1,
          outcome: 'failed',
          elapsedMs: Date.now() - startedAt,
          boundedCode: error.code || 'bootstrap_step_failed',
          ...(error.fields ? { fields: error.fields } : {})
        });
        return { ok: false, error };
      }
    }
  };
}

function bootstrap({ fixtures = DEFAULT_FIXTURES, task = 'sweep' } = {}) {
  const trace = createTrace();
  let guard = null;
  let adapters = null;
  let probe = null;
  const result = { task, ok: false, steps: trace.steps };

  // ── 1. Load server/.env explicitly ──
  const envStep = trace.run('loadEnv', () => {
    require('dotenv').config({ path: path.join(SERVER_ROOT, '.env') });
    // Presence booleans only — never the values.
    return { dotenvLoaded: true, sawMongoUri: !!process.env.MONGODB_URI };
  });
  if (!envStep.ok) return finish(result, trace, guard, adapters, probe);

  // ── 2. Evaluation overrides win over .env ──
  trace.run('applyEvaluationOverrides', () => {
    for (const [key, value] of Object.entries(EVALUATION_OVERRIDES)) process.env[key] = value;
    if (!process.env.TRAILIE_EVAL_TEST_MONGODB_URI) {
      process.env.TRAILIE_EVAL_TEST_MONGODB_URI = 'mongodb://127.0.0.1:27018/trailverse_eval_14_7';
    }
    return { overridesApplied: Object.keys(EVALUATION_OVERRIDES).length };
  });

  // ── 3. Remove live provider configuration ──
  trace.run('isolateProviderConfig', () => {
    const removed = [];
    for (const key of LIVE_PROVIDER_KEYS) {
      if (process.env[key] !== undefined) {
        delete process.env[key];
        removed.push(key);
      }
    }
    // MONGODB_URI may remain in memory but must never be selected.
    return { removedCount: removed.length, removedKeys: removed, productionMongoUriStillPresent: !!process.env.MONGODB_URI };
  });

  // ── 4. Fixture preflight — before models, connection or application ──
  const fixtureStep = trace.run('validateFixtures', () => {
    const { assertEvaluationFixtures } = require('./fixtureValidator');
    assertEvaluationFixtures(fixtures);
    return { fixturesValid: true };
  });
  if (!fixtureStep.ok) {
    result.boundedCode = fixtureStep.error.code;
    result.fields = fixtureStep.error.fields || [];
    // Proven by the absence of later steps in the trace.
    result.databaseConnected = false;
    result.applicationImported = false;
    return finish(result, trace, guard, adapters, probe);
  }

  // ── 5. Isolated MongoDB URI is the only target ──
  const uriStep = trace.run('validateMongoUri', () => {
    const { assessEvalPersistenceTarget } = require('../../../eval/evalPersistenceGuard');
    const assessment = assessEvalPersistenceTarget({
      evalUri: process.env.TRAILIE_EVAL_TEST_MONGODB_URI,
      productionUri: process.env.MONGODB_URI
    });
    if (!assessment.ok) {
      const error = new Error('evaluation_mongo_uri_invalid');
      error.code = 'evaluation_mongo_uri_invalid';
      throw error;
    }
    return { evalUriAccepted: true, selectedTarget: 'loopback_27018' };
  });
  if (!uriStep.ok) {
    result.boundedCode = uriStep.error.code;
    return finish(result, trace, guard, adapters, probe);
  }

  // ── 6. Network guard BEFORE any application import ──
  trace.run('installNetworkGuard', () => {
    const { installOutboundNetworkGuard } = require('./outboundNetworkGuard');
    guard = installOutboundNetworkGuard();
    return { guardInstalled: true, phase: 'import' };
  });

  // ── 6b. Count live SDK constructions, before anything can construct one ──
  trace.run('installConstructorProbe', () => {
    const { installConstructorProbe } = require('./constructorProbe');
    probe = installConstructorProbe();
    return { probeInstalled: true, sdks: Object.keys(probe.snapshot().available) };
  });

  // ── 7. Deterministic adapters ──
  const adapterStep = trace.run('installAdapters', () => {
    const { installDeterministicAdapters } = require('./deterministicAdapters');
    adapters = installDeterministicAdapters();
    return { installed: adapters.installed, disposition: adapters.disposition };
  });
  if (!adapterStep.ok) {
    result.boundedCode = adapterStep.error.code;
    return finish(result, trace, guard, adapters, probe);
  }

  // ── 8. Import models and application modules, one class at a time ──
  const imports = [];
  trace.run('importApplication', () => {
    for (const [moduleClass, modulePath] of Object.entries(MODULE_CLASSES)) {
      const beforeNet = guard ? guard.summary().externalNetworkAttempts : 0;
      const beforeCtor = probe ? probe.totalInvocations() : 0;
      if (probe) probe.setModuleClass(moduleClass);
      const startedAt = Date.now();
      const row = { moduleClass, importSucceeded: false, liveConstructorInvocations: 0, networkAttempts: 0, boundedFailureCode: null, elapsedMs: 0 };
      try {
        require(modulePath);
        row.importSucceeded = true;
      } catch (error) {
        row.boundedFailureCode = error.code || classifyImportFailure(error);
      }
      row.elapsedMs = Date.now() - startedAt;
      row.networkAttempts = (guard ? guard.summary().externalNetworkAttempts : 0) - beforeNet;
      row.liveConstructorInvocations = (probe ? probe.totalInvocations() : 0) - beforeCtor;
      imports.push(row);
    }
    return { moduleClasses: imports.length };
  });
  result.imports = imports;

  if (guard) guard.setPhase('runtime');

  result.ok = imports.every((row) => row.importSucceeded)
    && imports.every((row) => row.networkAttempts === 0);
  if (probe) result.constructors = probe.snapshot();
  result.applicationImported = imports.find((r) => r.moduleClass === 'application')?.importSucceeded === true;
  result.databaseConnected = require('mongoose').connection.readyState !== 0;

  if (task === 'adapters') result.adapterSmoke = runAdapterSmoke(adapters);

  return finish(result, trace, guard, adapters, probe);
}

/**
 * §10 — open then close the handle types a real dry run would use, and report
 * whether each closed. Covers both the success path and the failure path
 * (no local mongod listening), because cleanup must hold either way.
 */
async function runHandleLifecycle(guard) {
  const mongoose = require('mongoose');
  const http = require('http');
  const out = { mongo: {}, httpServer: {} };

  // ── Ephemeral loopback HTTP server ──
  const server = http.createServer((req, res) => res.end('ok'));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  if (guard) guard.allowHttpPort(port);
  out.httpServer.listened = server.listening;
  out.httpServer.portClass = 'loopback_ephemeral';
  await new Promise((resolve) => server.close(resolve));
  out.httpServer.closed = server.listening === false;

  // ── MongoDB against the isolated loopback target only ──
  const target = process.env.TRAILIE_EVAL_TEST_MONGODB_URI;
  // Stage 14.8E.2 §7 — the classifier must recognise the SAME approved targets
  // the run is allowed to use. 27018 keeps its historical label; a configured
  // loopback test instance gets its own. Anything else is still rejected, so
  // the safety property (loopback-only, never Atlas) is unchanged.
  out.mongo.targetClass = /^mongodb:\/\/127\.0\.0\.1:27018\//.test(target || '')
    ? 'loopback_27018'
    : /^mongodb:\/\/127\.0\.0\.1:\d+\//.test(target || '')
      ? 'loopback_test_mongo'
      : 'rejected';
  try {
    await mongoose.connect(target, { serverSelectionTimeoutMS: 1500 });
    out.mongo.connected = true;
  } catch (error) {
    // A refused connection is an expected environment state, not a failure of
    // cleanup — what matters is that nothing is left open afterwards.
    out.mongo.connected = false;
    out.mongo.boundedCode = 'mongo_unavailable';
  }
  await mongoose.connection.close();
  out.mongo.readyStateAfterClose = mongoose.connection.readyState;
  out.mongo.closed = mongoose.connection.readyState === 0;

  out.remainingHandleTypes = [...new Set((process._getActiveHandles?.() || [])
    .map((h) => h?.constructor?.name).filter(Boolean))];

  // Importing src/app.js registers ref'd timers (socket.io ping, rate-limiter
  // and cache sweeps), so an evaluation child never exits on its own. The
  // parent must terminate it — recorded here so Stage 14.7E does not rediscover
  // it as a "hang".
  out.activeResourceCounts = (process.getActiveResourcesInfo?.() || [])
    .reduce((acc, r) => { acc[r] = (acc[r] || 0) + 1; return acc; }, {});
  out.exitsNaturally = !(out.activeResourceCounts.Timeout > 0);
  return out;
}

/** Classifies an import failure without echoing the message. */
function classifyImportFailure(error) {
  const message = String(error && error.message);
  if (/Cannot use import statement outside a module|Unexpected token/.test(message)) {
    return 'test_runtime_incompatibility';
  }
  if (/Cannot find module/.test(message)) return 'module_not_found';
  return 'import_side_effect_failure';
}

/** §8 — invoke one minimal adapter method and confirm the fixture contract. */
function runAdapterSmoke(adapters) {
  if (!adapters) return { ran: false };
  const { getNpsService } = require('../../services/npsService');
  const out = { ran: true, checks: [] };

  const park = getNpsService();
  out.checks.push({ adapter: 'nps', method: 'getNpsService', matchedFixture: park === adapters.adapters.nps });

  // A method the adapter does not define must fail clearly, not fall through.
  let fellThrough = false;
  try {
    getNpsService().getParkTours('shen');
    fellThrough = true;
  } catch (error) {
    out.checks.push({ adapter: 'nps', method: 'getParkTours', boundedFailure: /is not a function/.test(String(error.message)) });
  }
  out.checks.push({ adapter: 'nps', missingMethodFellThrough: fellThrough });
  out.recordedCalls = adapters.recorder.calls.length;
  return out;
}

function finish(result, trace, guard, adapters, probe) {
  if (probe) { result.constructors = result.constructors || probe.snapshot(); probe.uninstall(); }
  if (guard) {
    result.network = guard.summary();
    guard.uninstall();
  }
  if (adapters) adapters.uninstall();
  result.steps = trace.steps;
  return result;
}

module.exports = {
  bootstrap,
  LIVE_PROVIDER_KEYS,
  EVALUATION_OVERRIDES,
  MODULE_CLASSES,
  DEFAULT_FIXTURES
};

// When spawned as a child, emit exactly one bounded JSON document on stdout.
if (require.main === module) {
  (async () => {
    let payload;
    try {
      const argv = process.argv.slice(2);
      const task = argv[0] || 'sweep';
      const fixtures = process.env.EVAL_FIXTURES_JSON
        ? JSON.parse(process.env.EVAL_FIXTURES_JSON)
        : DEFAULT_FIXTURES;

      if (task === 'hang') {
        // Deliberate stall so the parent's PID-based timeout path can be proven.
        // Nothing is printed; the parent must terminate this process itself.
        setInterval(() => {}, 1000);
        return;
      }

      payload = bootstrap({ task, fixtures });

      if (task === 'handles') {
        const { installOutboundNetworkGuard } = require('./outboundNetworkGuard');
        let handleGuard = null;
        try { handleGuard = installOutboundNetworkGuard(); } catch { /* already uninstalled by finish() */ }
        payload.handles = await runHandleLifecycle(handleGuard);
        if (handleGuard) {
          payload.handleNetwork = handleGuard.summary();
          handleGuard.uninstall();
        }
      }
    } catch (error) {
      payload = { ok: false, boundedCode: error.code || 'child_bootstrap_failed' };
    }
    process.stdout.write(`__EVAL_JSON__${JSON.stringify(payload)}__EVAL_JSON__\n`);
    process.exit(payload.ok ? 0 : 1);
  })();
}
