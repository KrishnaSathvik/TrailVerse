/**
 * Stage 14.8F — anonymous sixth-message server boundary test.
 *
 * The guest allowance is exhausted (5 completed / 0 remaining) and the UI
 * correctly disables the composer, so the sixth attempt is issued DIRECTLY
 * against the anonymous API using the same request shape the real client
 * sends. Nothing is submitted through the browser.
 *
 * The invariant under test is stronger than "no dispatch": the rejection must
 * happen before a provider client is CONSTRUCTED, before a pending turn
 * exists, and before any message is persisted. This test must cost $0.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const serverRequire = createRequire(path.resolve(process.cwd(), '..', 'server', 'package.json'));
const { MongoClient } = serverRequire('mongodb');

const BACKEND = 'http://127.0.0.1:5101';
const MONGO_URI = 'mongodb://127.0.0.1:27019/trailverse_internal_acceptance_stage14_8a';
const OUT_DIR = process.env.STAGE14_8F_OUT_DIR
  || path.resolve(process.cwd(), '..', 'artifacts', 'stage14_8F-sixth-message-block');
const LEDGER_DIR = process.env.STAGE14_8A_OUT_DIR || OUT_DIR;

fs.mkdirSync(OUT_DIR, { recursive: true });

const PROMPT = 'One last thing — which of those photo stops would you prioritize for sunrise?';

/** Same contract as the real client (`createGuestClientTurnId`). */
const clientTurnId = `ct-${crypto.randomUUID()}`;

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');

/** Snapshot of every quota-bearing field, read directly from Mongo. */
function projectSession(doc) {
  const turns = doc?.turns || [];
  const completed = turns.filter(
    (t) => t.status === 'completed'
      && typeof t.assistantMessage?.content === 'string'
      && t.assistantMessage.content.length > 0
  );
  return {
    completedTurns: completed.length,
    pendingTurns: turns.filter((t) => t.status === 'pending').length,
    failedTurns: turns.filter((t) => t.status === 'failed').length,
    completedTurnCountCache: doc?.completedTurnCount ?? 0,
    authoritativeCompletedTurnCount: completed.length,
    counterDrift: (doc?.completedTurnCount ?? 0) !== completed.length,
    remainingAllowance: Math.max(0, 5 - completed.length),
    canSendMore: completed.length < 5,
    completedHistoryMessages: (doc?.messages || []).length,
    turnIds: turns.map((t) => t.turnId),
    clientTurnIds: turns.map((t) => t.clientTurnId),
    messageHashes: (doc?.messages || []).map((m) => sha(m.content)),
    fifthTurn: turns[4]
      ? {
        turnId: turns[4].turnId,
        clientTurnId: turns[4].clientTurnId,
        completedAt: turns[4].completedAt,
        assistantContentHash: sha(turns[4].assistantMessage?.content || ''),
      }
      : null,
  };
}

