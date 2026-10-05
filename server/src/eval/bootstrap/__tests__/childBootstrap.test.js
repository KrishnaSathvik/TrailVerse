'use strict';

/**
 * Stage 14.7D2 §3/§7/§8/§10 — fresh-child bootstrap.
 *
 * Every case here spawns a real child process. That is deliberate: a fresh
 * module cache is the only way to prove an import has no side effect, since a
 * module another test already loaded would hide one.
 */

const fs = require('fs');
const path = require('path');
const { runChildBootstrap } = require('../runChildBootstrap');
const { MODULE_CLASSES, LIVE_PROVIDER_KEYS, EVALUATION_OVERRIDES } = require('../childBootstrap');

const CHILD_TIMEOUT_MS = 120000;
const JEST_TIMEOUT_MS = 180000;

/** One sweep shared by the assertions that only read its results. */
let sweep;
beforeAll(async () => {
  sweep = await runChildBootstrap({ task: 'adapters', timeoutMs: CHILD_TIMEOUT_MS });
}, JEST_TIMEOUT_MS);

const stepOrder = (payload) => payload.steps.map((s) => s.step);
const detailOf = (payload, step) => payload.steps.find((s) => s.step === step)?.detail;

describe('§3 — fresh-child environment order', () => {
  test('the child completes and returns a bounded payload', () => {
    expect(sweep.outcome).toBe('ok');
    expect(sweep.payload).toBeTruthy();
    expect(sweep.payload.ok).toBe(true);
  });

  test('the mandated step order is followed exactly', () => {
    expect(stepOrder(sweep.payload)).toEqual([
      'loadEnv',
      'applyEvaluationOverrides',
      'isolateProviderConfig',
      'validateFixtures',
      'validateMongoUri',
      'installNetworkGuard',
      'installConstructorProbe',
      'installAdapters',
      'importApplication'
    ]);
  });

  test('.env loading happens before application imports', () => {
    const order = stepOrder(sweep.payload);
    expect(order.indexOf('loadEnv')).toBeLessThan(order.indexOf('importApplication'));
    expect(detailOf(sweep.payload, 'loadEnv').dotenvLoaded).toBe(true);
  });

  test('the network guard is installed before any application import', () => {
    const order = stepOrder(sweep.payload);
    expect(order.indexOf('installNetworkGuard')).toBeLessThan(order.indexOf('importApplication'));
    expect(order.indexOf('installAdapters')).toBeLessThan(order.indexOf('importApplication'));
  });

  test('evaluation overrides win over .env', () => {
    expect(detailOf(sweep.payload, 'applyEvaluationOverrides').overridesApplied)
      .toBe(Object.keys(EVALUATION_OVERRIDES).length);
  });

  test('live provider configuration is removed before imports', () => {
    const detail = detailOf(sweep.payload, 'isolateProviderConfig');
    expect(detail.removedCount).toBeGreaterThan(0);
    expect(detail.removedKeys.every((k) => LIVE_PROVIDER_KEYS.includes(k))).toBe(true);
    expect(detail.removedKeys).toEqual(expect.arrayContaining(['OPENAI_API_KEY', 'NPS_API_KEY', 'ANTHROPIC_API_KEY']));
  });

  test('the isolated loopback URI is the selected MongoDB target', () => {
    const detail = detailOf(sweep.payload, 'validateMongoUri');
    expect(detail.evalUriAccepted).toBe(true);
    expect(detail.selectedTarget).toBe('loopback_27018');
  });

  test('MONGODB_URI may remain in memory but is never connected', () => {
    expect(detailOf(sweep.payload, 'isolateProviderConfig').productionMongoUriStillPresent).toBe(true);
    expect(sweep.payload.databaseConnected).toBe(false);
  });

  test('the child emits only bounded JSON and a clean stderr', () => {
    expect(sweep.stderrClean.clean).toBe(true);
    expect(sweep.stderrClean.looksLikeCredential).toBe(false);
    expect(sweep.stderrClean.looksLikeMongoUri).toBe(false);
    const serialized = JSON.stringify(sweep.payload);
    expect(serialized).not.toMatch(/sk-[A-Za-z0-9_-]{8,}/);
    expect(serialized).not.toMatch(/mongodb(\+srv)?:\/\//);
  });
});

describe('§7 — import-side-effect sweep', () => {
  test('every module class is covered', () => {
    const covered = sweep.payload.imports.map((r) => r.moduleClass);
    expect(covered.sort()).toEqual(Object.keys(MODULE_CLASSES).sort());
  });

  test('all required imports succeed with no provider keys present', () => {
    const failed = sweep.payload.imports.filter((r) => !r.importSucceeded);
    expect(failed).toEqual([]);
  });

  test('liveConstructorInvocations is 0 for every module class', () => {
    const constructed = sweep.payload.imports.filter((r) => r.liveConstructorInvocations !== 0);
    expect(constructed).toEqual([]);
  });

  test('networkAttempts is 0 for every module class', () => {
    const dialed = sweep.payload.imports.filter((r) => r.networkAttempts !== 0);
    expect(dialed).toEqual([]);
  });

  test('the clean sweep reports zero external attempts', () => {
    expect(sweep.payload.network.externalNetworkAttempts).toBe(0);
    expect(sweep.payload.network.blockedExternalNetworkAttempts).toBe(0);
    expect(sweep.payload.network.importPhaseAttempts).toBe(0);
  });

  test('constructor instrumentation actually covered the SDKs it reports on', () => {
    // Guards the guard: an uncovered SDK's count of 0 proves nothing.
    expect(sweep.payload.constructors.wrapped.anthropic).toBe(true);
    expect(sweep.payload.constructors.wrapped.openai).toBe(true);
    expect(sweep.payload.constructors.counts.anthropic).toBe(0);
    expect(sweep.payload.constructors.counts.openai).toBe(0);
  });

  test('the Express application imports in a fresh child', () => {
    expect(sweep.payload.applicationImported).toBe(true);
  });
});

describe('§8 — deterministic adapter smoke', () => {
  test('every dependency has an explicit disposition', () => {
    const disposition = detailOf(sweep.payload, 'installAdapters').disposition;
    expect(disposition).toEqual({
      nps: 'recorded_adapter',
      openai: 'absent_and_prohibited',
      anthropic: 'deterministic_provider',
      // RIDB reaches a PUBLIC recreation.gov endpoint, so removing a key cannot
      // disable it — it needs an injected fixture (Stage 14.7E finding).
      ridb: 'recorded_adapter',
      resend: 'absent_and_prohibited'
    });
  });

  test('the NPS adapter is what the accessor returns', () => {
    const check = sweep.payload.adapterSmoke.checks.find((c) => c.method === 'getNpsService');
    expect(check.matchedFixture).toBe(true);
  });

  test('a missing adapter method fails clearly and does not fall through', () => {
    const smoke = sweep.payload.adapterSmoke;
    expect(smoke.checks.find((c) => c.method === 'getParkTours').boundedFailure).toBe(true);
    expect(smoke.checks.find((c) => 'missingMethodFellThrough' in c).missingMethodFellThrough).toBe(false);
  });
});

describe('§2 — fixture failure stops the sequence', () => {
  let failed;
  beforeAll(async () => {
    failed = await runChildBootstrap({
      task: 'sweep',
      timeoutMs: CHILD_TIMEOUT_MS,
      fixtures: { user: { name: 'X', email: 'someone@gmail.com', password: 'short' }, scenarioIds: ['Bad Id'] }
    });
  }, JEST_TIMEOUT_MS);

  test('the child fails with the bounded fixture code', () => {
    expect(failed.payload.boundedCode).toBe('evaluation_fixture_invalid');
    expect(failed.exitCode).toBe(1);
  });

  test('no database connection and no application import occurred', () => {
    expect(failed.payload.databaseConnected).toBe(false);
    expect(failed.payload.applicationImported).toBe(false);
  });

  test('the sequence stops at validateFixtures — later steps never ran', () => {
    const order = stepOrder(failed.payload);
    expect(order).toEqual(['loadEnv', 'applyEvaluationOverrides', 'isolateProviderConfig', 'validateFixtures']);
    expect(order).not.toContain('importApplication');
    expect(order).not.toContain('validateMongoUri');
  });

  test('only bounded field codes are reported', () => {
    const serialized = JSON.stringify(failed.payload);
    expect(serialized).not.toContain('someone@gmail.com');
    expect(serialized).not.toContain('Bad Id');
    expect(failed.payload.fields.map((f) => f.code)).toEqual(
      expect.arrayContaining(['production_looking_identity', 'value_too_short', 'malformed_scenario_id'])
    );
  });
});

describe('§10 — child cleanup and timeout behavior', () => {
  test('MongoDB and ephemeral HTTP handles close on both paths', async () => {
    const run = await runChildBootstrap({ task: 'handles', timeoutMs: CHILD_TIMEOUT_MS });
    const handles = run.payload.handles;

    expect(handles.httpServer.listened).toBe(true);
    expect(handles.httpServer.closed).toBe(true);
    // Whether or not a local mongod answered, the connection must end closed.
    // Either approved loopback class is acceptable; anything else (including a
    // remote or Atlas target) must classify as 'rejected'.
    expect(['loopback_27018', 'loopback_test_mongo']).toContain(handles.mongo.targetClass);
    expect(handles.mongo.closed).toBe(true);
    expect(handles.mongo.readyStateAfterClose).toBe(0);
    expect(run.payload.handleNetwork.externalNetworkAttempts).toBe(0);
  }, JEST_TIMEOUT_MS);

  test('a stuck child is terminated by its captured PID and returns a bounded result', async () => {
    const run = await runChildBootstrap({ task: 'hang', timeoutMs: 3000 });

    expect(run.timedOut).toBe(true);
    expect(run.outcome).toBe('timeout');
    expect(run.boundedCode).toBe('child_bootstrap_timeout');
    expect(typeof run.pid).toBe('number');

    // The child is gone: signalling PID 0 throws ESRCH once it has exited.
    let stillAlive = true;
    try { process.kill(run.pid, 0); } catch { stillAlive = false; }
    expect(stillAlive).toBe(false);
  }, JEST_TIMEOUT_MS);

  test('importing the application leaves ref\'d timers, so explicit termination is required', async () => {
    const run = await runChildBootstrap({ task: 'handles', timeoutMs: CHILD_TIMEOUT_MS });
    const handles = run.payload.handles;

    // Recorded finding, not a defect: socket.io ping / rate-limiter / cache
    // sweeps keep the loop alive after import.
    expect(handles.activeResourceCounts.Timeout).toBeGreaterThan(0);
    expect(handles.exitsNaturally).toBe(false);

    // The child must nonetheless terminate cleanly rather than hang the parent.
    expect(run.timedOut).toBe(false);
    expect(run.exitCode).toBe(0);
  }, JEST_TIMEOUT_MS);

  test('termination targets a single PID — never a process group', () => {
    // A negative PID would signal the whole group and could reach an unrelated
    // local mongod. Assert the driver never does that.
    const src = fs.readFileSync(path.join(__dirname, '../runChildBootstrap.js'), 'utf8');
    expect(src).toMatch(/process\.kill\(pid,/);
    expect(src).not.toMatch(/process\.kill\(\s*-/);
    expect(src).not.toMatch(/killall|pkill|SIGKILL'\s*,\s*-/);
  });

  test('the child is spawned without a shell, so no value can be interpreted as a command', () => {
    const src = fs.readFileSync(path.join(__dirname, '../runChildBootstrap.js'), 'utf8');
    expect(src).toMatch(/spawn\(process\.execPath, \[CHILD_ENTRY, task\]/);
    expect(src).not.toMatch(/shell:\s*true/);
    expect(src).not.toMatch(/\bexec\(/);
  });

  test('no listener is left behind on an unexpected port', async () => {
    const run = await runChildBootstrap({ task: 'handles', timeoutMs: CHILD_TIMEOUT_MS });
    // The child exited, so nothing it opened can still be listening.
    let stillAlive = true;
    try { process.kill(run.pid, 0); } catch { stillAlive = false; }
    expect(stillAlive).toBe(false);
    expect(run.payload.handles.httpServer.closed).toBe(true);
  }, JEST_TIMEOUT_MS);
});
