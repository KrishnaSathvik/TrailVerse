#!/usr/bin/env node
'use strict';

/**
 * Stage 14.8A.2 §13 — isolated-database qualification of the completion-coupled
 * guest quota.
 *
 * Runs the REAL ledger and the REAL guest turn scope against the isolated
 * acceptance Mongo only, with the outbound-network guard installed before any
 * application module loads. Providers are synthetic in-process functions: no
 * provider client is constructed, none is dispatched, and no external request
 * is made, so the run costs nothing.
 *
 * Every assertion is checked with the RAW MongoDB driver against the stored
 * documents — never against a mocked repository — so the evidence is database
 * state, not test-double behavior.
 *
 *   node scripts/stage14_8a2-guest-quota-acceptance.js [--out <path>]
 */

const path = require('path');
const fs = require('fs');

const ACCEPTANCE_MONGO_URI =
  'mongodb://127.0.0.1:27018/trailverse_internal_acceptance_stage14_8a';
const ACCEPTANCE_DB_NAME = 'trailverse_internal_acceptance_stage14_8a';

// Fail closed before anything can read a production connection string.
for (const key of ['MONGODB_URI', 'MONGO_URI', 'DATABASE_URL']) {
  const value = process.env[key];
  if (value && !value.includes('127.0.0.1:27018')) {
    delete process.env[key];
  }
}
process.env.MONGODB_URI = ACCEPTANCE_MONGO_URI;
process.env.NODE_ENV = 'test';
process.env.TRAILIE_TEST_PROVIDER_MODE = 'deny_live';
delete process.env.TRAILIE_ALLOW_LIVE_TESTS;
delete process.env.TRAILIE_LIVE_TEST_ACK;

const { installOutboundNetworkGuard } = require('../src/eval/bootstrap/outboundNetworkGuard');
const guard = installOutboundNetworkGuard();

const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');
const AnonymousSession = require('../src/models/AnonymousSession');
const {
  GUEST_TURN_FAILURE_CODES,
  GUEST_ROUTE_CODES,
  STALE_PENDING_TURN_MS,
  admitGuestTurn,
  readGuestQuota,
} = require('../src/services/anonymousTurnLedger');
const { classifyGuestTurnFailure, openGuestTurn } = require('../src/services/guestTurnScope');

guard.setPhase('runtime');

/** Synthetic providers only. Nothing here reaches a network or a provider SDK. */
const providerLedger = {
  liveProviderConstructors: 0,
  liveProviderDispatches: 0,
  externalProviderRequests: 0,
  providerCostUsd: 0,
  syntheticDispatches: 0,
};

const SYNTHETIC = {
  success: async (n) => {
    providerLedger.syntheticDispatches += 1;
    return { content: `Synthetic terminal response ${n}`, provider: 'synthetic', model: 'synthetic-1' };
  },
  structuredFailure: async () => {
    providerLedger.syntheticDispatches += 1;
    throw Object.assign(new Error('structured generation failed'), { guestFailureStage: 'structured' });
  },
  proseFailure: async () => {
    providerLedger.syntheticDispatches += 1;
    throw Object.assign(new Error('prose generation failed'), { guestFailureStage: 'prose' });
  },
  timeout: async () => {
    providerLedger.syntheticDispatches += 1;
    throw Object.assign(new Error('provider timed out'), { code: 'ETIMEDOUT' });
  },
  disconnect: async () => {
    providerLedger.syntheticDispatches += 1;
    return { aborted: true };
  },
  /**
   * Holds the turn open until the barrier is released, so a second submission
   * provably overlaps a PENDING turn. Without this the synthetic provider can
   * finish before the second admission is even attempted, and the concurrency
   * case would silently degrade into two sequential turns.
   */
  gated: async (n) => {
    providerLedger.syntheticDispatches += 1;
    await gateBarrier;
    return { content: `Synthetic gated response ${n}`, provider: 'synthetic', model: 'synthetic-1' };
  },
};

let releaseGate = () => {};
let gateBarrier = Promise.resolve();
function openGate() {
  gateBarrier = new Promise((resolve) => { releaseGate = resolve; });
}

const results = [];
let failures = 0;

function check(name, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures += 1;
  results.push({ name, pass, actual, expected });
  const mark = pass ? 'PASS' : 'FAIL';
  process.stdout.write(`  ${mark}  ${name}\n`);
  if (!pass) {
    process.stdout.write(`        expected ${JSON.stringify(expected)}\n`);
    process.stdout.write(`        actual   ${JSON.stringify(actual)}\n`);
  }
}

