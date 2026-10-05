/**
 * Stage 14.8E §19/§20 — read-only observation of the post-exhaustion state.
 *
 * The Stage 14.8E driver crashed after the fifth turn had already completed and
 * been persisted (`uiBoundary` was referenced but never defined), so its
 * `send-report.json` — and with it the localStorage and UI-boundary capture —
 * was never written.
 *
 * This script re-opens the SAME guest session read-only to recover that state.
 * It submits nothing, makes zero provider calls and consumes zero quota; it
 * only loads the page and reads what is already there. The fifth turn is NOT
 * re-sent.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { installSseTee } from './stage14_8a-sse-tee.js';

import {
  STAGE14_ACCEPTANCE_FRONTEND_ORIGIN,
  classifyAcceptanceNetworkRequest,
} from '../src/test-utils/stage14AcceptanceHarness.js';

const serverRequire = createRequire(path.resolve(process.cwd(), '..', 'server', 'package.json'));
const { MongoClient } = serverRequire('mongodb');

const OUT_DIR = process.env.STAGE14_8E_OUT_DIR
  || path.resolve(process.cwd(), '..', 'artifacts', 'stage14_8E-guest-message-5');
const RESTORE_SESSION_FILE = process.env.STAGE14_8E_SESSION_FILE;
const MONGO_URI = 'mongodb://127.0.0.1:27018/trailverse_internal_acceptance_stage14_8a';

const STOP_VOCABULARY = [
  'Tunnel View', 'Bridalveil Fall', 'Lower Yosemite Fall', "Cook's Meadow",
  'Sentinel Bridge', 'Mirror Lake', 'Glacier Point', 'Valley View',
  'Mariposa Grove', 'Swinging Bridge', 'The Ahwahnee', 'Yosemite Valley Lodge',
  "Degnan's Kitchen", 'Mountain Room', 'Curry Village', 'Half Dome',
  'El Capitan', 'Yosemite Falls', 'Merced River', 'Village Store',
  'Big Trees Loop', 'Southside Drive', 'Yosemite Valley',
];

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
  const mongo = new MongoClient(MONGO_URI);
  openResources.mongo = mongo;
  await mongo.connect();
  const doc = await mongo.db().collection('anonymoussessions').findOne({});

  const restoreSession = fs.readFileSync(RESTORE_SESSION_FILE, 'utf8');
  const requests = [];
  const hardFailures = [];

  const browser = await chromium.launch({ headless: true });
  openResources.browser = browser;
  const context = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
  await context.addInitScript(installSseTee);
  await context.addInitScript((raw) => {
    window.localStorage.setItem('anonymousSession', raw);
  }, restoreSession);

  await context.route('**/*', async (route) => {
    const url = route.request().url();
    const verdict = classifyAcceptanceNetworkRequest(url);
    let origin = 'unparseable';
    try { origin = new URL(url).origin; } catch { /* keep placeholder */ }
    requests.push({ origin, ...verdict });
    if (verdict.action === 'allow') return route.continue();
    if (verdict.action !== 'block') hardFailures.push({ origin, ...verdict });
    return route.abort('blockedbyclient');
  });

  const page = await context.newPage();
  await page.goto(`${STAGE14_ACCEPTANCE_FRONTEND_ORIGIN}/plan-ai`, {
    waitUntil: 'domcontentloaded', timeout: 60000,
  });
  await page.waitForTimeout(10000);

  const uiBoundary = await page.evaluate(() => {
    const text = document.body.innerText;
    const composer = document.querySelector('textarea');
    return {
      composerPresent: Boolean(composer),
      composerEnabledAfterFifth: composer ? !composer.disabled : null,
      composerPlaceholder: composer ? composer.placeholder : null,
      loginOrUpgradePromptVisible:
        /sign in|sign up|create an account|create a free account|log in/i.test(text),
      sixthAttemptAffordanceVisible: Boolean(composer && !composer.disabled),
      remainingBadgeText: (text.match(/(\d+)\s+free messages?\s+left/i) || [])[0] || null,
      conversionMessageVisible: /you'?ve used all|out of free|free messages/i.test(text),
      spinnerPresent: Boolean(document.querySelector('[aria-busy="true"], .animate-spin')),
      bodyTextLength: text.length,
    };
  });

  const localStorageState = await page.evaluate(() => {
    const out = {};
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      out[k] = window.localStorage.getItem(k);
    }
    return out;
  });

  const header = await page.evaluate(() => {
    const c = Array.from(document.querySelectorAll('h1,h2,h3,header div,div'))
      .map((n) => (n.innerText || '').trim())
      .filter((t) => t && t.length < 80 && /^(Planning|Outdoor trip planning)/i.test(t));
    return c[0] || null;
  });

  const stopsInFinalAnswer = await page.evaluate((vocab) => {
    const tail = document.body.innerText.slice(-2500);
    return vocab.filter((n) => tail.toLowerCase().includes(n.toLowerCase()));
  }, STOP_VOCABULARY);

  await page.screenshot({ path: path.join(OUT_DIR, 'post-exhaustion.png'), fullPage: true });

  let mirror = null;
  try {
    mirror = JSON.parse(localStorageState['planai-chat-state']).messages.map((m) => ({
      role: m.role, id: m.id, idType: typeof m.id,
      isPending: m.isPending ?? null, guestTurnFailed: m.guestTurnFailed ?? null,
      contentLength: (m.content || '').length,
    }));
  } catch { /* reported as null */ }

  const anonSession = (() => {
    try { return JSON.parse(localStorageState.anonymousSession); } catch { return null; }
  })();

  const report = {
    note: 'Read-only recovery of Stage 14.8E §19/§20. Nothing was submitted; zero provider calls.',
    generatedAt: new Date().toISOString(),
    header,
    uiBoundary,
    localStorage: {
      mirror,
      mirrorRoles: mirror ? mirror.map((m) => m.role) : null,
      locallyCompletedTurns: anonSession?.messageCount ?? null,
      localCanSendMore: anonSession?.canSendMore ?? null,
      locallyRemainingAllowance: anonSession
        ? Math.max(0, 5 - (anonSession.messageCount ?? 0)) : null,
      activeTripContext: anonSession?.activeTripContext
        ? {
          primary: anonSession.activeTripContext.primaryDestination?.name ?? null,
          primaryParkCode: anonSession.activeTripContext.primaryDestination?.parkCode ?? null,
          locked: anonSession.activeTripContext.lockedPlanDestination?.name ?? null,
          lockedParkCode: anonSession.activeTripContext.lockedPlanDestination?.parkCode ?? null,
        }
        : null,
    },
    serverState: {
      completedTurns: doc.turns.filter((t) => t.status === 'completed').length,
      pendingTurns: doc.turns.filter((t) => t.status === 'pending').length,
      failedTurns: doc.turns.filter((t) => t.status === 'failed').length,
      completedTurnCountCache: doc.completedTurnCount,
      completedHistoryMessages: doc.messages.length,
      completedHistoryRoles: doc.messages.map((m) => m.role),
    },
    stopsInFinalAnswer,
    network: {
      requestsToPort5001: requests.filter((r) => r.classification === 'unexpected_local_backend').length,
      atlasConnections: requests.filter((r) => /mongodb\.net/.test(r.origin)).length,
      unknownExternalRequests: requests.filter((r) => r.classification === 'unknown_external').length,
    },
    hardFailures,
  };

  fs.writeFileSync(
    path.join(OUT_DIR, 'post-exhaustion-observation.json'),
    `${JSON.stringify(report, null, 2)}\n`
  );
  console.log(JSON.stringify(report, null, 2));

  await browser.close();
  await mongo.close();
}

main().catch(async (error) => {
  await releaseOpenResources(); console.error('observation failed:', error.message); process.exitCode = 1; });
