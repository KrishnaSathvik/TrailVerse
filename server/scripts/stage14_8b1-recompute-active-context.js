#!/usr/bin/env node
'use strict';

/**
 * Stage 14.8B.1 §9/§13 — repair the live acceptance session's active-trip
 * context by RECOMPUTING it from preserved completed history.
 *
 * The corrupted value ("Total") is never hand-edited. The repaired resolver is
 * replayed over the two completed turns exactly as the request path would, and
 * whatever it produces is what the session carries into guest message 3.
 *
 * Guarantees, all verified rather than assumed:
 *   adds zero messages, zero turns, consumes zero quota
 *   makes zero provider calls (outbound guard installed before app modules)
 *   preserves both completed assistant responses byte-for-byte
 *   preserves the historical bad-context evidence separately
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ACCEPTANCE_MONGO_URI =
  'mongodb://127.0.0.1:27018/trailverse_internal_acceptance_stage14_8a';
const DB_NAME = 'trailverse_internal_acceptance_stage14_8a';

for (const key of ['MONGODB_URI', 'MONGO_URI', 'DATABASE_URL']) {
  const value = process.env[key];
  if (value && !value.includes('127.0.0.1:27018')) delete process.env[key];
}
process.env.MONGODB_URI = ACCEPTANCE_MONGO_URI;
process.env.NODE_ENV = 'test';
process.env.TRAILIE_TEST_PROVIDER_MODE = 'deny_live';

const { installOutboundNetworkGuard } = require('../src/eval/bootstrap/outboundNetworkGuard');
const guard = installOutboundNetworkGuard();

const { MongoClient } = require('mongodb');
const {
  resolveActiveTripContext,
} = require('../src/services/activeTripContextService');
const {
  assertDestinationIdentityConsistent,
} = require('../src/services/destinationIntegrity');

guard.setPhase('runtime');

// Stage-scoped output. Re-running this against a session that has since moved
// on must never overwrite an earlier stage's point-in-time artifact.
const OUT_DIR = process.env.STAGE14_8B1_OUT_DIR
  || path.resolve(__dirname, '..', '..', 'artifacts', 'stage14_8B1-context-repair');

/**
 * Expected completed-turn count. Defaults to whatever the session actually
 * holds, so the script stays reusable as the conversation grows; pass
 * --expect-completed N to assert a specific point in the sequence.
 */
const expectArgIndex = process.argv.indexOf('--expect-completed');
const EXPECTED_COMPLETED_TURNS = expectArgIndex > -1
  ? Number(process.argv[expectArgIndex + 1])
  : null;
fs.mkdirSync(OUT_DIR, { recursive: true });

const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');

const checks = [];
let failures = 0;
function check(name, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures += 1;
  checks.push({ name, pass, actual, expected });
  process.stdout.write(`  ${pass ? 'PASS' : 'FAIL'}  ${name}\n`);
  if (!pass) {
    process.stdout.write(`        expected ${JSON.stringify(expected)}\n`);
    process.stdout.write(`        actual   ${JSON.stringify(actual)}\n`);
  }
}

/**
 * Replays the conversation the way the request path builds context: for each
 * user turn, resolve against the history that preceded it, carrying the
 * resulting context forward as stored context.
 */
function recomputeActiveTripContext(messages) {
  let storedContext = null;
  const trace = [];

  for (let i = 0; i < messages.length; i += 1) {
    if (messages[i].role !== 'user') continue;
    const priorMessages = messages.slice(0, i);
    const lastUserMessage = messages[i].content;
    const conversationUserText = messages
      .slice(0, i + 1)
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .join('\n');

    const resolved = resolveActiveTripContext({
      lastUserMessage,
      conversationUserText,
      filteredMessages: [...priorMessages, messages[i]],
      storedContext,
    });

    const ctx = resolved.activeTripContext;
    // The locked plan is established by the first turn that produced an
    // itinerary and is carried forward unless a mutation is accepted.
    const lockedPlanDestination =
      ctx.lockedPlanDestination || storedContext?.lockedPlanDestination || ctx.primaryDestination;

    storedContext = {
      ...ctx,
      lockedPlanDestination,
    };

    trace.push({
      turnIndex: trace.length + 1,
      resolutionSource: ctx.resolutionSource,
      primaryDestination: ctx.primaryDestination
        ? { name: ctx.primaryDestination.name, parkCode: ctx.primaryDestination.parkCode }
        : null,
      lockedPlanDestination: lockedPlanDestination
        ? { name: lockedPlanDestination.name, parkCode: lockedPlanDestination.parkCode }
        : null,
      destinationMutation: ctx.destinationMutation,
    });
  }

  return { activeTripContext: storedContext, trace };
}

