/**
 * Stage 14.8H — first authenticated live Trailie itinerary acceptance.
 *
 *   node scripts/stage14_8h-authenticated-itinerary.mjs          → pre-send gate only, STOPS, $0
 *   node scripts/stage14_8h-authenticated-itinerary.mjs --send    → sends the ONE authorized turn
 *
 * One authenticated user turn. No follow-up, no retry, no regeneration. If
 * anything fails the driver stops and preserves evidence rather than repairing
 * state or resending.
 *
 * The session is RESTORED rather than logged in, and `/plan-ai` is opened
 * directly: Stage 14.8G.1 §10 established that the post-login `/home` redirect
 * performs daily-feed initialization which reaches an unrelated dependency, and
 * that traffic must not be attributable to this turn.
 *
 * All browser timing comes from one `performance.now()` clock installed before
 * app code (see stage14_8h-instrumentation.js), so SSE arrival, persistence
 * acceptance and DOM reveal are directly comparable.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

import { installStage14HInstrumentation } from './stage14_8h-instrumentation.js';
import {
  STAGE14_ACCEPTANCE_BACKEND_ORIGIN,
  STAGE14_ACCEPTANCE_FRONTEND_ORIGIN,
  classifyAcceptanceNetworkRequest,
} from '../src/test-utils/stage14AcceptanceHarness.js';

const serverRequire = createRequire(path.resolve(process.cwd(), '..', 'server', 'package.json'));
const { MongoClient } = serverRequire('mongodb');

const SEND = process.argv.includes('--send');
const OUT_DIR = process.env.STAGE14_8H_OUT_DIR
  || path.resolve(process.cwd(), '..', 'artifacts', 'stage14_8H-authenticated-itinerary');
const MONGO_URI = process.env.MONGODB_URI
  || 'mongodb://127.0.0.1:27019/trailverse_internal_acceptance_stage14_8_auth';
const SESSION_FILE = process.env.STAGE14_8H_SESSION_FILE;
const TEST_ID = 'stage14_8H-authenticated-itinerary-1';

fs.mkdirSync(OUT_DIR, { recursive: true });

/** §9 — sent exactly once, verbatim. */
const PROMPT = 'Plan a relaxed 3-day trip to Zion National Park for a first-time visitor. I prefer easy to moderate walks, scenic viewpoints, and enough downtime so the trip doesn’t feel rushed. Do not check live weather or current conditions.';

const write = (name, data) =>
  fs.writeFileSync(path.join(OUT_DIR, name), `${JSON.stringify(data, null, 2)}\n`);

const sha = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

const open = { browser: null, mongo: null };
const cleanup = async () => {
  try { await open.browser?.close(); } catch { /* already closed */ }
  try { await open.mongo?.close(); } catch { /* already closed */ }
};

