/**
 * Stage 14.8A — live internal acceptance retest: anonymous guest message 1.
 *
 * Runs in two phases so nothing can be spent by accident:
 *
 *   node scripts/stage14_8a-guest-retest.mjs            → pre-send only, STOPS at the gate
 *   node scripts/stage14_8a-guest-retest.mjs --send     → re-checks the gate, then sends ONCE
 *
 * The browser runs a fresh anonymous context under an explicit network policy:
 * only the acceptance frontend and acceptance backend are allowed, Maps /
 * analytics / image hosts are explicitly blocked and recorded, port 5001 is a
 * hard failure, and any other external origin is a hard failure.
 *
 * No retry is ever issued. A failure after admission is reported as-is.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { installSseTee } from './stage14_8a-sse-tee.js';

const preflightRequire = createRequire(import.meta.url);
const { assertReportSymbolsDeclared } = preflightRequire('./stage14_8-report-preflight.js');

// The Mongo driver lives in the server workspace; the acceptance driver reads
// the isolated database directly rather than trusting an API response.
const serverRequire = createRequire(
  path.resolve(process.cwd(), '..', 'server', 'package.json')
);
const { MongoClient } = serverRequire('mongodb');

import {
  STAGE14_ACCEPTANCE_BACKEND_ORIGIN,
  STAGE14_ACCEPTANCE_FRONTEND_ORIGIN,
  ANONYMOUS_LIFECYCLE_CONTRACT,
  GUEST_QUOTA_CONTRACT,
  buildPreSendAcceptanceGate,
  classifyAcceptanceNetworkRequest,
  resolveGuestContract,
} from '../src/test-utils/stage14AcceptanceHarness.js';

const SEND = process.argv.includes('--send');
const OUT_DIR = process.env.STAGE14_8A_OUT_DIR
  || path.resolve(process.cwd(), '..', 'artifacts', 'stage14_8A-live-retest');
fs.mkdirSync(OUT_DIR, { recursive: true });

const MONGO_URI = 'mongodb://127.0.0.1:27018/trailverse_internal_acceptance_stage14_8a';
const DB_NAME = 'trailverse_internal_acceptance_stage14_8a';
const TEST_ID = 'stage14_8A-guest-message-1-live-retest';

const PROMPT = 'Plan a relaxed 2-day trip to Yosemite for a first-time visitor who prefers easy walks and scenic viewpoints. Do not check live conditions.';

const CLIENT_TURN_ID = `ct-stage14_8A-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const write = (name, data) =>
  fs.writeFileSync(path.join(OUT_DIR, name), `${JSON.stringify(data, null, 2)}\n`);

// ---------------------------------------------------------------------------
// Direct isolated-Mongo reads. Every database claim in the report comes from
// here, never from a mocked repository or an API response.
// ---------------------------------------------------------------------------
let mongo;
let db;

async function readSessions() {
  return db.collection('anonymoussessions').find({}).toArray();
}

function projectSession(doc) {
  if (!doc) {
    return {
      exists: false, pendingTurns: 0, completedTurns: 0, failedTurns: 0,
      completedTurnCountCache: 0, completedHistoryMessages: 0, remainingAllowance: 5,
    };
  }
  const turns = doc.turns || [];
  const completed = turns.filter(
    (t) => t.status === 'completed'
      && typeof t.assistantMessage?.content === 'string'
      && t.assistantMessage.content.length > 0
  );
  return {
    exists: true,
    anonymousId: doc.anonymousId,
    pendingTurns: turns.filter((t) => t.status === 'pending').length,
    completedTurns: completed.length,
    failedTurns: turns.filter((t) => t.status === 'failed').length,
    completedTurnCountCache: doc.completedTurnCount ?? 0,
    authoritativeCompletedTurnCount: completed.length,
    completedHistoryMessages: (doc.messages || []).length,
    completedUserMessages: (doc.messages || []).filter((m) => m.role === 'user').length,
    completedAssistantMessages: (doc.messages || []).filter((m) => m.role === 'assistant').length,
    remainingAllowance: Math.max(0, 5 - completed.length),
    turns: turns.map((t) => ({
      turnId: t.turnId,
      clientTurnId: t.clientTurnId,
      status: t.status,
      admittedAt: t.admittedAt,
      completedAt: t.completedAt ?? null,
      failedAt: t.failedAt ?? null,
      failureCode: t.failureCode ?? null,
      userMessageLength: t.userMessage?.content?.length ?? null,
      assistantMessageLength: t.assistantMessage?.content?.length ?? null,
    })),
  };
}

async function projectAll() {
  const docs = await readSessions();
  return {
    anonymousSessionDocuments: docs.length,
    sessions: docs.map(projectSession),
  };
}

// ---------------------------------------------------------------------------
// Network policy
// ---------------------------------------------------------------------------
function createNetworkLedger() {
  const requests = [];
  const record = (url, verdict, method) => {
    let origin = 'unparseable';
    try { origin = new URL(url).origin; } catch { /* keep placeholder */ }
    requests.push({ origin, path: safePath(url), method, ...verdict });
  };
  const safePath = (url) => {
    try { return new URL(url).pathname; } catch { return null; }
  };
  return {
    requests,
    record,
    summary() {
      const by = (pred) => requests.filter(pred).length;
      return {
        total: requests.length,
        allowed: by((r) => r.action === 'allow'),
        blockedExpected: by((r) => r.action === 'block'),
        failures: requests.filter((r) => r.action === 'fail'),
        requestsToPort5001: by((r) => r.classification === 'unexpected_local_backend'),
        requestsToAtlas: by((r) => /mongodb\.net/.test(r.origin)),
        unknownExternal: by((r) => r.classification === 'unknown_external'),
        byClassification: requests.reduce((acc, r) => {
          acc[r.classification] = (acc[r.classification] || 0) + 1;
          return acc;
        }, {}),
      };
    },
  };
}