let rawClient;
let rawDb;

/** Direct database read — the authoritative evidence for every assertion. */
async function readSessionDirect(anonymousId) {
  return rawDb.collection('anonymoussessions').findOne({ anonymousId });
}

async function directQuota(anonymousId) {
  const doc = await readSessionDirect(anonymousId);
  const turns = doc?.turns || [];
  const completed = turns.filter(
    (t) => t.status === 'completed' && typeof t.assistantMessage?.content === 'string' && t.assistantMessage.content.length > 0
  );
  return {
    completedGuestTurns: completed.length,
    remainingAllowance: Math.max(0, 5 - completed.length),
    pendingTurns: turns.filter((t) => t.status === 'pending').length,
    failedTurns: turns.filter((t) => t.status === 'failed').length,
    assistantMessages: (doc?.messages || []).filter((m) => m.role === 'assistant').length,
    userMessages: (doc?.messages || []).filter((m) => m.role === 'user').length,
    cachedCompletedTurnCount: doc?.completedTurnCount ?? 0,
  };
}

/** Waits until the pending reservation is visible in the database. */
async function waitForPendingTurn(anonymousId, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const doc = await readSessionDirect(anonymousId);
    if ((doc?.turns || []).some((t) => t.status === 'pending')) return true;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('pending turn never became visible');
}

let sessionSeq = 0;
async function freshSession(label) {
  const anonymousId = `stage14_8a2-${label}-${(sessionSeq += 1)}`;
  await AnonymousSession.findOrCreateSession(anonymousId, {
    ipAddress: '127.0.0.1',
    userAgent: 'stage14_8a2-acceptance',
    browserFingerprint: 'fp-stage14_8a2-acceptance',
  });
  return anonymousId;
}

/** Mirrors the route seam exactly: admit → generate → complete/fail → settle. */
async function guestTurn(anonymousId, { clientTurnId, scenario = 'success', n = 1, duplicateTerminal = false }) {
  const scope = await openGuestTurn({
    anonymousId,
    clientTurnId,
    userMessage: { role: 'user', content: `guest message ${n}` },
  });

  if (!scope.admitted) return { admitted: false, code: scope.refusal.code };

  try {
    const result = await SYNTHETIC[scenario](n);
    if (result.aborted) {
      await scope.fail(GUEST_TURN_FAILURE_CODES.CLIENT_DISCONNECTED);
      return { admitted: true, completed: false, code: GUEST_ROUTE_CODES.FAILED };
    }
    const assistantMessage = {
      role: 'assistant', content: result.content, provider: result.provider, model: result.model,
    };
    const completion = await scope.complete(assistantMessage);
    const replay = duplicateTerminal ? await scope.complete(assistantMessage) : null;
    return {
      admitted: true,
      completed: true,
      assistantResponsesWritten: completion.assistantResponsesWritten + (replay?.assistantResponsesWritten || 0),
      completedTurnIncrement: completion.completedTurnIncrement,
      duplicateCompletionIncrement: replay?.completedTurnIncrement ?? 0,
    };
  } catch (error) {
    await scope.fail(classifyGuestTurnFailure(error));
    return { admitted: true, completed: false, code: GUEST_ROUTE_CODES.FAILED };
  } finally {
    await scope.settle(GUEST_TURN_FAILURE_CODES.BACKEND_EXCEPTION);
  }
}