async function readBackendLedger() {
  const file = path.join(OUT_DIR, 'backend-ledger.json');
  fs.writeFileSync(path.join(OUT_DIR, 'snapshot.request'), '1');
  for (let i = 0; i < 60; i += 1) {
    await new Promise((r) => { setTimeout(r, 250); });
    if (!fs.existsSync(path.join(OUT_DIR, 'snapshot.request')) && fs.existsSync(file)) break;
  }
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/** Bounded projection of a stored TripPlan, for identity and frozen-plan checks. */
function projectStoredTrip(doc) {
  if (!doc) return null;
  const conversation = Array.isArray(doc.conversation) ? doc.conversation : [];
  const assistant = conversation.filter((m) => m.role === 'assistant');
  const plan = doc.plan || null;
  const days = Array.isArray(plan?.days) ? plan.days : [];

  return {
    tripId: String(doc._id),
    userId: String(doc.userId),
    parkCode: doc.parkCode ?? null,
    parkName: doc.parkName ?? null,
    title: doc.title ?? null,
    status: doc.status ?? null,
    conversationLength: conversation.length,
    roleSequence: conversation.map((m) => m.role),
    userTurns: conversation.filter((m) => m.role === 'user').length,
    assistantTurns: assistant.length,
    assistantSlots: assistant.map((m) => ({
      id: m.id ?? null,
      idType: typeof m.id,
      timestamp: m.timestamp ?? null,
      responseId: m.responseId ?? null,
      responseVersion: m.responseVersion ?? null,
      responseRevision: m.responseRevision ?? null,
      lifecycleStatus: m.lifecycleStatus ?? null,
      itineraryHash: m.itineraryHash ?? null,
      contentLength: typeof m.content === 'string' ? m.content.length : null,
      contentHash: typeof m.content === 'string' ? sha(m.content) : null,
    })),
    plan: plan
      ? {
        parkName: plan.parkName ?? null,
        parkCode: plan.parkCode ?? null,
        numberOfDays: days.length,
        dayOrder: days.map((d) => d?.day ?? null),
        dayTitles: days.map((d) => (typeof d?.title === 'string' ? d.title.slice(0, 120) : null)),
        dayStopNames: days.map((d) => (Array.isArray(d?.stops) ? d.stops : [])
          .map((s) => (typeof s?.name === 'string' ? s.name.slice(0, 90) : null))),
        itineraryHash: plan.itineraryHash ?? null,
        lifecycleStatus: plan.lifecycleStatus ?? null,
        responseRevision: plan.responseRevision ?? null,
        frozenPlanHash: sha(JSON.stringify(days.map((d) => ({
          day: d?.day ?? null,
          stops: (Array.isArray(d?.stops) ? d.stops : []).map((s) => s?.name ?? null),
        })))),
      }
      : null,
  };
}

/** In-page UI snapshot. Text-derived, because the components carry no test ids. */
const UI_STATE_FN = (promptText) => {
  const cards = Array.from(document.querySelectorAll('section[aria-label="Trip itinerary"]'));
  const bodyText = document.body.innerText || '';
  const card = cards[0] || null;
  const cardText = card ? card.innerText : '';

  const dayHeadingMatches = cardText.match(/Day\s*\d+/gi) || [];
  const uniqueDays = [...new Set(dayHeadingMatches.map((d) => d.toLowerCase().replace(/\s+/g, '')))];

  return {
    pathname: window.location.pathname,
    userPromptOccurrences: bodyText.split(promptText).length - 1,
    itineraryCards: cards.length,
    cardDayLabel: (cardText.match(/(\d+)\s+days?/) || [])[1] || null,
    cardDayHeadings: uniqueDays.length,
    cardTextLength: cardText.length,
    bodyTextLength: bodyText.length,

    // §14/§23 — leakage markers that must never reach the UI.
    rawItineraryJsonMarker: /\[ITINERARY_JSON\]/.test(bodyText),
    alignmentMarkerPresent: /\[\[ALIGN|ALIGN_MARKER|<<ALIGN/.test(bodyText),
    rawJsonBlockPresent: /"days"\s*:\s*\[/.test(bodyText),
    toolPayloadPresent: /"tool_use"|"input_schema"|tool_result/.test(bodyText),
    providerPayloadPresent: /anthropic|claude-sonnet|api\.anthropic/i.test(bodyText),

    spinnerPresent: Boolean(document.querySelector('[class*="animate-spin"], [role="progressbar"]')),
    composerPresent: Boolean(document.querySelector('textarea')),
    composerEnabled: document.querySelector('textarea')
      ? !document.querySelector('textarea').disabled : null,
    composerValueLength: document.querySelector('textarea')
      ? document.querySelector('textarea').value.length : null,

    loginFormPresent: Boolean(
      document.querySelector('input[type="password"]') && document.querySelector('input[type="email"]')
    ),
    freeMessageCounterVisible: /free messages? left|messages? remaining/i.test(bodyText),
    conversionPromptVisible: /sign in or create an account/i.test(bodyText),

    // Zion/pacing signals for the plan-consistency assessment.
    mentionsZion: /zion/i.test(bodyText),
    mentionsThreeDays: /\b3[- ]day\b|\bthree[- ]day\b/i.test(bodyText),

    tokenPresent: window.localStorage.getItem('token') != null,
    instrumentation: window.__stage14H
      ? {
        sseEventTypes: window.__stage14H.sse.events.map((e) => e.type),
        sseClosed: window.__stage14H.sse.closed,
        writes: window.__stage14H.writes,
        itineraryCard: window.__stage14H.itineraryCard,
        reveal: window.__stage14H.reveal,
        sendPressedAtMs: window.__stage14H.sendPressedAtMs,
        timeOrigin: window.__stage14H.timeOrigin,
      }
      : null,
  };
};

async function main() {
  const mongo = new MongoClient(MONGO_URI);
  open.mongo = mongo;
  await mongo.connect();
  const db = mongo.db();

  const dbState = async () => {
    const trips = await db.collection('tripplans').find({}).toArray();
    const messages = trips.flatMap((t) => t.conversation || []);
    return {
      users: await db.collection('users').countDocuments(),
      tripPlanCount: trips.length,
      authenticatedUserTurns: messages.filter((m) => m.role === 'user').length,
      authenticatedAssistantTurns: messages.filter((m) => m.role === 'assistant').length,
      anonymousSessionDocuments: await db.collection('anonymoussessions').countDocuments(),
      conversations: await db.collection('conversations').countDocuments(),
    };
  };

  const session = SESSION_FILE ? JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')) : null;
  if (!session?.token) throw new Error('STAGE14_8H_SESSION_FILE with a restored session is required');

  const requests = [];
  const hardFailures = [];
  let sendBoundaryIndex = null;

  // Tracing/video/HAR stay OFF — each would persist credential material.
  const browser = await chromium.launch({ headless: true });
  open.browser = browser;
  const context = await browser.newContext({ viewport: { width: 1440, height: 1400 } });

  await context.addInitScript(installStage14HInstrumentation);
  await context.addInitScript(([token, user]) => {
    window.localStorage.setItem('token', token);
    window.localStorage.setItem('user', user);
    document.cookie = `trailverse_auth_token=${token}; path=/; SameSite=Lax`;
  }, [session.token, session.user]);

  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();
    const verdict = classifyAcceptanceNetworkRequest(url);
    let origin = 'unparseable';
    let pathname = '';
    try {
      const parsed = new URL(url);
      origin = parsed.origin;
      pathname = parsed.pathname;
    } catch { /* keep placeholder */ }
    requests.push({ origin, pathname, method: request.method(), ...verdict });

    if (verdict.action === 'allow') return route.continue();
    if (verdict.action === 'block') return route.abort('blockedbyclient');
    hardFailures.push({ origin, pathname, ...verdict });
    return route.abort('blockedbyclient');
  });

  const consoleLines = [];
  const page = await context.newPage();
  page.on('console', (m) => consoleLines.push(m.text()));
  page.on('pageerror', (e) => consoleLines.push(`pageerror: ${String(e.message)}`));

  const networkSummary = (fromIndex = 0) => {
    const slice = requests.slice(fromIndex);
    return {
      total: slice.length,
      loopbackFrontend: slice.filter((r) => r.classification === 'loopback_frontend').length,
      loopbackBackend: slice.filter((r) => r.classification === 'loopback_acceptance_backend').length,
      port5001Requests: slice.filter((r) => r.classification === 'unexpected_local_backend').length,
      atlasConnections: slice.filter((r) => /mongodb\.net/.test(r.origin)).length,
      anthropicRequests: slice.filter((r) => /anthropic\.com/.test(r.origin)).length,
      openAiRequests: slice.filter((r) => /openai\.com/.test(r.origin)).length,
      webSearchRequests: slice.filter((r) => /brave|serper|tavily/.test(r.origin)).length,
      weatherRequests: slice.filter((r) => /openweathermap|open-meteo|weather\.gov/.test(r.origin)).length,
      ridbRequests: slice.filter((r) => /ridb|recreation\.gov/.test(r.origin)).length,
      geocodingRequests: slice.filter((r) => /mapbox|nominatim/.test(r.origin)).length,
      npsRequests: slice.filter((r) => /nps\.gov/.test(r.origin)).length,
      unknownExternalRequests: slice.filter((r) => r.classification === 'unknown_external').length,
      expectedBlocked: slice.filter((r) => r.classification.startsWith('expected_blocked')).length,
      parkCatalogCalls: slice.filter((r) => r.pathname.startsWith('/api/parks')).length,
      chatStreamCalls: slice.filter((r) => r.pathname === '/api/ai/chat-stream').length,
      byClassification: slice.reduce((acc, r) => {
        acc[r.classification] = (acc[r.classification] || 0) + 1; return acc;
      }, {}),
    };
  };

  // ── §5/§6/§7 pre-send gate ────────────────────────────────────────────────
  await page.goto(`${STAGE14_ACCEPTANCE_FRONTEND_ORIGIN}/plan-ai`, {
    waitUntil: 'domcontentloaded', timeout: 120000,
  });
  await page.waitForTimeout(10000);

  const preSendUi = await page.evaluate(UI_STATE_FN, PROMPT);
  const preSendDb = await dbState();
  const backendBefore = await readBackendLedger();
  const preSendNetwork = networkSummary(0);

  const gate = {
    frontendOrigin: STAGE14_ACCEPTANCE_FRONTEND_ORIGIN,
    backendOrigin: STAGE14_ACCEPTANCE_BACKEND_ORIGIN,
    mongoUri: MONGO_URI,
    atlasAbsent: preSendNetwork.atlasConnections === 0,
    port5001Absent: preSendNetwork.port5001Requests === 0,

    authenticated: preSendUi.tokenPresent,
    authenticatedUserResolved: preSendUi.tokenPresent && !preSendUi.loginFormPresent,
    guestSessionActive: preSendUi.freeMessageCounterVisible || preSendUi.conversionPromptVisible,
    authCredentialPresent: preSendUi.tokenPresent,
    rawCredentialCaptured: false,
    visitedHome: false,

    composerPresent: preSendUi.composerPresent,
    composerEnabled: preSendUi.composerEnabled === true,

    users: preSendDb.users,
    authenticatedUserTurns: preSendDb.authenticatedUserTurns,
    authenticatedAssistantTurns: preSendDb.authenticatedAssistantTurns,
    tripPlanCount: preSendDb.tripPlanCount,

    anonymousFreeMessageCounterVisible: preSendUi.freeMessageCounterVisible,
    anonymousConversionPromptVisible: preSendUi.conversionPromptVisible,

    itineraryCardsBeforeSend: preSendUi.itineraryCards,

    providerRequestsBeforeSend: backendBefore?.providerTotals?.requests
      ?? backendBefore?.providerAttempts?.length ?? 0,
    capsConfigured: backendBefore?.caps ?? null,
    capProjectionBeforeFirstDispatch: backendBefore?.caps
      ? {
        requestsRemaining: backendBefore.caps.maxRequests - (backendBefore.providerAttempts?.length ?? 0),
        inputTokensRemaining: backendBefore.caps.maxInputTokens - (backendBefore.providerTotals?.inputTokens ?? 0),
        outputTokensRemaining: backendBefore.caps.maxOutputTokens - (backendBefore.providerTotals?.outputTokens ?? 0),
        costRemainingUsd: backendBefore.caps.maxCostUsd - (backendBefore.providerTotals?.costUsd ?? 0),
      }
      : null,

    // Classified BEFORE the send boundary so it can never be attributed to the turn.
    preSendMountTraffic: {
      parkCatalogCalls: preSendNetwork.parkCatalogCalls,
      expectedBlocked: preSendNetwork.expectedBlocked,
      backendExternalAttempts: backendBefore?.network?.externalNetworkAttempts ?? 0,
    },
  };

  gate.passed = gate.authenticated
    && gate.authenticatedUserResolved
    && !gate.guestSessionActive
    && gate.composerPresent
    && gate.composerEnabled
    && gate.users === 1
    && gate.authenticatedUserTurns === 0
    && gate.authenticatedAssistantTurns === 0
    && gate.tripPlanCount === 0
    && gate.atlasAbsent
    && gate.port5001Absent
    && gate.providerRequestsBeforeSend === 0
    && gate.itineraryCardsBeforeSend === 0;

  await page.screenshot({ path: path.join(OUT_DIR, 'pre-send.png') });
  write('pre-send-gate.json', {
    testId: TEST_ID,
    step: 'pre-send-gate',
    generatedAt: new Date().toISOString(),
    sendAuthorized: SEND,
    gate,
    ui: preSendUi,
    database: preSendDb,
    network: preSendNetwork,
  });

  if (!gate.passed) {
    write('result.json', {
      testId: TEST_ID, result: 'FAIL_PRE_SEND_GATE',
      generatedAt: new Date().toISOString(), gate, providerCostUsd: 0,
    });
    console.log(JSON.stringify({ result: 'FAIL_PRE_SEND_GATE', gate }, null, 2));
    await cleanup();
    process.exitCode = 2;
    return;
  }

  if (!SEND) {
    console.log(JSON.stringify({
      result: 'PRE_SEND_GATE_PASSED_STOPPING', providerCostUsd: 0, gate,
    }, null, 2));
    await cleanup();
    return;
  }

  // ── §9 the single authorized send ─────────────────────────────────────────
  sendBoundaryIndex = requests.length;

  const composer = page.getByPlaceholder(/Ask me about your trip/i);
  await composer.waitFor({ state: 'visible', timeout: 60000 });
  await composer.click();
  await composer.fill(PROMPT);

  const typed = await page.evaluate(() => document.querySelector('textarea').value);
  if (typed !== PROMPT) throw new Error('composer content does not match the authorized prompt verbatim');

  await page.evaluate(() => window.__stage14HMarkSend());
  await composer.press('Enter');

  // ── wait for the terminal event, without retrying anything ────────────────
  const deadline = Date.now() + 300000;
  let terminal = null;
  for (;;) {
    const state = await page.evaluate(() => {
      const H = window.__stage14H;
      const types = H.sse.events.map((e) => e.type);
      return {
        types,
        done: types.includes('done'),
        proseReady: types.includes('prose_ready'),
        itineraryReady: types.includes('itinerary_ready'),
        error: types.includes('error'),
        reveal: H.reveal,
        writes: H.writes.length,
      };
    });
    if (state.done || state.error) { terminal = state; break; }
    if (Date.now() > deadline) { terminal = { ...state, timedOut: true }; break; }
    await page.waitForTimeout(1000);
  }

  // Let revision 2 and the final render settle; no interaction, no resend.
  await page.waitForTimeout(12000);

  const postSendUi = await page.evaluate(UI_STATE_FN, PROMPT);
  const postSendDb = await dbState();
  const storedTrips = await db.collection('tripplans').find({}).toArray();
  const storedTrip = projectStoredTrip(storedTrips[0]);
  const backendAfter = await readBackendLedger();
  const requestWindowNetwork = networkSummary(sendBoundaryIndex);

  await page.screenshot({ path: path.join(OUT_DIR, 'post-completion.png'), fullPage: true });

  write('turn-evidence.json', {
    testId: TEST_ID,
    step: 'turn',
    generatedAt: new Date().toISOString(),
    prompt: PROMPT,
    promptSentOnce: true,
    promptEditedOrRegenerated: false,
    terminal,
    ui: postSendUi,
    database: postSendDb,
    storedTrip,
    requestWindowNetwork,
    sendBoundaryIndex,
    hardFailures,
    consoleLineCount: consoleLines.length,
  });

  // ── §25 exactly one ordinary refresh ──────────────────────────────────────
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(12000);

  const restoreUi = await page.evaluate(UI_STATE_FN, PROMPT);
  const restoreDb = await dbState();
  const restoredTrips = await db.collection('tripplans').find({}).toArray();
  const restoredTrip = projectStoredTrip(restoredTrips[0]);
  await page.screenshot({ path: path.join(OUT_DIR, 'after-restore.png'), fullPage: true });

  write('restore-evidence.json', {
    testId: TEST_ID,
    step: 'restore',
    generatedAt: new Date().toISOString(),
    refreshCount: 1,
    loggedOut: false,
    ui: restoreUi,
    database: restoreDb,
    storedTrip: restoredTrip,
    network: networkSummary(0),
  });

  write('browser-instrumentation.json', {
    testId: TEST_ID,
    generatedAt: new Date().toISOString(),
    clock: 'performance.now() from the document, single monotonic source',
    timeOrigin: postSendUi.instrumentation?.timeOrigin ?? null,
    sseEvents: await page.evaluate(() => window.__stage14H.sse.events),
    writes: postSendUi.instrumentation?.writes ?? [],
    itineraryCard: postSendUi.instrumentation?.itineraryCard ?? null,
    reveal: postSendUi.instrumentation?.reveal ?? null,
    sendPressedAtMs: postSendUi.instrumentation?.sendPressedAtMs ?? null,
    pollSampleTail: (await page.evaluate(() => window.__stage14H.polls.slice(-40))),
  });

  // Console lines are redacted before they are written: the app is quiet about
  // credentials after 14.8G.1, but a captured transcript must not depend on that.
  const tokenSlices = [];
  const transcript = consoleLines.join('\n');
  for (let i = 0; i + 16 <= session.token.length; i += 1) {
    if (transcript.includes(session.token.slice(i, i + 16))) tokenSlices.push(i);
  }
  write('console-transcript.json', {
    testId: TEST_ID,
    lines: consoleLines.length,
    rawTokenOccurrences: transcript.split(session.token).length - 1,
    partialTokenSliceOccurrences: tokenSlices.length,
    errorsAndWarnings: consoleLines
      .filter((l) => /error|failed|warn/i.test(l))
      .slice(0, 25)
      .map((l) => l.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]').slice(0, 220)),
  });

  console.log(JSON.stringify({
    terminal,
    itineraryVisibleAtMs: postSendUi.instrumentation?.reveal?.itineraryVisibleAtMs ?? null,
    proseVisibleAtMs: postSendUi.instrumentation?.reveal?.proseVisibleAtMs ?? null,
    writes: (postSendUi.instrumentation?.writes ?? []).map((w) => ({
      method: w.method, status: w.status, revision: w.body?.assistantMessage?.responseRevision ?? null,
    })),
    providerTotals: backendAfter?.providerTotals ?? null,
    tripPlanCount: postSendDb.tripPlanCount,
  }, null, 2));

  await cleanup();
}

main().catch(async (error) => {
  const message = String(error.message || error);
  console.error('[stage14_8H] driver failed:', message);
  write('driver-error.json', { testId: TEST_ID, generatedAt: new Date().toISOString(), message });
  await cleanup();
  process.exitCode = 1;
});
