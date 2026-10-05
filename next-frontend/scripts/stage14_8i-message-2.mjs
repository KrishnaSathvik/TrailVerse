/**
 * Stage 14.8I — authenticated live message 2: existing-trip contextual revision.
 *
 *   node scripts/stage14_8i-message-2.mjs          → pre-send gate only, STOPS, $0
 *   node scripts/stage14_8i-message-2.mjs --send    → sends the ONE authorized turn
 *
 * One follow-up message against the canonical post-H continuation fixture. The
 * point of this stage is narrower and harder than asking another question: a
 * SECOND logical response must update the EXISTING trip, in a new response
 * identity, through the same two-revision lifecycle, without touching turn 1.
 *
 * Two mechanics differ from Stage 14.8H and matter:
 *   - reveal is measured as a DELTA against the pre-send screen, because turn 1's
 *     card and prose are already rendered
 *   - a Mongo read is taken MID-FLIGHT, after revision 1 is accepted and before
 *     revision 2, which Stage 14.8H never captured live
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
const OUT_DIR = process.env.STAGE14_8I_OUT_DIR
  || path.resolve(process.cwd(), '..', 'artifacts', 'stage14_8I-authenticated-message-2');
const MONGO_URI = process.env.MONGODB_URI
  || 'mongodb://127.0.0.1:27019/trailverse_internal_acceptance_stage14_8i';
const EMAIL = process.env.STAGE14_8I_EMAIL || 'replayfixture@trailverselocal.dev';
const SECRET_FILE = process.env.STAGE14_8I_SECRET_FILE;
const TEST_ID = 'stage14_8I-authenticated-message-2';

fs.mkdirSync(OUT_DIR, { recursive: true });

/** §10 — sent exactly once, verbatim. Zion is deliberately never named. */
const PROMPT = 'Can you make Day 2 easier by replacing the moderate hike with easy options, keep the total walking for that day under about 3 miles, and preserve the scenic-viewpoint focus? Don’t check live weather or current conditions.';

const write = (name, data) =>
  fs.writeFileSync(path.join(OUT_DIR, name), `${JSON.stringify(data, null, 2)}\n`);
const sha = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const frozenPlanHash = (plan) => sha(JSON.stringify((plan?.days || []).map((d) => ({
  dayNumber: d.dayNumber,
  stops: (d.stops || []).map((s) => s?.name ?? null),
}))));

const open = { browser: null, mongo: null };
const cleanup = async () => {
  try { await open.browser?.close(); } catch { /* already closed */ }
  try { await open.mongo?.close(); } catch { /* already closed */ }
};

/** Bounded projection of the stored trip, per response slot. */
function projectTrip(trip) {
  if (!trip) return null;
  const conversation = trip.conversation || [];
  const assistant = conversation.filter((m) => m.role === 'assistant');
  const slots = assistant.map((m) => ({
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
  }));

  const days = trip.plan?.days || [];
  return {
    tripId: String(trip._id),
    parkName: trip.parkName ?? null,
    parkCode: trip.parkCode ?? null,
    roleSequence: conversation.map((m) => m.role),
    userTurns: conversation.filter((m) => m.role === 'user').length,
    assistantTurns: assistant.length,
    welcomePersisted: assistant.some((m) => !m.responseId),
    responseVersionsPresent: [...new Set(slots.map((s) => s.responseVersion).filter((v) => v != null))].sort(),
    slots,
    plan: {
      parkName: trip.plan?.parkName ?? null,
      parkCode: trip.plan?.parkCode ?? null,
      dayCount: days.length,
      dayNumbers: days.map((d) => d.dayNumber ?? null),
      dayLabels: days.map((d) => d.label ?? null),
      dayStopNames: days.map((d) => (d.stops || []).map((s) => s?.name ?? null)),
      dayStopDetail: days.map((d) => (d.stops || []).map((s) => ({
        name: s?.name ?? null,
        distance: s?.distance ?? s?.miles ?? s?.length ?? null,
        difficulty: s?.difficulty ?? null,
      }))),
      itineraryHash: trip.plan?.itineraryHash ?? null,
      frozenPlanHash: frozenPlanHash(trip.plan),
      lifecycleStatus: trip.plan?.lifecycleStatus ?? null,
      responseRevision: trip.plan?.responseRevision ?? null,
    },
  };
}

