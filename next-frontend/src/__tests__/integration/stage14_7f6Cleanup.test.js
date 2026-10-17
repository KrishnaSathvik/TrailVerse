import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import net from 'net';
import {
  startScenarioChild, driveTurn, loadScenario, BARRIER, buildRunIdentity,
} from './stage14_7fHarness';

/**
 * Stage 14.7F6 §12–§16 — ownership-scoped cleanup.
 *
 * The property under test is not "cleanup deletes things". It is that cleanup
 * deletes ONLY this run's things. Every case seeds a FOREIGN evaluation run —
 * real user, real trip, created through the real models — and proves it is still
 * there afterwards. A `deleteMany({})` or an unguarded drop would pass a
 * "current run is empty" check and fail every one of these.
 */

const TIMEOUT = 120000;
const SCENARIO = 'basic-02-three-day';

const spawned = [];

/** Parent-owned identity, decided before the child exists (§12). */
function runIdentity() {
  const evaluationRunId = `eval-14-7f6-cleanup-${randomUUID()}`;
  return buildRunIdentity(evaluationRunId);
}

async function startRun(driveOptions = null) {
  const scenario = loadScenario(SCENARIO);
  const identity = runIdentity();
  const handle = await startScenarioChild({
    scenarioId: SCENARIO,
    structuredResponse: scenario.structuredResponse,
    proseText: scenario.proseText,
    usePhaseBBarrier: driveOptions?.usePhaseBBarrier ?? true,
    ...identity,
  });
  spawned.push(handle);

  // A foreign run's records, created BEFORE this run's cleanup so preservation
  // is measured rather than assumed.
  const foreign = await handle.seedForeignRun({
    email: `stage147eval-foreign-${randomUUID()}@example.com`,
    responseId: `resp-foreign-${randomUUID()}`,
  });

  const result = driveOptions === 'skip'
    ? null
    : await driveTurn(handle, scenario, driveOptions || {});

  return { handle, identity, foreign, result, scenario };
}

const ownedIds = (run) => run.handle.observedTrips().map((t) => t.tripId);
const ownedResponseIds = (run) => run.handle.observedTrips().map((t) => t.responseId).filter(Boolean);

async function cleanupWith(run, extra = {}) {
  const before = await run.handle.counts(ownedIds(run), run.foreign.userId);
  const report = await run.handle.cleanup({
    createdTripIds: ownedIds(run),
    responseIds: ownedResponseIds(run),
    ...extra,
  });
  const after = await run.handle.counts(ownedIds(run), run.foreign.userId);
  return { before, after, report };
}

/** The §15 count object, assembled from one source of truth. */
const countObject = ({ before, after }) => ({
  evaluationTripsBeforeCleanup: before.trips,
  evaluationTripsAfterCleanup: after.trips,
  evaluationUsersBeforeCleanup: before.users,
  evaluationUsersAfterCleanup: after.users,
  foreignEvaluationTripsBeforeCleanup: before.foreign.trips,
  foreignEvaluationTripsAfterCleanup: after.foreign.trips,
  foreignEvaluationUsersBeforeCleanup: before.foreign.users,
  foreignEvaluationUsersAfterCleanup: after.foreign.users,
  recoveryLeasesBeforeCleanup: before.leases,
  recoveryLeasesAfterCleanup: after.leases,
});

function expectScopedCleanup(counts, { tripsExpected }) {
  expect(counts.evaluationTripsBeforeCleanup).toBe(tripsExpected);
  expect(counts.evaluationTripsAfterCleanup).toBe(0);
  expect(counts.evaluationUsersAfterCleanup).toBe(0);
  expect(counts.recoveryLeasesAfterCleanup).toBe(0);
  // The whole point: a foreign run is untouched.
  expect(counts.foreignEvaluationTripsAfterCleanup).toBe(counts.foreignEvaluationTripsBeforeCleanup);
  expect(counts.foreignEvaluationUsersAfterCleanup).toBe(counts.foreignEvaluationUsersBeforeCleanup);
  expect(counts.foreignEvaluationTripsAfterCleanup).toBe(1);
  expect(counts.foreignEvaluationUsersAfterCleanup).toBe(1);
}