async function readBackendLedger() {
  const file = path.join(OUT_DIR, 'backend-ledger.json');
  fs.writeFileSync(path.join(OUT_DIR, 'snapshot.request'), '1');
  for (let i = 0; i < 40; i += 1) {
    await new Promise((r) => setTimeout(r, 250));
    if (!fs.existsSync(path.join(OUT_DIR, 'snapshot.request')) && fs.existsSync(file)) break;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// Stage 14.8E.1 §11 — a report field referenced but never declared must cost
// nothing. This throws BEFORE any browser or provider work begins, instead of
// after a paid turn has already completed.
assertReportSymbolsDeclared(new URL(import.meta.url).pathname);

/**
 * Stage 14.8E.2 §9 — bounded cleanup. A driver exception must still close the
 * browser and the Mongo client; three stages leaked orphaned Chromium
 * processes because a crash skipped `browser.close()` entirely.
 */
const openResources = { browser: null, mongo: null };

async function releaseOpenResources() {
  try { await openResources.browser?.close(); } catch { /* already gone */ }
  try { await openResources.mongo?.close(); } catch { /* already closed */ }
  openResources.browser = null;
  openResources.mongo = null;
}

async function main() {
  mongo = new MongoClient(MONGO_URI);
  openResources.mongo = mongo;
  await mongo.connect();
  db = mongo.db(DB_NAME);

  const ledger = createNetworkLedger();
  const browser = await chromium.launch({ headless: true });
  openResources.browser = browser;
  const context = await browser.newContext({
    storageState: undefined,
    viewport: { width: 1440, height: 1000 },
  });

  await context.addInitScript(installSseTee);

  const hardFailures = [];
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();
    const verdict = classifyAcceptanceNetworkRequest(url);
    ledger.record(url, verdict, request.method());

    if (verdict.action === 'allow') return route.continue();
    if (verdict.action === 'block') return route.abort('blockedbyclient');
    hardFailures.push({ url: (() => { try { return new URL(url).origin; } catch { return 'unparseable'; } })(), ...verdict });
    return route.abort('blockedbyclient');
  });

  const consoleErrors = [];
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
  });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${String(err.message).slice(0, 300)}`));

  // -------------------------------------------------------------------------
  // Pre-send
  // -------------------------------------------------------------------------
  await page.goto(`${STAGE14_ACCEPTANCE_FRONTEND_ORIGIN}/plan-ai`, {
    waitUntil: 'domcontentloaded', timeout: 60000,
  });
  await page.waitForTimeout(6000);

  const startingLocalStorage = await page.evaluate(() => {
    const out = {};
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      out[k] = (window.localStorage.getItem(k) || '').slice(0, 400);
    }
    return out;
  });

  const startingDb = await projectAll();
  const backendBefore = await readBackendLedger();

  const contractResolution = resolveGuestContract(GUEST_QUOTA_CONTRACT);
  const netSummary = ledger.summary();

  const gate = buildPreSendAcceptanceGate({
    frontendOrigin: STAGE14_ACCEPTANCE_FRONTEND_ORIGIN,
    acceptanceBackendOrigin: STAGE14_ACCEPTANCE_BACKEND_ORIGIN,
    requestsToPort5001: netSummary.requestsToPort5001,
    requestsToAtlas: netSummary.requestsToAtlas,
    isolatedMongoConfirmed: true,
    networkPolicyInstalled: true,
    guestContractResolved: contractResolution.resolved,
    guestCounter: startingDb.sessions.reduce((n, s) => n + s.completedTurns, 0),
    providerRequests: backendBefore?.providerAttempts?.length ?? 0,
    paidRetestAuthorized: true,
  });

  await page.screenshot({ path: path.join(OUT_DIR, 'pre-send.png'), fullPage: true });

  const preSend = {
    testId: TEST_ID,
    phase: 'pre-send',
    generatedAt: new Date().toISOString(),
    anonymousLifecycleContract: ANONYMOUS_LIFECYCLE_CONTRACT,
    guestContractResolution: contractResolution,
    origins: {
      frontend: STAGE14_ACCEPTANCE_FRONTEND_ORIGIN,
      acceptanceBackend: STAGE14_ACCEPTANCE_BACKEND_ORIGIN,
    },
    browserContext: {
      authenticated: false,
      authToken: null,
      anonymousSessionLocalStorage: startingLocalStorage.anonymousSession ?? null,
      pendingOptimisticMessage: false,
      completedGuestTurns: 0,
      remainingAllowance: 5,
      localStorageKeys: Object.keys(startingLocalStorage),
    },
    startingDatabase: startingDb,
    backendProviderLedgerBefore: backendBefore
      ? {
        providerAttempts: backendBefore.providerAttempts.length,
        totals: backendBefore.providerTotals,
        network: backendBefore.network,
      }
      : null,
    network: netSummary,
    hardFailures,
    consoleErrors,
    gate,
  };
  write('pre-send-gate.json', preSend);

  if (!gate.passed || hardFailures.length > 0) {
    write('result.json', {
      testId: TEST_ID,
      result: hardFailures.length > 0 ? 'FAIL_UNEXPECTED_NETWORK' : 'FAIL_PRE_SEND_GATE',
      gate,
      hardFailures,
      promptSent: false,
    });
    console.log(JSON.stringify({ stopped: 'pre_send', gate, hardFailures }, null, 2));
    await browser.close();
    await mongo.close();
    process.exitCode = 1;
    return;
  }

  if (!SEND) {
    console.log(JSON.stringify({
      preSendGate: gate,
      network: netSummary,
      startingDb,
      localStorageKeys: Object.keys(startingLocalStorage),
      consoleErrors: consoleErrors.slice(0, 10),
      note: 'pre-send only; no prompt submitted. Re-run with --send to submit once.',
    }, null, 2));
    await browser.close();
    await mongo.close();
    return;
  }

  // -------------------------------------------------------------------------
  // Send — exactly once.
  // -------------------------------------------------------------------------
  // Pin the clientTurnId so the submitted turn is identifiable end to end.
  await page.evaluate((id) => { window.__stage14ClientTurnId = id; }, CLIENT_TURN_ID);

  const composer = page.getByPlaceholder(/Ask me about your trip/i);
  await composer.waitFor({ state: 'visible', timeout: 30000 });
  await composer.click();
  await composer.fill(PROMPT);

  // Mid-flight snapshot: the first database state in which the pending
  // reservation exists and no completion has happened yet.
  let admissionSnapshot = null;
  const poller = (async () => {
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      const docs = await readSessions();
      const projected = docs.map(projectSession);
      const pending = projected.find((s) => s.pendingTurns === 1);
      if (pending && !admissionSnapshot) {
        admissionSnapshot = { capturedAt: new Date().toISOString(), ...pending };
        return;
      }
      if (projected.some((s) => s.completedTurns > 0)) return; // completed before we sampled
      await new Promise((r) => setTimeout(r, 40));
    }
  })();

  // Baseline taken AFTER the page has fully settled and BEFORE submission, so
  // page-chrome activity (daily feed, astro, weather widgets) can never be
  // reported as prompt-triggered.
  const backendPreSubmit = await readBackendLedger();

  const submittedAt = Date.now();
  await composer.press('Enter');

  await poller;

  // Wait for the terminal event or a bounded failure. No retry, ever.
  let terminalOutcome = 'timeout';
  try {
    await page.waitForFunction(
      () => (window.__stage14Sse?.events || []).some((e) => e.type === 'done' || e.type === 'error'),
      undefined,
      { timeout: 300000 }
    );
    terminalOutcome = await page.evaluate(() =>
      (window.__stage14Sse.events.find((e) => e.type === 'done') ? 'done' : 'error'));
  } catch {
    terminalOutcome = 'timeout';
  }

  await page.waitForTimeout(8000);

  const sse = await page.evaluate(() => window.__stage14Sse);
  const finalDb = await projectAll();
  const backendAfter = await readBackendLedger();

  const finalLocalStorage = await page.evaluate(() => {
    const out = {};
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      out[k] = window.localStorage.getItem(k);
    }
    return out;
  });

  const ui = await page.evaluate(() => {
    const text = document.body.innerText;
    const bubbles = Array.from(document.querySelectorAll('[data-message-role], .prose, article'))
      .map((n) => n.innerText || '').filter(Boolean);
    const composerEl = document.querySelector('textarea');
    return {
      userTurns: (text.match(/Plan a relaxed 2-day trip to Yosemite/g) || []).length,
      composerDisabled: composerEl ? composerEl.disabled : null,
      composerPlaceholder: composerEl ? composerEl.placeholder : null,
      rawJsonMarkerPresent: /\[ITINERARY_JSON\]/.test(text),
      trailieMarkerPresent: /<!--TRAILIE_(DAY|STOP)/.test(document.body.innerHTML),
      toolPayloadPresent: /"input_schema"|"tool_use"/.test(text),
      spinnerPresent: Boolean(document.querySelector('[aria-busy="true"], .animate-spin')),
      day1Present: /Day 1/i.test(text),
      day2Present: /Day 2/i.test(text),
      day3Present: /Day 3/i.test(text),
      yosemiteMentioned: /Yosemite/i.test(text),
      bodyTextLength: text.length,
      bubbleCount: bubbles.length,
    };
  });

  await page.screenshot({ path: path.join(OUT_DIR, 'post-send.png'), fullPage: true });
  fs.writeFileSync(path.join(OUT_DIR, 'post-send.html'), await page.content());

  const assistantText = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('div,article,section'));
    const withText = nodes.map((n) => n.innerText || '').filter((t) => /Day 1/i.test(t));
    return withText.length ? withText[withText.length - 1].slice(0, 12000) : null;
  });
  if (assistantText) fs.writeFileSync(path.join(OUT_DIR, 'assistant-response.txt'), assistantText);

  const sendReport = {
    testId: TEST_ID,
    phase: 'send',
    generatedAt: new Date().toISOString(),
    prompt: PROMPT,
    clientTurnId: CLIENT_TURN_ID,
    submittedAt: new Date(submittedAt).toISOString(),
    terminalOutcome,
    admissionSnapshot,
    finalDatabase: finalDb,
    browserSse: sse,
    backendLedger: backendAfter,
    backendPreSubmit: backendPreSubmit
      ? { network: backendPreSubmit.network, providerAttempts: backendPreSubmit.providerAttempts.length }
      : null,
    promptTriggered: backendPreSubmit && backendAfter
      ? {
        providerRequests: backendAfter.providerAttempts.length - backendPreSubmit.providerAttempts.length,
        externalNonProviderAttempts:
          backendAfter.network.externalNonProviderNetworkAttempts
          - backendPreSubmit.network.externalNonProviderNetworkAttempts,
        approvedClaudeProviderAttempts:
          backendAfter.network.approvedClaudeProviderAttempts
          - backendPreSubmit.network.approvedClaudeProviderAttempts,
        byDependencyDelta: Object.fromEntries(
          Object.entries(backendAfter.network.byDependency || {}).map(([k, v]) => [
            k, v - ((backendPreSubmit.network.byDependency || {})[k] || 0),
          ])
        ),
      }
      : null,
    network: ledger.summary(),
    hardFailures,
    consoleErrors,
    ui,
    localStorage: Object.fromEntries(
      Object.entries(finalLocalStorage).map(([k, v]) => [k, (v || '').slice(0, 4000)])
    ),
  };
  write('send-report.json', sendReport);

  console.log(JSON.stringify({
    terminalOutcome,
    admissionSnapshot,
    finalDb,
    sseEventTypes: (sse?.events || []).map((e) => e.type),
    network: ledger.summary(),
    hardFailures,
    ui,
  }, null, 2));

  await browser.close();
  await mongo.close();
}

main().catch(async (error) => {
  await releaseOpenResources();
  console.error('driver failed:', error.message);
  try { await mongo?.close(); } catch { /* already closed */ }
  process.exitCode = 1;
});
