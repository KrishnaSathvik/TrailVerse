/**
 * Stage 14.8B — internal acceptance test 2: anonymous guest follow-up.
 *
 * Continues the SAME anonymous guest session created by Stage 14.8A. The
 * browser context from that run was ephemeral, so the session is restored the
 * way a returning guest restores it: by seeding the `anonymousSession`
 * localStorage record and letting the app hydrate its conversation from the
 * server's completed history. No new AnonymousSession is created.
 *
 *   node scripts/stage14_8b-guest-followup.mjs           → pre-send only, STOPS
 *   node scripts/stage14_8b-guest-followup.mjs --send     → sends the follow-up ONCE
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { installSseTee } from './stage14_8a-sse-tee.js';

const preflightRequire = createRequire(import.meta.url);
const { assertReportSymbolsDeclared } = preflightRequire('./stage14_8-report-preflight.js');

import {
  STAGE14_ACCEPTANCE_BACKEND_ORIGIN,
  STAGE14_ACCEPTANCE_FRONTEND_ORIGIN,
  classifyAcceptanceNetworkRequest,
} from '../src/test-utils/stage14AcceptanceHarness.js';

const serverRequire = createRequire(
  path.resolve(process.cwd(), '..', 'server', 'package.json')
);
const { MongoClient } = serverRequire('mongodb');

const SEND = process.argv.includes('--send');
const OUT_DIR = process.env.STAGE14_8B_OUT_DIR
  || path.resolve(process.cwd(), '..', 'artifacts', 'stage14_8B-guest-followup');
fs.mkdirSync(OUT_DIR, { recursive: true });

const RESTORE_SESSION_FILE = process.env.STAGE14_8B_SESSION_FILE;
const MONGO_URI = 'mongodb://127.0.0.1:27018/trailverse_internal_acceptance_stage14_8a';
const DB_NAME = 'trailverse_internal_acceptance_stage14_8a';
const TEST_ID = 'stage14_8B-guest-message-2';

const PROMPT = 'Can you make Day 2 even more relaxed and keep the total walking for that day under 2 miles?';

const write = (name, data) =>
  fs.writeFileSync(path.join(OUT_DIR, name), `${JSON.stringify(data, null, 2)}\n`);

let mongo;
let db;

function projectSession(doc) {
  if (!doc) return { exists: false };
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
    completedHistoryRoles: (doc.messages || []).map((m) => m.role),
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
  const docs = await db.collection('anonymoussessions').find({}).toArray();
  const tripPlanDocuments = await db.collection('tripplans').countDocuments();
  return {
    anonymousSessionDocuments: docs.length,
    tripPlanDocuments,
    sessions: docs.map(projectSession),
  };
}


async function readBackendLedger() {
  const dir = process.env.STAGE14_8A_OUT_DIR
    || path.resolve(process.cwd(), '..', 'artifacts', 'stage14_8A-live-retest');
  const file = path.join(dir, 'backend-ledger.json');
  fs.writeFileSync(path.join(dir, 'snapshot.request'), '1');
  for (let i = 0; i < 40; i += 1) {
    await new Promise((r) => setTimeout(r, 250));
    if (!fs.existsSync(path.join(dir, 'snapshot.request')) && fs.existsSync(file)) break;
  }
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
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

  const restoreSession = RESTORE_SESSION_FILE
    ? fs.readFileSync(RESTORE_SESSION_FILE, 'utf8')
    : null;
  if (!restoreSession) throw new Error('STAGE14_8B_SESSION_FILE is required to restore the guest session');

  const requests = [];
  const hardFailures = [];

  const browser = await chromium.launch({ headless: true });
  openResources.browser = browser;
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  await context.addInitScript(installSseTee);
  // Restore the SAME guest identity before any app code runs.
  await context.addInitScript((raw) => {
    window.localStorage.setItem('anonymousSession', raw);
  }, restoreSession);

  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();
    const verdict = classifyAcceptanceNetworkRequest(url);
    let origin = 'unparseable';
    try { origin = new URL(url).origin; } catch { /* keep placeholder */ }
    requests.push({ origin, method: request.method(), ...verdict });

    if (verdict.action === 'allow') return route.continue();
    if (verdict.action === 'block') return route.abort('blockedbyclient');
    hardFailures.push({ origin, ...verdict });
    return route.abort('blockedbyclient');
  });

  const consoleErrors = [];
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 250)); });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e.message).slice(0, 250)}`));

  const networkSummary = () => ({
    total: requests.length,
    requestsToPort5001: requests.filter((r) => r.classification === 'unexpected_local_backend').length,
    atlasConnections: requests.filter((r) => /mongodb\.net/.test(r.origin)).length,
    unknownExternalRequests: requests.filter((r) => r.classification === 'unknown_external').length,
    byClassification: requests.reduce((acc, r) => {
      acc[r.classification] = (acc[r.classification] || 0) + 1; return acc;
    }, {}),
  });

  await page.goto(`${STAGE14_ACCEPTANCE_FRONTEND_ORIGIN}/plan-ai`, {
    waitUntil: 'domcontentloaded', timeout: 60000,
  });
  await page.waitForTimeout(9000);

  const startingDb = await projectAll();
  const backendBefore = await readBackendLedger();

  const startingUi = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      userTurnsVisible: (text.match(/Plan a relaxed 2-day trip to Yosemite/g) || []).length,
      day1Present: /Day 1/i.test(text),
      day2Present: /Day 2/i.test(text),
      composerDisabled: document.querySelector('textarea')?.disabled ?? null,
      remainingDisplay: (text.match(/(\d+)\s+free messages? left/i) || [])[1] || null,
    };
  });

  const startingLocalStorage = await page.evaluate(() => {
    const out = {};
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      out[k] = window.localStorage.getItem(k);
    }
    return out;
  });
  const mirrorRoles = (() => {
    try {
      return JSON.parse(startingLocalStorage['planai-chat-state']).messages.map((m) => m.role);
    } catch { return null; }
  })();

  const session = startingDb.sessions[0] || {};
  const preSendGate = {
    authenticated: false,
    anonymousSessionDocuments: startingDb.anonymousSessionDocuments,
    completedTurns: session.completedTurns ?? null,
    pendingTurns: session.pendingTurns ?? null,
    failedTurns: session.failedTurns ?? null,
    completedHistoryMessages: session.completedHistoryMessages ?? null,
    authoritativeCompletedTurnCount: session.authoritativeCompletedTurnCount ?? null,
    remainingAllowance: session.remainingAllowance ?? null,
    tripPlanDocuments: startingDb.tripPlanDocuments,
    requestsToPort5001: networkSummary().requestsToPort5001,
    atlasConnections: networkSummary().atlasConnections,
    unknownExternalRequests: networkSummary().unknownExternalRequests,
    providerLedgerStartingRequests: backendBefore?.providerAttempts?.length ?? null,
    localStorageMirrorRoles: mirrorRoles,
    sameSessionRestored: session.anonymousId === JSON.parse(restoreSession).anonymousId,
  };

  const expected = {
    authenticated: false, anonymousSessionDocuments: 1, completedTurns: 1,
    pendingTurns: 0, failedTurns: 0, completedHistoryMessages: 2,
    authoritativeCompletedTurnCount: 1, remainingAllowance: 4, tripPlanDocuments: 0,
    requestsToPort5001: 0, atlasConnections: 0, unknownExternalRequests: 0,
  };
  const gateFailures = Object.entries(expected)
    .filter(([k, v]) => preSendGate[k] !== v)
    .map(([k, v]) => ({ field: k, expected: v, actual: preSendGate[k] }));

  await page.screenshot({ path: path.join(OUT_DIR, 'pre-send.png'), fullPage: true });
  write('pre-send.json', {
    testId: TEST_ID, phase: 'pre-send', generatedAt: new Date().toISOString(),
    preSendGate, gateFailures, startingDb, startingUi,
    localStorageKeys: Object.keys(startingLocalStorage),
    network: networkSummary(), hardFailures, consoleErrors,
  });

  if (gateFailures.length || hardFailures.length) {
    write('result.json', {
      testId: TEST_ID,
      result: hardFailures.length ? 'FAIL_UNEXPECTED_NETWORK' : 'FAIL_PRE_SEND_GATE',
      gateFailures, hardFailures, promptSent: false,
    });
    console.log(JSON.stringify({ stopped: 'pre_send', gateFailures, hardFailures }, null, 2));
    await browser.close(); await mongo.close(); process.exitCode = 1; return;
  }

  if (!SEND) {
    console.log(JSON.stringify({
      preSendGate, startingUi, mirrorRoles, network: networkSummary(),
      note: 'pre-send only; follow-up not submitted. Re-run with --send.',
    }, null, 2));
    await browser.close(); await mongo.close(); return;
  }

  // -------------------------------------------------------------------------
  // Send the follow-up — exactly once.
  // -------------------------------------------------------------------------
  const composer = page.getByPlaceholder(/Ask me about your trip/i);
  await composer.waitFor({ state: 'visible', timeout: 30000 });
  await composer.click();
  await composer.fill(PROMPT);

  let admissionSnapshot = null;
  const poller = (async () => {
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      const all = await projectAll();
      const s = all.sessions[0];
      if (s?.pendingTurns === 1 && !admissionSnapshot) {
        admissionSnapshot = { capturedAt: new Date().toISOString(), ...all, session: s };
        return;
      }
      if ((s?.completedTurns ?? 0) >= 2) return;
      await new Promise((r) => setTimeout(r, 40));
    }
  })();

  const backendPreSubmit = await readBackendLedger();
  const submittedAt = Date.now();
  await composer.press('Enter');
  await poller;

  let terminalOutcome = 'timeout';
  try {
    await page.waitForFunction(
      () => (window.__stage14Sse?.events || []).filter((e) => e.type === 'done' || e.type === 'error').length >= 1,
      undefined, { timeout: 300000 }
    );
    terminalOutcome = await page.evaluate(() =>
      ((window.__stage14Sse.events.find((e) => e.type === 'done')) ? 'done' : 'error'));
  } catch { terminalOutcome = 'timeout'; }

  await page.waitForTimeout(9000);

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

  const uiDetail = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      firstPromptOccurrences: (text.match(/Plan a relaxed 2-day trip to Yosemite/g) || []).length,
      followUpOccurrences: (text.match(/make Day 2 even more relaxed/gi) || []).length,
      day1Occurrences: (text.match(/Day 1/g) || []).length,
      day2Occurrences: (text.match(/Day 2/g) || []).length,
      day3Present: /Day 3/i.test(text),
      yosemiteMentioned: /Yosemite/i.test(text),
      composerDisabled: document.querySelector('textarea')?.disabled ?? null,
      remainingDisplay: (text.match(/(\d+)\s+free messages? left/i) || [])[1] || null,
      spinnerPresent: Boolean(document.querySelector('[aria-busy="true"], .animate-spin')),
      rawJsonMarkerPresent: /\[ITINERARY_JSON\]/.test(text),
      alignmentMarkerPresent: /<!--TRAILIE_(DAY|STOP)/.test(document.body.innerHTML),
      toolPayloadPresent: /"input_schema"|"tool_use"/.test(text),
      loginWallPresent: /sign in to continue|create an account to continue/i.test(text),
      bodyTextLength: text.length,
    };
  });

  // In-session assistant message identity, before any re-hydration rewrites ids.
  const inSessionIdentity = await page.evaluate(() => {
    try {
      const raw = window.localStorage.getItem('planai-chat-state');
      const msgs = JSON.parse(raw).messages;
      return msgs.map((m, i) => ({
        index: i, role: m.role, id: m.id, idType: typeof m.id,
        isPending: m.isPending ?? null, guestTurnFailed: m.guestTurnFailed ?? null,
        contentLength: (m.content || '').length,
      }));
    } catch { return null; }
  });

  await page.screenshot({ path: path.join(OUT_DIR, 'post-send.png'), fullPage: true });
  fs.writeFileSync(path.join(OUT_DIR, 'post-send.html'), await page.content());

  const assistantText = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('div,article,section'));
    const hits = nodes.map((n) => n.innerText || '').filter((t) => /Day 2/i.test(t) && t.length < 20000);
    return hits.length ? hits[hits.length - 1] : null;
  });
  if (assistantText) fs.writeFileSync(path.join(OUT_DIR, 'assistant-response-2.txt'), assistantText);

  write('send-report.json', {
    testId: TEST_ID, phase: 'send', generatedAt: new Date().toISOString(),
    prompt: PROMPT, submittedAt: new Date(submittedAt).toISOString(),
    terminalOutcome, admissionSnapshot, finalDb,
    browserSse: sse, uiDetail, inSessionIdentity,
    network: networkSummary(), hardFailures, consoleErrors,
    backendPreSubmit: backendPreSubmit ? {
      providerAttempts: backendPreSubmit.providerAttempts.length,
      network: backendPreSubmit.network,
    } : null,
    backendLedger: backendAfter,
    localStorage: Object.fromEntries(
      Object.entries(finalLocalStorage).map(([k, v]) => [k, (v || '').slice(0, 20000)])
    ),
  });

  console.log(JSON.stringify({
    terminalOutcome,
    admission: admissionSnapshot?.session,
    final: finalDb.sessions[0],
    tripPlanDocuments: finalDb.tripPlanDocuments,
    sseTypes: (sse?.events || []).map((e) => e.type).filter((t, i, a) => i === 0 || a[i - 1] !== t),
    doneCount: (sse?.events || []).filter((e) => e.type === 'done').length,
    uiDetail, network: networkSummary(), hardFailures,
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