afterAll(async () => {
  for (const handle of spawned) {
    try { await handle.shutdown(); } catch { /* kill is the backstop */ }
    handle.kill();
  }
}, TIMEOUT);

// ─────────────────────────────────────────────────────────────────────────────
// §14 — the cleanup proof matrix
// ─────────────────────────────────────────────────────────────────────────────
describe('§14 — cleanup matrix', () => {
  it('normal terminal completion', async () => {
    const run = await startRun({});
    const counts = countObject(await cleanupWith(run));
    // eslint-disable-next-line no-console
    console.log('CLEANUP normal_terminal', JSON.stringify(counts, null, 2));
    expectScopedCleanup(counts, { tripsExpected: 1 });
  }, TIMEOUT);

  it('abort before revision 1 — nothing to remove, user still cleaned', async () => {
    const run = await startRun({ barriers: { [BARRIER.A_BEFORE_REVISION_1_PERSIST]: 'abort' } });
    const counts = countObject(await cleanupWith(run));
    // eslint-disable-next-line no-console
    console.log('CLEANUP abort_before_revision_1', JSON.stringify(counts, null, 2));
    expectScopedCleanup(counts, { tripsExpected: 0 });
  }, TIMEOUT);

  it('abort after revision 1 — the itinerary-only trip is removed', async () => {
    const run = await startRun({ barriers: { [BARRIER.D_BEFORE_REVISION_2_PERSIST]: 'abort' } });
    const counts = countObject(await cleanupWith(run));
    // eslint-disable-next-line no-console
    console.log('CLEANUP abort_after_revision_1', JSON.stringify(counts, null, 2));
    expectScopedCleanup(counts, { tripsExpected: 1 });
  }, TIMEOUT);

  it('revision-2 persistence failure — the revision-1 trip is removed', async () => {
    const run = await startRun({ failPersistence: { revision2: 'conflict' } });
    const counts = countObject(await cleanupWith(run));
    // eslint-disable-next-line no-console
    console.log('CLEANUP revision_2_failure', JSON.stringify(counts, null, 2));
    expectScopedCleanup(counts, { tripsExpected: 1 });
  }, TIMEOUT);

  it('abort after revision 2 — the terminal trip is removed', async () => {
    const run = await startRun({ barriers: { [BARRIER.G_BEFORE_DONE]: 'abort' } });
    const counts = countObject(await cleanupWith(run));
    // eslint-disable-next-line no-console
    console.log('CLEANUP abort_after_revision_2', JSON.stringify(counts, null, 2));
    expectScopedCleanup(counts, { tripsExpected: 1 });
  }, TIMEOUT);
});

// ─────────────────────────────────────────────────────────────────────────────
// §14 — cleanup exception
// ─────────────────────────────────────────────────────────────────────────────
describe('§14 — cleanup exception is bounded and leaves identifiers behind', () => {
  it('reports a bounded failure with the unresolved identifiers, and no secrets', async () => {
    const run = await startRun({});
    const ids = ownedIds(run);
    const report = await run.handle.cleanup({
      createdTripIds: ids,
      responseIds: ownedResponseIds(run),
      failInjection: 'trips',
    });

    const shaped = {
      cleanupSucceeded: report.ok,
      boundedFailureCode: report.boundedCode,
      unresolvedEvaluationUserId: report.unresolvedEvaluationUserId,
      unresolvedTripIds: report.unresolvedTripIds,
      unresolvedResponseIds: report.unresolvedResponseIds,
    };
    // eslint-disable-next-line no-console
    console.log('CLEANUP exception', JSON.stringify(shaped, null, 2));

    expect(shaped.cleanupSucceeded).toBe(false);
    expect(shaped.boundedFailureCode).toBe('cleanup_trip_delete_failed');
    expect(shaped.unresolvedEvaluationUserId).toBe(run.identity.evaluationUserId);
    expect(shaped.unresolvedTripIds).toEqual(ids);

    // No credentials, URIs, tokens, prompts or conversation content anywhere.
    const serialized = JSON.stringify(report);
    for (const forbidden of ['mongodb://', 'password', 'Bearer', 'eyJ', 'ANTHROPIC', 'Day 1']) {
      expect(serialized).not.toContain(forbidden);
    }

    // The foreign run survives even a FAILED cleanup.
    const counts = await run.handle.counts(ids, run.foreign.userId);
    expect(counts.foreign.trips).toBe(1);
    expect(counts.foreign.users).toBe(1);

    // Finish for real so the run does not leak into later assertions.
    const finished = countObject(await cleanupWith(run));
    expectScopedCleanup(finished, { tripsExpected: 1 });
  }, TIMEOUT);
});