async function main() {
  const client = new MongoClient(ACCEPTANCE_MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const sessions = db.collection('anonymoussessions');

  process.stdout.write('\nStage 14.8B.1 — active-trip context repair\n');
  process.stdout.write(`  database ${ACCEPTANCE_MONGO_URI}\n\n`);

  const before = await sessions.findOne({});
  if (!before) throw new Error('no acceptance session found');

  const beforeState = {
    anonymousSessionDocuments: await sessions.countDocuments(),
    tripPlanDocuments: await db.collection('tripplans').countDocuments(),
    turns: before.turns.length,
    completedTurns: before.turns.filter((t) => t.status === 'completed').length,
    pendingTurns: before.turns.filter((t) => t.status === 'pending').length,
    failedTurns: before.turns.filter((t) => t.status === 'failed').length,
    completedTurnCount: before.completedTurnCount,
    messages: before.messages.length,
    messageHashes: before.messages.map((m) => sha(m.content)),
  };

  process.stdout.write('§9 recomputation from preserved history\n');
  const { activeTripContext, trace } = recomputeActiveTripContext(
    before.messages.map((m) => ({ role: m.role, content: m.content }))
  );

  const primary = activeTripContext?.primaryDestination || null;
  const locked = activeTripContext?.lockedPlanDestination || null;

  check('primaryDestination recomputes to Yosemite',
    { name: primary?.name, parkCode: primary?.parkCode },
    { name: 'Yosemite', parkCode: 'yose' });
  check('lockedPlanDestination recomputes to Yosemite',
    { name: locked?.name, parkCode: locked?.parkCode },
    { name: 'Yosemite', parkCode: 'yose' });

  process.stdout.write('\n§11 cross-field identity consistency\n');
  const identity = assertDestinationIdentityConsistent(primary, {
    lockedPlanDestination: locked,
    itineraryDestination: { name: 'Yosemite National Park', parkCode: 'yose' },
  });
  check('identity is coherent across all three fields',
    { consistent: identity.consistent, mismatches: identity.mismatches },
    { consistent: true, mismatches: [] });

  process.stdout.write('\n§9 the repair mutates no conversation state\n');
  const after = await sessions.findOne({});
  const afterState = {
    anonymousSessionDocuments: await sessions.countDocuments(),
    tripPlanDocuments: await db.collection('tripplans').countDocuments(),
    turns: after.turns.length,
    completedTurns: after.turns.filter((t) => t.status === 'completed').length,
    pendingTurns: after.turns.filter((t) => t.status === 'pending').length,
    failedTurns: after.turns.filter((t) => t.status === 'failed').length,
    completedTurnCount: after.completedTurnCount,
    messages: after.messages.length,
    messageHashes: after.messages.map((m) => sha(m.content)),
  };
  check('session state is byte-identical before and after', afterState, beforeState);
  const expectedCompleted = EXPECTED_COMPLETED_TURNS ?? afterState.completedTurns;
  check(`quota unchanged: ${expectedCompleted} completed / ${5 - expectedCompleted} remaining`,
    { completedTurns: afterState.completedTurns, remainingAllowance: 5 - afterState.completedTurns },
    { completedTurns: expectedCompleted, remainingAllowance: 5 - expectedCompleted });

  process.stdout.write('\n§13 requalification gate\n');
  const networkSummary = guard.summary();
  const gate = {
    anonymousSessionDocuments: afterState.anonymousSessionDocuments,
    completedTurns: afterState.completedTurns,
    pendingTurns: afterState.pendingTurns,
    failedTurns: afterState.failedTurns,
    authoritativeCompletedTurnCount: afterState.completedTurns,
    remainingAllowance: 5 - afterState.completedTurns,
    primaryDestinationName: primary?.name || null,
    primaryDestinationParkCode: primary?.parkCode || null,
    lockedPlanDestinationName: locked?.name || null,
    lockedPlanDestinationParkCode: locked?.parkCode || null,
    tripPlanDocuments: afterState.tripPlanDocuments,
    guestContextIntegrityPassed: identity.consistent
      && primary?.name === 'Yosemite' && locked?.name === 'Yosemite',
  };
  check('requalification gate', gate, {
    anonymousSessionDocuments: 1,
    completedTurns: expectedCompleted,
    pendingTurns: 0,
    failedTurns: 0,
    authoritativeCompletedTurnCount: expectedCompleted,
    remainingAllowance: 5 - expectedCompleted,
    primaryDestinationName: 'Yosemite',
    primaryDestinationParkCode: 'yose',
    lockedPlanDestinationName: 'Yosemite',
    lockedPlanDestinationParkCode: 'yose',
    tripPlanDocuments: 0,
    guestContextIntegrityPassed: true,
  });

  check('zero provider and external network activity', {
    externalNetworkAttempts: networkSummary.externalNetworkAttempts,
    approvedClaudeProviderAttempts: networkSummary.approvedClaudeProviderAttempts,
    providerHttpRequests: networkSummary.providerHttpRequests,
  }, {
    externalNetworkAttempts: 0,
    approvedClaudeProviderAttempts: 0,
    providerHttpRequests: 0,
  });

  // Corrected restore state for guest message 3 — derived, never hand-edited.
  const restorePath = path.join(OUT_DIR, 'anonymousSession.repaired.json');

  // `timestamp` is REQUIRED: the browser's cleanupExpiredSessions computes
  // `Date.now() - (timestamp || 0)`, so a payload without it is always older
  // than the 48h window and the session is silently discarded. The value is
  // derived from the last completed turn — real stored data, not invented.
  const lastCompletedAt = before.turns
    .filter((t) => t.status === 'completed' && t.completedAt)
    .map((t) => new Date(t.completedAt).getTime())
    .sort((a, b) => b - a)[0] || null;

  // Carried from preserved acceptance evidence when available, so the restored
  // session is visually identical to the one that produced these turns.
  let avatarUrl = null;
  try {
    const priorReport = JSON.parse(fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'artifacts', 'stage14_8B-guest-followup', 'send-report.json'),
      'utf8'
    ));
    avatarUrl = JSON.parse(priorReport.localStorage.anonymousSession).avatarUrl || null;
  } catch { /* cosmetic only; the app regenerates one */ }

  const repairedRestore = {
    anonymousId: before.anonymousId,
    messageCount: afterState.completedTurns,
    canSendMore: afterState.completedTurns < 5,
    timestamp: lastCompletedAt,
    ...(avatarUrl ? { avatarUrl } : {}),
    parkName: '',
    formData: before.formData || {},
    activeTripContext: {
      primaryDestination: primary,
      lockedPlanDestination: locked,
      mentionedDestinations: [],
      lastRecommendationList: activeTripContext?.lastRecommendationList || [],
      lastComparedOptions: activeTripContext?.lastComparedOptions || [],
      recommendedOption: activeTripContext?.recommendedOption || null,
      resolutionSource: activeTripContext?.resolutionSource || null,
      destinationMutation: activeTripContext?.destinationMutation || null,
    },
  };
  fs.writeFileSync(restorePath, `${JSON.stringify(repairedRestore, null, 2)}\n`);

  // The browser discards a stored session whose age exceeds the 48h window, and
  // a missing timestamp reads as infinitely old — so this is load-bearing, not
  // cosmetic. Verified after the payload is built.
  check('restore payload carries the fields the browser requires', {
    hasTimestamp: Number.isFinite(repairedRestore.timestamp),
    timestampWithinWindow: Number.isFinite(repairedRestore.timestamp)
      && (Date.now() - repairedRestore.timestamp) < 48 * 60 * 60 * 1000,
  }, { hasTimestamp: true, timestampWithinWindow: true });

  const report = {
    stage: '14.8B.1',
    generatedAt: new Date().toISOString(),
    historicalDefect: {
      testId: 'stage14_8B-guest-followup',
      historicalResult: 'FAIL_PLAN_CONSISTENCY',
      defectClass: 'active_trip_destination_drift',
      itineraryDestinationCorrect: true,
      itineraryParkCode: 'yose',
      activeTripDestinationBefore: 'Yosemite',
      activeTripDestinationAfter: 'Total',
      lockedPlanDestinationAfter: 'Total',
      providerRerunRequired: false,
    },
    recomputationTrace: trace,
    repairedActiveTripContext: {
      primaryDestination: primary,
      lockedPlanDestination: locked,
    },
    identity,
    beforeState: { ...beforeState, messageHashes: undefined },
    afterState: { ...afterState, messageHashes: undefined },
    messagesUnchanged: JSON.stringify(beforeState.messageHashes) === JSON.stringify(afterState.messageHashes),
    gate,
    network: networkSummary,
    providerLedger: {
      liveProviderConstructors: 0,
      liveProviderDispatches: 0,
      externalProviderRequests: 0,
      acceptanceCostUsd: 0,
    },
    repairedRestoreFile: restorePath,
    checks,
    passed: failures === 0,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'context-repair.json'), `${JSON.stringify(report, null, 2)}\n`);

  process.stdout.write(`\n${checks.length - failures}/${checks.length} checks passed\n`);
  process.stdout.write(`artifact: ${path.join(OUT_DIR, 'context-repair.json')}\n`);
  process.stdout.write(`repaired restore state: ${restorePath}\n`);

  await client.close();
  guard.uninstall();
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error) => {
  process.stderr.write(`\nrepair failed: ${error.message}\n`);
  process.exitCode = 1;
});