async function readBackendLedger() {
  const file = path.join(LEDGER_DIR, 'backend-ledger.json');
  fs.writeFileSync(path.join(LEDGER_DIR, 'snapshot.request'), '1');
  for (let i = 0; i < 40; i += 1) {
    await new Promise((r) => { setTimeout(r, 250); });
    if (!fs.existsSync(path.join(LEDGER_DIR, 'snapshot.request')) && fs.existsSync(file)) break;
  }
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

async function main() {
  const mongo = new MongoClient(MONGO_URI);
  await mongo.connect();
  const sessions = mongo.db().collection('anonymoussessions');

  const beforeDoc = await sessions.findOne({});
  const before = projectSession(beforeDoc);
  const anonymousId = beforeDoc.anonymousId;
  const beforeCounts = {
    anonymousSessionDocuments: await sessions.countDocuments(),
    tripPlanDocuments: await mongo.db().collection('tripplans').countDocuments(),
  };
  const beforeLedger = await readBackendLedger();

  // ── the exact production request shape (aiService.chatAnonymousStream) ──
  const requestBody = {
    messages: [{ role: 'user', content: PROMPT }],
    systemPrompt: undefined,
    provider: 'auto',
    model: undefined,
    temperature: 0.4,
    top_p: 0.9,
    maxTokens: 8000,
    metadata: {},
    anonymousId,
    clientTurnId,
  };

  const startedAt = Date.now();
  const response = await fetch(`${BACKEND}/api/ai/chat-anonymous-stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });
  const rawBody = await response.text();
  const elapsedMs = Date.now() - startedAt;

  let parsedBody = null;
  try { parsedBody = JSON.parse(rawBody); } catch { /* captured raw below */ }

  const afterDoc = await sessions.findOne({});
  const after = projectSession(afterDoc);
  const afterCounts = {
    anonymousSessionDocuments: await sessions.countDocuments(),
    tripPlanDocuments: await mongo.db().collection('tripplans').countDocuments(),
  };
  const afterLedger = await readBackendLedger();

  const bodyText = JSON.stringify(parsedBody ?? rawBody);
  const leakage = {
    rawProviderError: /anthropic|openai|api[_ ]key|sk-ant/i.test(bodyText),
    stackTrace: /\bat\s+\/|\.js:\d+:\d+/.test(bodyText),
    mongoIdentifier: /\b[0-9a-f]{24}\b/.test(bodyText),
    providerConfigDetail: /apiKey|baseURL|Authorization/i.test(bodyText),
  };

  const report = {
    testId: 'stage14_8F-sixth-message-block',
    generatedAt: new Date().toISOString(),
    backend: BACKEND,
    mongoUri: MONGO_URI,
    prompt: PROMPT,
    clientTurnId,
    requestIssuedCount: 1,
    retryPerformed: false,
    requestShape: Object.keys(requestBody),
    elapsedMs,

    rejection: {
      httpStatus: response.status,
      contentType: response.headers.get('content-type'),
      body: parsedBody ?? rawBody,
      // The bounded application-level code, wherever the route surfaces it.
      surfacedErrorCode: parsedBody?.error ?? parsedBody?.data?.errorCode ?? null,
      isConversionMessage: parsedBody?.data?.isConversionMessage ?? null,
      canSendMore: parsedBody?.data?.canSendMore ?? parsedBody?.canSendMore ?? null,
      remainingAllowance: parsedBody?.data?.remainingAllowance ?? parsedBody?.remainingAllowance ?? null,
      sseStreamOpened: (response.headers.get('content-type') || '').includes('text/event-stream'),
      leakage,
    },

    databaseBefore: { ...before, ...beforeCounts },
    databaseAfter: { ...after, ...afterCounts },

    invariants: {
      sixthTurnCreated: after.turnIds.length !== before.turnIds.length,
      sixthClientTurnIdPersisted: after.clientTurnIds.includes(clientTurnId),
      userMessageSixPersisted: after.completedHistoryMessages > before.completedHistoryMessages,
      assistantMessageSixPersisted:
        after.completedHistoryMessages > before.completedHistoryMessages,
      quotaChanged:
        before.completedTurns !== after.completedTurns
        || before.remainingAllowance !== after.remainingAllowance,
      completedMessagesByteIdentical:
        JSON.stringify(before.messageHashes) === JSON.stringify(after.messageHashes),
      fifthTurnUnchanged:
        JSON.stringify(before.fifthTurn) === JSON.stringify(after.fifthTurn),
      pendingTurnCreated: after.pendingTurns > 0,
    },

    providerBoundary: {
      constructorsBefore: beforeLedger?.providerConstructorCounts ?? null,
      constructorsAfter: afterLedger?.providerConstructorCounts ?? null,
      providerAttemptsBefore: beforeLedger?.providerAttempts?.length ?? null,
      providerAttemptsAfter: afterLedger?.providerAttempts?.length ?? null,
      providerHttpRequestsBefore: beforeLedger?.network?.providerHttpRequests ?? null,
      providerHttpRequestsAfter: afterLedger?.network?.providerHttpRequests ?? null,
      providerTotalsAfter: afterLedger?.providerTotals ?? null,
      unaccountedProviderRequests: afterLedger?.reconciliation?.unaccountedProviderRequests ?? null,
    },

    networkBoundary: {
      before: beforeLedger?.network ?? null,
      after: afterLedger?.network ?? null,
    },

    destinationResolutionsAfter:
      (afterLedger?.destinationResolutions || []).length
      - (beforeLedger?.destinationResolutions || []).length,
    sseEventsEmittedDuringRequest:
      (afterLedger?.emittedSseEvents || []).length
      - (beforeLedger?.emittedSseEvents || []).length,
  };

  fs.writeFileSync(path.join(OUT_DIR, 'sixth-block-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));

  await mongo.close();
}

main().catch((error) => {
  console.error('sixth-block test failed:', error.message);
  process.exitCode = 1;
});