// ─────────────────────────────────────────────────────────────────────────────
// §14 — parent timeout: the child dies, the parent still owns the identifiers
// ─────────────────────────────────────────────────────────────────────────────
describe('§14 — parent timeout cleanup', () => {
  it('cleans using identifiers captured before termination, via a captured PID', async () => {
    const run = await startRun({});
    const idsBeforeKill = ownedIds(run);
    expect(idsBeforeKill.length).toBeGreaterThan(0);

    const pid = run.handle.pid;
    expect(Number.isInteger(pid)).toBe(true);
    expect(pid).toBeGreaterThan(0); // never a negative process-group target

    // Terminate the child directly by its captured positive PID. No shell
    // command, no process-group kill, no kill-by-name.
    run.handle.kill();
    await new Promise((r) => setTimeout(r, 250));
    expect(run.handle.isAlive()).toBe(false);

    // A second child, owned by the SAME parent-assigned identity, finishes the
    // cleanup the dead child could not — which only works because the parent
    // decided that identity up front (§12).
    const scenario = loadScenario(SCENARIO);
    const rescuer = await startScenarioChild({
      scenarioId: SCENARIO,
      structuredResponse: scenario.structuredResponse,
      proseText: scenario.proseText,
      ...run.identity,
    });
    spawned.push(rescuer);

    const before = await rescuer.counts(idsBeforeKill, run.foreign.userId);
    expect(before.trips).toBe(1);

    const report = await rescuer.cleanup({
      createdTripIds: idsBeforeKill,
      responseIds: ownedResponseIds(run),
    });
    const after = await rescuer.counts(idsBeforeKill, run.foreign.userId);

    expect(report.ok).toBe(true);
    expect(after.trips).toBe(0);
    expect(after.foreign.trips).toBe(1);
    expect(after.foreign.users).toBe(1);
  }, TIMEOUT);
});

// ─────────────────────────────────────────────────────────────────────────────
// §16 — process and port cleanup
// ─────────────────────────────────────────────────────────────────────────────
describe('§16 — process and port cleanup', () => {
  const portOf = (baseUrl) => Number(new URL(baseUrl).port);
  const accepts = (port) => new Promise((resolve) => {
    const sock = net.connect(port, '127.0.0.1');
    const done = (v) => { try { sock.destroy(); } catch { /* noop */ } resolve(v); };
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
    setTimeout(() => done(false), 1500);
  });

  it('the ephemeral port stops accepting connections after shutdown', async () => {
    const run = await startRun({});
    const port = portOf(run.handle.baseUrl);
    expect(await accepts(port)).toBe(true);

    await cleanupWith(run);
    const report = await run.handle.shutdown();

    // The child closes the HTTP server, sockets and mongoose, then exits
    // explicitly because known application timers stay referenced.
    expect(report).toBeTruthy();
    await new Promise((r) => setTimeout(r, 400));
    expect(await accepts(port)).toBe(false);
    expect(run.handle.isAlive()).toBe(false);
  }, TIMEOUT);

  it('local MongoDB on 127.0.0.1:27018 remains available', async () => {
    expect(await accepts(27018)).toBe(true);
  }, TIMEOUT);
});