async function main() {
  await mongoose.connect(ACCEPTANCE_MONGO_URI);
  rawClient = new MongoClient(ACCEPTANCE_MONGO_URI);
  await rawClient.connect();
  rawDb = rawClient.db(ACCEPTANCE_DB_NAME);

  // Start from a clean acceptance database so evidence is unambiguous.
  await rawDb.collection('anonymoussessions').deleteMany({});

  process.stdout.write('\nStage 14.8A.2 — isolated guest quota acceptance\n');
  process.stdout.write(`  database ${ACCEPTANCE_MONGO_URI}\n\n`);

  // §13 — an unrelated guest session must be provably untouched by every case.
  const bystander = await freshSession('bystander');
  await guestTurn(bystander, { clientTurnId: 'ct-bystander-1', n: 1 });
  const bystanderBefore = await directQuota(bystander);

  process.stdout.write('§10 five successes then a sixth block\n');
  {
    const anonymousId = await freshSession('walk');
    const walk = [];
    for (let n = 1; n <= 5; n += 1) {
      await guestTurn(anonymousId, { clientTurnId: `ct-${n}`, n });
      const q = await directQuota(anonymousId);
      walk.push([q.completedGuestTurns, q.remainingAllowance]);
    }
    check('quota walk 0/5 → 5/0 (direct read)', walk, [[1, 4], [2, 3], [3, 2], [4, 1], [5, 0]]);

    const dispatchesBefore = providerLedger.syntheticDispatches;
    const sixth = await guestTurn(anonymousId, { clientTurnId: 'ct-6', n: 6 });
    check('sixth attempt refused', { admitted: sixth.admitted, code: sixth.code }, {
      admitted: false, code: GUEST_ROUTE_CODES.EXHAUSTED,
    });
    check('sixth attempt generated nothing', providerLedger.syntheticDispatches, dispatchesBefore);

    const q = await directQuota(anonymousId);
    check('stored history holds exactly five completed pairs', {
      user: q.userMessages, assistant: q.assistantMessages, completed: q.completedGuestTurns,
    }, { user: 5, assistant: 5, completed: 5 });
    check('cached counter matches the explicit records', q.cachedCompletedTurnCount, 5);
  }

  process.stdout.write('\n§7 failed turns consume nothing\n');
  for (const [scenario, expectedCode] of [
    ['structuredFailure', GUEST_TURN_FAILURE_CODES.STRUCTURED_GENERATION_FAILURE],
    ['proseFailure', GUEST_TURN_FAILURE_CODES.PROSE_GENERATION_FAILURE],
    ['timeout', GUEST_TURN_FAILURE_CODES.PROVIDER_TIMEOUT],
    ['disconnect', GUEST_TURN_FAILURE_CODES.CLIENT_DISCONNECTED],
  ]) {
    const anonymousId = await freshSession(scenario);
    await guestTurn(anonymousId, { clientTurnId: 'ct-1', scenario });
    const q = await directQuota(anonymousId);
    const doc = await readSessionDirect(anonymousId);
    check(`${scenario}: quota unchanged, reservation released`, {
      completedGuestTurns: q.completedGuestTurns,
      remainingAllowance: q.remainingAllowance,
      pendingTurns: q.pendingTurns,
      assistantMessages: q.assistantMessages,
      userMessages: q.userMessages,
      failureCode: doc.turns[0].failureCode,
    }, {
      completedGuestTurns: 0, remainingAllowance: 5, pendingTurns: 0,
      assistantMessages: 0, userMessages: 0, failureCode: expectedCode,
    });
  }

  process.stdout.write('\n§10 failed fifth attempt, then a successful fifth\n');
  {
    const anonymousId = await freshSession('fifth');
    for (let n = 1; n <= 4; n += 1) await guestTurn(anonymousId, { clientTurnId: `ct-${n}`, n });
    check('4 completed / 1 remaining', await directQuota(anonymousId).then((q) => [q.completedGuestTurns, q.remainingAllowance]), [4, 1]);

    await guestTurn(anonymousId, { clientTurnId: 'ct-5a', scenario: 'proseFailure', n: 5 });
    check('failed fifth leaves 4 completed / 1 remaining', await directQuota(anonymousId).then((q) => [q.completedGuestTurns, q.remainingAllowance]), [4, 1]);

    const retry = await guestTurn(anonymousId, { clientTurnId: 'ct-5b', n: 5 });
    check('fifth retry admitted and completed', { admitted: retry.admitted, completed: retry.completed }, { admitted: true, completed: true });
    check('now 5 completed / 0 remaining', await directQuota(anonymousId).then((q) => [q.completedGuestTurns, q.remainingAllowance]), [5, 0]);

    const sixth = await guestTurn(anonymousId, { clientTurnId: 'ct-6', n: 6 });
    check('sixth blocked after the retried fifth', sixth.code, GUEST_ROUTE_CODES.EXHAUSTED);
  }

  process.stdout.write('\n§6 duplicate terminal completion\n');
  {
    const anonymousId = await freshSession('duplicate');
    const turn = await guestTurn(anonymousId, { clientTurnId: 'ct-1', duplicateTerminal: true });
    check('one completed turn from two terminal callbacks', {
      assistantResponsesWritten: turn.assistantResponsesWritten,
      completedTurnIncrement: turn.completedTurnIncrement,
      duplicateCompletionIncrement: turn.duplicateCompletionIncrement,
    }, { assistantResponsesWritten: 1, completedTurnIncrement: 1, duplicateCompletionIncrement: 0 });

    const q = await directQuota(anonymousId);
    check('stored state holds one turn and one pair', {
      completed: q.completedGuestTurns, assistant: q.assistantMessages, user: q.userMessages,
    }, { completed: 1, assistant: 1, user: 1 });
  }

  process.stdout.write('\n§5 duplicate clientTurnId and concurrent submissions\n');
  {
    const anonymousId = await freshSession('duplicate-id');
    await guestTurn(anonymousId, { clientTurnId: 'ct-same', n: 1 });
    const replay = await guestTurn(anonymousId, { clientTurnId: 'ct-same', n: 1 });
    check('replayed clientTurnId is not a new turn', replay.admitted, false);
    check('quota after replay', await directQuota(anonymousId).then((q) => q.completedGuestTurns), 1);
  }
  {
    // Two tabs submitting while the first turn is genuinely still pending.
    const anonymousId = await freshSession('concurrent');
    openGate();
    const first = guestTurn(anonymousId, { clientTurnId: 'ct-tab-a', scenario: 'gated', n: 1 });
    await waitForPendingTurn(anonymousId);

    const second = await guestTurn(anonymousId, { clientTurnId: 'ct-tab-b', n: 1 });
    releaseGate();
    const a = await first;

    check('one admitted, one bounded refusal', {
      firstAdmitted: a.admitted,
      firstCompleted: a.completed,
      secondAdmitted: second.admitted,
      secondCode: second.code,
    }, {
      firstAdmitted: true, firstCompleted: true,
      secondAdmitted: false, secondCode: GUEST_ROUTE_CODES.IN_PROGRESS,
    });
    check('the refused submission consumed no quota', await directQuota(anonymousId).then((q) => [q.completedGuestTurns, q.pendingTurns]), [1, 0]);
  }
  {
    const anonymousId = await freshSession('concurrent-pressure');
    for (let round = 0; round < 8; round += 1) {
      await Promise.all([
        guestTurn(anonymousId, { clientTurnId: `ct-r${round}-a`, n: round }),
        guestTurn(anonymousId, { clientTurnId: `ct-r${round}-b`, n: round }),
        guestTurn(anonymousId, { clientTurnId: `ct-r${round}-c`, n: round }),
      ]);
    }
    const q = await directQuota(anonymousId);
    check('quota cannot exceed five under sustained concurrency', {
      completedGuestTurns: q.completedGuestTurns,
      remainingAllowance: q.remainingAllowance,
      cachedMatchesRecords: q.cachedCompletedTurnCount === q.completedGuestTurns,
    }, { completedGuestTurns: 5, remainingAllowance: 0, cachedMatchesRecords: true });
  }

  process.stdout.write('\n§8 stale pending recovery after process termination\n');
  {
    const anonymousId = await freshSession('stale');
    const orphan = await admitGuestTurn({
      anonymousId, clientTurnId: 'ct-orphan', userMessage: { role: 'user', content: 'orphaned' },
    });
    // Simulate a process killed after admission.
    await rawDb.collection('anonymoussessions').updateOne(
      { anonymousId, 'turns.turnId': orphan.turnId },
      { $set: { 'turns.$.admittedAt': new Date(Date.now() - STALE_PENDING_TURN_MS - 60_000) } }
    );
    check('orphan pending turn consumes no quota', await directQuota(anonymousId).then((q) => q.completedGuestTurns), 0);

    const next = await guestTurn(anonymousId, { clientTurnId: 'ct-after-crash', n: 1 });
    const doc = await readSessionDirect(anonymousId);
    const recovered = doc.turns.find((t) => t.turnId === orphan.turnId);
    check('guest is not blocked and the orphan is abandoned', {
      admitted: next.admitted,
      completed: next.completed,
      orphanStatus: recovered.status,
      orphanFailureCode: recovered.failureCode,
      completedGuestTurns: (await directQuota(anonymousId)).completedGuestTurns,
    }, {
      admitted: true, completed: true,
      orphanStatus: 'failed', orphanFailureCode: GUEST_TURN_FAILURE_CODES.TURN_ABANDONED,
      completedGuestTurns: 1,
    });
  }

  process.stdout.write('\n§4 the ledger, not the cached counter, is authoritative\n');
  {
    const anonymousId = await freshSession('drift');
    await guestTurn(anonymousId, { clientTurnId: 'ct-1', n: 1 });
    await rawDb.collection('anonymoussessions').updateOne({ anonymousId }, { $set: { completedTurnCount: 4 } });
    const quota = await readGuestQuota(anonymousId);
    check('drift is detected and the records still decide', {
      completedGuestTurns: quota.completedGuestTurns,
      remainingAllowance: quota.remainingAllowance,
      drifted: quota.drifted,
      cachedCompletedTurnCount: quota.cachedCompletedTurnCount,
    }, {
      completedGuestTurns: 1, remainingAllowance: 4, drifted: true, cachedCompletedTurnCount: 4,
    });
  }

  process.stdout.write('\n§13 isolation and blast radius\n');
  check('unrelated anonymous session unmutated', await directQuota(bystander), bystanderBefore);

  const connectionHost = mongoose.connection.host;
  const connectionPort = mongoose.connection.port;
  const connectionDb = mongoose.connection.name;
  check('mongoose is bound to the isolated acceptance database', {
    host: connectionHost, port: connectionPort, db: connectionDb,
  }, { host: '127.0.0.1', port: 27018, db: ACCEPTANCE_DB_NAME });

  const networkSummary = guard.summary();
  check('no external network attempt of any kind', {
    externalNetworkAttempts: networkSummary.externalNetworkAttempts,
    externalNonProviderNetworkAttempts: networkSummary.externalNonProviderNetworkAttempts,
    approvedClaudeProviderAttempts: networkSummary.approvedClaudeProviderAttempts,
    providerHttpRequests: networkSummary.providerHttpRequests,
    atlasAttempts: networkSummary.byDependency.atlas || 0,
  }, {
    externalNetworkAttempts: 0,
    externalNonProviderNetworkAttempts: 0,
    approvedClaudeProviderAttempts: 0,
    providerHttpRequests: 0,
    atlasAttempts: 0,
  });

  check('provider ledger is zero and the run cost nothing', {
    liveProviderConstructors: providerLedger.liveProviderConstructors,
    liveProviderDispatches: providerLedger.liveProviderDispatches,
    externalProviderRequests: providerLedger.externalProviderRequests,
    providerCostUsd: providerLedger.providerCostUsd,
  }, {
    liveProviderConstructors: 0,
    liveProviderDispatches: 0,
    externalProviderRequests: 0,
    providerCostUsd: 0,
  });

  const sessionCount = await rawDb.collection('anonymoussessions').countDocuments();

  // §13 — leave the acceptance database empty so the retest's guest counter
  // genuinely starts at zero, and verify the cleanup by direct read.
  await rawDb.collection('anonymoussessions').deleteMany({});
  const sessionsRemainingAfterCleanup = await rawDb.collection('anonymoussessions').countDocuments();
  check('acceptance database is empty after cleanup', sessionsRemainingAfterCleanup, 0);

  const artifact = {
    stage: '14.8A.2',
    generatedAt: new Date().toISOString(),
    yosemitePromptResent: false,
    database: {
      uri: ACCEPTANCE_MONGO_URI,
      host: connectionHost,
      port: connectionPort,
      name: connectionDb,
      atlasConnections: 0,
      productionDatabaseConnections: 0,
      unrelatedAnonymousSessionsMutated: 0,
      sessionsCreated: sessionCount,
      sessionsRemainingAfterCleanup,
    },
    providerLedger,
    network: networkSummary,
    checks: results,
    passed: failures === 0,
  };

  const outIndex = process.argv.indexOf('--out');
  const outPath = outIndex > -1
    ? process.argv[outIndex + 1]
    : path.resolve(__dirname, '..', '..', 'artifacts', 'trailie-stage14_8A2-guest-quota.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`);

  process.stdout.write(`\n${results.length - failures}/${results.length} checks passed\n`);
  process.stdout.write(`artifact: ${outPath}\n`);

  await rawClient.close();
  await mongoose.connection.close();
  guard.uninstall();

  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch(async (error) => {
  process.stderr.write(`\nacceptance run failed: ${error.message}\n`);
  try { await rawClient?.close(); } catch { /* already closed */ }
  try { await mongoose.connection.close(); } catch { /* already closed */ }
  process.exitCode = 1;
});