const UI_STATE_FN = (promptText) => {
  const cards = Array.from(document.querySelectorAll('section[aria-label="Trip itinerary"]'));
  const bodyText = document.body.innerText || '';
  return {
    pathname: window.location.pathname,
    promptOccurrences: bodyText.split(promptText).length - 1,
    itineraryCards: cards.length,
    cardDayLabels: cards.map((c) => (c.innerText.match(/(\d+)\s+days?/) || [])[1] || null),
    welcomeVisible: /I'm \*\*Trailie\*\*|I'm Trailie/.test(bodyText),
    priorPromptVisible: /Plan a relaxed 3-day trip to Zion/i.test(bodyText),
    mentionsZion: /zion/i.test(bodyText),
    spinnerPresent: Boolean(document.querySelector('[class*="animate-spin"], [role="progressbar"]')),
    composerPresent: Boolean(document.querySelector('textarea')),
    composerEnabled: document.querySelector('textarea') ? !document.querySelector('textarea').disabled : null,
    composerValueLength: document.querySelector('textarea') ? document.querySelector('textarea').value.length : null,
    loginFormPresent: Boolean(
      document.querySelector('input[type="password"]') && document.querySelector('input[type="email"]')
    ),
    freeMessageCounterVisible: /free messages? left|messages? remaining/i.test(bodyText),
    conversionPromptVisible: /sign in or create an account/i.test(bodyText),
    rawItineraryJsonMarker: /\[ITINERARY_JSON\]/.test(bodyText),
    alignmentMarkerPresent: /\[\[ALIGN|ALIGN_MARKER|<<ALIGN/.test(bodyText),
    rawJsonBlockPresent: /"days"\s*:\s*\[/.test(bodyText),
    toolPayloadPresent: /"tool_use"|"input_schema"|tool_result/.test(bodyText),
    providerPayloadPresent: /api\.anthropic|claude-sonnet/i.test(bodyText),
    bodyTextLength: bodyText.length,
    tokenPresent: window.localStorage.getItem('token') != null,
    instrumentation: window.__stage14H
      ? {
        sseEventTypes: window.__stage14H.sse.events.map((e) => e.type),
        sseEvents: window.__stage14H.sse.events,
        sseClosed: window.__stage14H.sse.closed,
        writes: window.__stage14H.writes,
        itineraryCard: window.__stage14H.itineraryCard,
        sendPressedAtMs: window.__stage14H.sendPressedAtMs,
        baselineAtSend: window.__stage14H.baselineAtSend ?? null,
        revealDeltas: window.__stage14HRevealDeltas ? window.__stage14HRevealDeltas() : null,
        pollTail: window.__stage14H.polls.slice(-30),
      }
      : null,
  };
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

async function main() {
  if (!SECRET_FILE) throw new Error('STAGE14_8I_SECRET_FILE is required');
  const password = fs.readFileSync(SECRET_FILE, 'utf8');

  const mongo = new MongoClient(MONGO_URI);
  open.mongo = mongo;
  await mongo.connect();
  const trips = mongo.db().collection('tripplans');

  const beforeTrip = projectTrip(await trips.findOne({}));
  if (!beforeTrip) throw new Error('continuation fixture trip not found');

  const turn1 = beforeTrip.slots.at(-1);
  const turn1Identity = {
    tripId: beforeTrip.tripId,
    response1Id: turn1.responseId,
    response1Version: turn1.responseVersion,
    assistant1MessageId: turn1.id,
    assistant1Timestamp: turn1.timestamp,
    response1FinalRevision: turn1.responseRevision,
    response1ItineraryHash: beforeTrip.plan.itineraryHash,
    response1FrozenPlanHash: beforeTrip.plan.frozenPlanHash,
    response1ContentHash: turn1.contentHash,
  };

  // Session via the real login route; the token is seeded so /plan-ai/:id opens
  // directly on the existing trip without a /home detour.
  const loginRes = await fetch(`${STAGE14_ACCEPTANCE_BACKEND_ORIGIN}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password }),
  });
  const loginBody = await loginRes.json();
  if (!loginRes.ok || !loginBody.token) throw new Error(`login failed: ${loginRes.status}`);
  const session = { token: loginBody.token, user: JSON.stringify(loginBody.data) };

  const requests = [];
  const hardFailures = [];
  let sendBoundaryIndex = null;

  const browser = await chromium.launch({ headless: true });
  open.browser = browser;
  const context = await browser.newContext({ viewport: { width: 1440, height: 1600 } });
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

  const networkSummary = (from = 0) => {
    const slice = requests.slice(from);
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
      npsRequests: slice.filter((r) => /nps\.gov/.test(r.origin)).length,
      ridbRequests: slice.filter((r) => /ridb|recreation\.gov/.test(r.origin)).length,
      geocodingRequests: slice.filter((r) => /mapbox|nominatim/.test(r.origin)).length,
      unknownExternalRequests: slice.filter((r) => r.classification === 'unknown_external').length,
      expectedBlocked: slice.filter((r) => r.classification.startsWith('expected_blocked')).length,
      tripCreates: slice.filter((r) => r.method === 'POST' && r.pathname === '/api/trips').length,
      tripUpdates: slice.filter((r) => r.method === 'PUT' && /^\/api\/trips\/[^/]+$/.test(r.pathname)).length,
      chatStreamCalls: slice.filter((r) => r.pathname === '/api/ai/chat-stream').length,
      byClassification: slice.reduce((acc, r) => {
        acc[r.classification] = (acc[r.classification] || 0) + 1; return acc;
      }, {}),
    };
  };

  // ── §7 restore the existing trip ──
  await page.goto(`${STAGE14_ACCEPTANCE_FRONTEND_ORIGIN}/plan-ai/${beforeTrip.tripId}?chat=true`, {
    waitUntil: 'domcontentloaded', timeout: 120000,
  });
  await page.waitForTimeout(12000);

  const preSendUi = await page.evaluate(UI_STATE_FN, PROMPT);
  const backendBefore = await readBackendLedger();
  const preSendNetwork = networkSummary(0);

  const gate = {
    frontendOrigin: STAGE14_ACCEPTANCE_FRONTEND_ORIGIN,
    backendOrigin: STAGE14_ACCEPTANCE_BACKEND_ORIGIN,
    mongoUri: MONGO_URI,
    authenticated: preSendUi.tokenPresent,
    sameUserResolved: preSendUi.tokenPresent && !preSendUi.loginFormPresent,
    tripPlanCount: await trips.countDocuments(),
    visibleCanonicalUserTurns: preSendUi.priorPromptVisible ? 1 : 0,
    visibleItineraryCards: preSendUi.itineraryCards,
    uiWelcomeVisible: preSendUi.welcomeVisible,
    destinationName: beforeTrip.parkName,
    destinationParkCode: beforeTrip.parkCode,
    composerPresent: preSendUi.composerPresent,
    composerEnabled: preSendUi.composerEnabled === true,
    guestQuotaUiAbsent: !preSendUi.freeMessageCounterVisible && !preSendUi.conversionPromptVisible,
    storedUserTurns: beforeTrip.userTurns,
    storedAssistantTurns: beforeTrip.assistantTurns,
    welcomePersisted: beforeTrip.welcomePersisted,
    atlasAbsent: preSendNetwork.atlasConnections === 0,
    port5001Absent: preSendNetwork.port5001Requests === 0,
    providerRequestsBeforeSend: backendBefore?.providerAttempts?.length ?? 0,
    capsConfigured: backendBefore?.caps ?? null,
    capProjection: backendBefore?.caps
      ? {
        requestsRemaining: backendBefore.caps.maxRequests - (backendBefore.providerAttempts?.length ?? 0),
        inputTokensRemaining: backendBefore.caps.maxInputTokens - (backendBefore.providerTotals?.inputTokens ?? 0),
        outputTokensRemaining: backendBefore.caps.maxOutputTokens - (backendBefore.providerTotals?.outputTokens ?? 0),
        costRemainingUsd: backendBefore.caps.maxCostUsd - (backendBefore.providerTotals?.costUsd ?? 0),
      }
      : null,
    preSendMountTraffic: {
      parkCatalogCalls: preSendNetwork.byClassification.loopback_acceptance_backend ?? 0,
      expectedBlocked: preSendNetwork.expectedBlocked,
      backendExternalAttempts: backendBefore?.network?.externalNetworkAttempts ?? 0,
    },
  };

  /**
   * Two §7 fields are recorded as OBSERVATIONS rather than pass conditions,
   * because the application deliberately behaves differently and neither affects
   * what this turn is testing:
   *
   *   uiWelcomeVisible — the welcome placeholder is gated on `!existingTripId`.
   *     Opening a saved trip shows the restored conversation instead, which is
   *     the right product behaviour: a "tell me a destination" greeting above an
   *     existing 3-day plan would be wrong.
   *
   *   visibleItineraryCards — restoring a trip from the DATABASE does not
   *     re-render the itinerary card. The card reads `message.itineraryPlan`,
   *     which the server strips from stored messages, so it survives only in the
   *     client's session cache. Reported as a product finding; it does not block
   *     a follow-up turn, and it makes the turn-2 reveal a clean 0→1 transition.
   */
  gate.passed = gate.authenticated
    && gate.sameUserResolved
    && gate.tripPlanCount === 1
    && gate.storedUserTurns === 1
    && gate.storedAssistantTurns === 1
    && gate.welcomePersisted === false
    && gate.destinationParkCode === 'zion'
    && gate.composerPresent
    && gate.composerEnabled
    && gate.guestQuotaUiAbsent
    && gate.visibleCanonicalUserTurns === 1
    && gate.atlasAbsent
    && gate.port5001Absent
    && gate.providerRequestsBeforeSend === 0;

  gate.specDeviationsRecorded = {
    uiWelcomeVisible: {
      required: true,
      observed: gate.uiWelcomeVisible,
      reason: 'the welcome placeholder is shown only for a new chat (!existingTripId)',
      blocking: false,
    },
    priorItineraryCardVisible: {
      observed: gate.visibleItineraryCards > 0,
      reason: 'stored messages carry no itineraryPlan, so a DB-only restore renders no card',
      blocking: false,
      classification: 'product finding, reported',
    },
  };

  await page.screenshot({ path: path.join(OUT_DIR, 'pre-send.png'), fullPage: true });
  write('pre-send-gate.json', {
    testId: TEST_ID,
    step: 'pre-send-gate',
    generatedAt: new Date().toISOString(),
    sendAuthorized: SEND,
    gate,
    turn1Identity,
    startingTrip: beforeTrip,
    ui: preSendUi,
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
    console.log(JSON.stringify({ result: 'PRE_SEND_GATE_PASSED_STOPPING', providerCostUsd: 0, gate }, null, 2));
    await cleanup();
    return;
  }

  // ── §10 the single authorized follow-up ──
  sendBoundaryIndex = requests.length;

  const composer = page.getByPlaceholder(/Ask me about your trip/i);
  await composer.waitFor({ state: 'visible', timeout: 60000 });
  await composer.click();
  await composer.fill(PROMPT);
  const typed = await page.evaluate(() => document.querySelector('textarea').value);
  if (typed !== PROMPT) throw new Error('composer content does not match the authorized prompt verbatim');

  await page.evaluate(() => window.__stage14HMarkSend());
  await composer.press('Enter');

  // ── §16 mid-flight Mongo read: after rev1 accepted, before rev2 ──
  let rev1Snapshot = null;
  const midFlightDeadline = Date.now() + 240000;
  while (Date.now() < midFlightDeadline) {
    const doc = await trips.findOne({});
    const slots = (doc?.conversation || []).filter((m) => m.role === 'assistant');
    const newSlot = slots.find((m) => m.responseId && m.responseId !== turn1Identity.response1Id);
    if (newSlot) {
      const conv = doc.conversation || [];
      rev1Snapshot = {
        evidenceClass: 'live_stage14_8I_evidence',
        capturedAtIso: new Date().toISOString(),
        tripPlanCount: await trips.countDocuments(),
        canonicalUserTurns: conv.filter((m) => m.role === 'user').length,
        canonicalAssistantTurns: slots.length,
        uiWelcomePersisted: slots.some((m) => !m.responseId),
        response1StillPresent: slots.some((m) => m.responseId === turn1Identity.response1Id),
        response2Present: true,
        response2Id: newSlot.responseId,
        response2Version: newSlot.responseVersion ?? null,
        response2Revision: newSlot.responseRevision ?? null,
        response2Lifecycle: newSlot.lifecycleStatus ?? null,
        response2ItineraryPresent: Boolean(doc.plan?.days?.length),
        response2ProseComplete: (newSlot.content || '').length > 0,
        response2ContentLength: (newSlot.content || '').length,
        tripParkName: doc.parkName ?? null,
        tripParkCode: doc.parkCode ?? null,
        planItineraryHash: doc.plan?.itineraryHash ?? null,
      };
      break;
    }
    await new Promise((r) => { setTimeout(r, 300); });
  }

  // ── wait for the terminal event, no retry ──
  const deadline = Date.now() + 300000;
  let terminal = null;
  for (;;) {
    const state = await page.evaluate(() => {
      const H = window.__stage14H;
      const types = H.sse.events.map((e) => e.type);
      return { types, done: types.includes('done'), error: types.includes('error') };
    });
    if (state.done || state.error) { terminal = state; break; }
    if (Date.now() > deadline) { terminal = { ...state, timedOut: true }; break; }
    await page.waitForTimeout(1000);
  }

  await page.waitForTimeout(14000);

  const postUi = await page.evaluate(UI_STATE_FN, PROMPT);
  const afterTrip = projectTrip(await trips.findOne({}));
  const backendAfter = await readBackendLedger();
  const requestWindowNetwork = networkSummary(sendBoundaryIndex);
  await page.screenshot({ path: path.join(OUT_DIR, 'post-completion.png'), fullPage: true });

  write('turn-evidence.json', {
    testId: TEST_ID,
    step: 'turn-2',
    generatedAt: new Date().toISOString(),
    prompt: PROMPT,
    promptSentOnce: true,
    terminal,
    turn1Identity,
    beforeTrip,
    afterTrip,
    rev1Snapshot,
    ui: postUi,
    requestWindowNetwork,
    hardFailures,
  });

  // ── §27 one ordinary refresh ──
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(14000);
  const restoreUi = await page.evaluate(UI_STATE_FN, PROMPT);
  const restoreTrip = projectTrip(await trips.findOne({}));
  await page.screenshot({ path: path.join(OUT_DIR, 'after-restore.png'), fullPage: true });

  write('restore-evidence.json', {
    testId: TEST_ID,
    step: 'restore',
    generatedAt: new Date().toISOString(),
    refreshCount: 1,
    ui: restoreUi,
    trip: restoreTrip,
  });

  const transcript = consoleLines.join('\n');
  const slices = [];
  for (let i = 0; i + 16 <= session.token.length; i += 1) {
    if (transcript.includes(session.token.slice(i, i + 16))) slices.push(i);
  }
  write('console-transcript.json', {
    testId: TEST_ID,
    lines: consoleLines.length,
    rawTokenOccurrences: transcript.split(session.token).length - 1,
    partialTokenSliceOccurrences: slices.length,
    errorsAndWarnings: consoleLines.filter((l) => /error|failed|warn/i.test(l)).slice(0, 25)
      .map((l) => l.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]').slice(0, 220)),
  });

  console.log(JSON.stringify({
    terminal: terminal?.types?.filter((t) => t !== 'chunk' && t !== 'thinking'),
    writes: (postUi.instrumentation?.writes ?? []).map((w) => ({
      method: w.method, status: w.status,
      revision: w.body?.assistantMessage?.responseRevision ?? null,
      version: w.body?.assistantMessage?.responseVersion ?? null,
    })),
    revealDeltas: postUi.instrumentation?.revealDeltas ?? null,
    rev1SnapshotCaptured: Boolean(rev1Snapshot),
    afterAssistantTurns: afterTrip?.assistantTurns,
    afterVersions: afterTrip?.responseVersionsPresent,
    providerTotals: backendAfter?.providerTotals ?? null,
    tripPlanCount: await trips.countDocuments(),
  }, null, 2));

  await cleanup();
}

main().catch(async (error) => {
  console.error('[stage14_8I] driver failed:', String(error.message));
  write('driver-error.json', { testId: TEST_ID, message: String(error.message) });
  await cleanup();
  process.exitCode = 1;
});
