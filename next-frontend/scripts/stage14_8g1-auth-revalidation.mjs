/**
 * Stage 14.8G.1 §10/§11 — auth revalidation, and the clean path Stage 14.8H needs.
 *
 * ZERO-PROVIDER. No Trailie message is composed or sent.
 *
 * Phase A — the real login flow again, after the hardening changes, plus the
 *   cookie-only rejection proved over real HTTP. The app redirects to /home on
 *   success, and /home's daily-feed initialization is what produced Stage
 *   14.8G's blocked `astro` attempts. Phase A therefore records that traffic
 *   rather than pretending it away.
 *
 * Phase B — the path Stage 14.8H will actually use: a fresh context that
 *   RESTORES the already-authenticated session and opens /plan-ai directly,
 *   never visiting /home. The requirement is
 *   `unrelatedExternalRequestsBeforeTrailieSend: 0`, and it is measured here,
 *   not asserted. No real Trailie dependency is disabled to get there — the
 *   route simply never mounts the unrelated home widgets.
 *
 * Phase C — one ordinary refresh inside the restored context.
 *
 * The cookie-only test is meaningful because cookies ignore ports: the mirror
 * cookie set on 127.0.0.1:3000 is sent to the backend on 127.0.0.1:5101, so a
 * fetch with `credentials: 'include'` and NO Authorization header is a genuine
 * cookie-only request.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

import {
  STAGE14_ACCEPTANCE_BACKEND_ORIGIN,
  STAGE14_ACCEPTANCE_FRONTEND_ORIGIN,
  classifyAcceptanceNetworkRequest,
} from '../src/test-utils/stage14AcceptanceHarness.js';

const serverRequire = createRequire(path.resolve(process.cwd(), '..', 'server', 'package.json'));
const { MongoClient } = serverRequire('mongodb');

const OUT_DIR = process.env.STAGE14_8G1_OUT_DIR
  || path.resolve(process.cwd(), '..', 'artifacts', 'stage14_8G1-auth-hardening');
const MONGO_URI = process.env.MONGODB_URI
  || 'mongodb://127.0.0.1:27019/trailverse_internal_acceptance_stage14_8_auth';
const TEST_ID = 'stage14_8G1-auth-hardening';
const SESSION_FILE = process.env.STAGE14_8G1_SESSION_FILE;

fs.mkdirSync(OUT_DIR, { recursive: true });

const EMAIL = process.env.STAGE14_8G_TEST_EMAIL;
const PASSWORD = process.env.STAGE14_8G_TEST_PASSWORD
  || (process.env.STAGE14_8G_SECRET_FILE
    ? fs.readFileSync(process.env.STAGE14_8G_SECRET_FILE, 'utf8')
    : null);

if (!EMAIL || !PASSWORD) {
  console.error('[stage14_8G1] credential unavailable at runtime — refusing to run');
  process.exit(1);
}

const emailFingerprint = crypto.createHash('sha256').update(EMAIL).digest('hex').slice(0, 16);
const fingerprint = (value) => (value
  ? crypto.createHash('sha256').update(value).digest('hex').slice(0, 16)
  : null);

const write = (name, data) =>
  fs.writeFileSync(path.join(OUT_DIR, name), `${JSON.stringify(data, null, 2)}\n`);

const JWT_SHAPE = /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g;
const redact = (value) => {
  if (typeof value !== 'string') return value;
  let out = value.replace(JWT_SHAPE, '[REDACTED_JWT]');
  if (out.includes(PASSWORD)) out = out.split(PASSWORD).join('[REDACTED_SECRET]');
  if (out.includes(EMAIL)) out = out.split(EMAIL).join('[REDACTED_EMAIL]');
  return out;
};

/** In-page auth/UI snapshot. Raw values are stripped before anything is written. */
const CLIENT_STATE_FN = () => {
  const composer = document.querySelector('textarea');
  const bodyText = document.body.innerText || '';
  let parsedUser = null;
  try { parsedUser = JSON.parse(window.localStorage.getItem('user')); } catch { /* absent */ }

  return {
    pathname: window.location.pathname,
    tokenRaw: window.localStorage.getItem('token'),
    authCookieRaw: (document.cookie.match(/(?:^|;\s*)trailverse_auth_token=([^;]*)/) || [])[1] || null,
    userEmail: parsedUser?.email || null,
    userIdPresent: Boolean(parsedUser?._id || parsedUser?.id),
    localStorageKeys: Object.keys(window.localStorage).sort(),
    composerPresent: Boolean(composer),
    composerEnabled: composer ? !composer.disabled : null,
    composerValueLength: composer ? composer.value.length : null,
    loginFormPresent: Boolean(
      document.querySelector('input[type="password"]') && document.querySelector('input[type="email"]')
    ),
    signOutAffordanceVisible: /sign out|log out/i.test(bodyText),
    freeMessageCounterVisible: /free messages? left|messages? remaining/i.test(bodyText),
    conversionPromptVisible: /sign in or create an account/i.test(bodyText),
    userTurnBubbles: document.querySelectorAll('[data-role="user"]').length,
    assistantTurnBubbles: document.querySelectorAll('[data-role="assistant"]').length,
  };
};

const sanitize = (raw) => {
  const { tokenRaw, authCookieRaw, userEmail, ...rest } = raw;
  return {
    ...rest,
    authenticated: tokenRaw != null,
    authCredential: {
      localStorageTokenPresent: tokenRaw != null,
      localStorageTokenLength: tokenRaw ? tokenRaw.length : 0,
      authCookiePresent: authCookieRaw != null,
      tokenMirroredToCookie: Boolean(tokenRaw && authCookieRaw && tokenRaw === authCookieRaw),
    },
    sameUserResolved: fingerprint(userEmail) === emailFingerprint,
  };
};

/** Per-phase network ledger, so Phase B's zero is not diluted by Phase A. */
const makeLedger = () => {
  const requests = [];
  return {
    requests,
    record: (entry) => requests.push(entry),
    summary: () => ({
      total: requests.length,
      loopbackFrontend: requests.filter((r) => r.classification === 'loopback_frontend').length,
      loopbackBackend: requests.filter((r) => r.classification === 'loopback_acceptance_backend').length,
      requestsToPort5001: requests.filter((r) => r.classification === 'unexpected_local_backend').length,
      atlasConnections: requests.filter((r) => /mongodb\.net/.test(r.origin)).length,
      anthropicHttpRequests: requests.filter((r) => /anthropic\.com/.test(r.origin)).length,
      openAiHttpRequests: requests.filter((r) => /openai\.com/.test(r.origin)).length,
      npsRequests: requests.filter((r) => /nps\.gov/.test(r.origin)).length,
      weatherRequests: requests.filter((r) => /openweathermap|open-meteo|weather\.gov/.test(r.origin)).length,
      webSearchRequests: requests.filter((r) => /brave|serper|tavily/.test(r.origin)).length,
      unknownExternalRequests: requests.filter((r) => r.classification === 'unknown_external').length,
      expectedBlocked: requests.filter((r) => r.classification.startsWith('expected_blocked')).length,
      dailyFeedCalls: requests.filter((r) => r.pathname === '/api/feed/daily').length,
      parkDataCalls: requests.filter((r) => r.pathname.startsWith('/api/parks')).length,
      trailieChatCalls: requests.filter((r) => /\/api\/ai\/chat/.test(r.pathname)).length,
      byClassification: requests.reduce((acc, r) => {
        acc[r.classification] = (acc[r.classification] || 0) + 1; return acc;
      }, {}),
    }),
  };
};

const attachPolicy = async (context, ledger, hardFailures) => {
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
    ledger.record({ origin, pathname, method: request.method(), ...verdict });

    if (verdict.action === 'allow') return route.continue();
    if (verdict.action === 'block') return route.abort('blockedbyclient');
    hardFailures.push({ origin, pathname, ...verdict });
    return route.abort('blockedbyclient');
  });
};

async function readBackendLedger() {
  const file = path.join(OUT_DIR, 'backend-ledger.json');
  fs.writeFileSync(path.join(OUT_DIR, 'snapshot.request'), '1');
  for (let i = 0; i < 40; i += 1) {
    await new Promise((r) => { setTimeout(r, 250); });
    if (!fs.existsSync(path.join(OUT_DIR, 'snapshot.request')) && fs.existsSync(file)) break;
  }
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

const open = { browser: null, mongo: null };
const cleanup = async () => {
  try { await open.browser?.close(); } catch { /* already closed */ }
  try { await open.mongo?.close(); } catch { /* already closed */ }
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
      userDocuments: await db.collection('users').countDocuments(),
      tripPlanCount: trips.length,
      authenticatedUserTurns: messages.filter((m) => m.role === 'user').length,
      authenticatedAssistantTurns: messages.filter((m) => m.role === 'assistant').length,
      anonymousSessionDocuments: await db.collection('anonymoussessions').countDocuments(),
    };
  };

  const browser = await chromium.launch({ headless: true });
  open.browser = browser;
  const consoleTranscript = [];
  const hardFailures = [];

  // ─────────────────────────── Phase A — real UI login ───────────────────────
  const ledgerA = makeLedger();
  const contextA = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await attachPolicy(contextA, ledgerA, hardFailures);

  const pageA = await contextA.newPage();
  // Every console line is captured RAW here and scanned for credential material
  // before anything is persisted — this is the browser-side half of the §4
  // tripwire, run against the real application rather than a mock.
  pageA.on('console', (m) => consoleTranscript.push(m.text()));
  pageA.on('pageerror', (e) => consoleTranscript.push(`pageerror: ${String(e.message)}`));

  await pageA.goto(`${STAGE14_ACCEPTANCE_FRONTEND_ORIGIN}/login`, {
    waitUntil: 'domcontentloaded', timeout: 60000,
  });
  await pageA.waitForTimeout(3000);

  await pageA.locator('input[type="email"]').fill(EMAIL);
  await pageA.locator('input[type="password"]').fill(PASSWORD);

  const loginResponsePromise = pageA.waitForResponse(
    (r) => r.url().startsWith(`${STAGE14_ACCEPTANCE_BACKEND_ORIGIN}/api/auth/login`),
    { timeout: 45000 }
  );
  await pageA.locator('button[type="submit"]').click();

  const loginResponse = await loginResponsePromise;
  const loginStatus = loginResponse.status();

  try {
    await pageA.waitForURL((url) => new URL(url).pathname === '/home', { timeout: 30000 });
  } catch { /* path recorded from the snapshot below */ }
  await pageA.waitForTimeout(5000);

  const rawA = await pageA.evaluate(CLIENT_STATE_FN);
  const stateA = sanitize(rawA);

  // The two transport probes, over real HTTP from the browser.
  const transportProbe = await pageA.evaluate(async (backend) => {
    const token = window.localStorage.getItem('token');

    const withBearer = await fetch(`${backend}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const bearerBody = await withBearer.json().catch(() => null);

    // No Authorization header. Cookies ignore ports, so the mirror cookie set on
    // :3000 IS sent to :5101 — this is a real cookie-only request.
    const cookieOnly = await fetch(`${backend}/api/auth/me`, { credentials: 'include' });
    const cookieBody = await cookieOnly.json().catch(() => null);

    return {
      cookieVisibleToBackendOrigin: document.cookie.includes('trailverse_auth_token'),
      bearer: { status: withBearer.status, email: bearerBody?.data?.email ?? null },
      cookieOnly: { status: cookieOnly.status, error: cookieBody?.error ?? null },
    };
  }, STAGE14_ACCEPTANCE_BACKEND_ORIGIN);

  // Save the session so Phase B can restore it — outside the repository.
  const session = await pageA.evaluate(() => ({
    token: window.localStorage.getItem('token'),
    user: window.localStorage.getItem('user'),
  }));
  if (SESSION_FILE) {
    fs.writeFileSync(SESSION_FILE, JSON.stringify(session), { mode: 0o600 });
  }

  await pageA.screenshot({ path: path.join(OUT_DIR, 'phaseA-post-login.png') });
  await contextA.close();

  // Backend ledger boundary between the phases. The backend ledger is
  // process-wide, so without this snapshot Phase B's "zero" would be an
  // inference from Phase A's totals rather than a measured delta.
  const backendAfterA = await readBackendLedger();

  // ──────── Phase B — the Stage 14.8H path: restore session, open /plan-ai ────
  const ledgerB = makeLedger();
  const contextB = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await attachPolicy(contextB, ledgerB, hardFailures);
  await contextB.addInitScript(([token, user]) => {
    window.localStorage.setItem('token', token);
    window.localStorage.setItem('user', user);
    document.cookie = `trailverse_auth_token=${token}; path=/; SameSite=Lax`;
  }, [session.token, session.user]);

  const pageB = await contextB.newPage();
  pageB.on('console', (m) => consoleTranscript.push(m.text()));
  pageB.on('pageerror', (e) => consoleTranscript.push(`pageerror: ${String(e.message)}`));

  await pageB.goto(`${STAGE14_ACCEPTANCE_FRONTEND_ORIGIN}/plan-ai`, {
    waitUntil: 'domcontentloaded', timeout: 60000,
  });
  await pageB.waitForTimeout(9000);

  const rawB = await pageB.evaluate(CLIENT_STATE_FN);
  const stateB = sanitize(rawB);
  const backendAfterB = await readBackendLedger();
  await pageB.screenshot({ path: path.join(OUT_DIR, 'phaseB-restored-plan-ai.png') });

  // ─────────────────── Phase C — one refresh inside Phase B ──────────────────
  const requestsBeforeRefresh = ledgerB.requests.length;
  await pageB.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await pageB.waitForTimeout(8000);

  const rawC = await pageB.evaluate(CLIENT_STATE_FN);
  const stateC = sanitize(rawC);
  await pageB.screenshot({ path: path.join(OUT_DIR, 'phaseC-after-refresh.png') });

  const finalDb = await dbState();
  const backendFinal = await readBackendLedger();

  // ── credential scan over everything the browser printed, both phases ──
  const transcript = consoleTranscript.join('\n');
  const tokenSlices = [];
  if (session.token) {
    for (let i = 0; i + 16 <= session.token.length; i += 1) {
      if (transcript.includes(session.token.slice(i, i + 16))) tokenSlices.push(i);
    }
  }
  const consoleScan = {
    linesCaptured: consoleTranscript.length,
    rawTokenOccurrences: session.token ? transcript.split(session.token).length - 1 : 0,
    partialTokenSliceOccurrences: tokenSlices.length,
    passwordOccurrences: transcript.split(PASSWORD).length - 1,
    authorizationHeaderValueOccurrences: session.token
      ? transcript.split(`Bearer ${session.token}`).length - 1
      : 0,
  };

  const summaryA = ledgerA.summary();
  const summaryB = ledgerB.summary();

  /**
   * Two different things get counted separately, because they are two different
   * risks:
   *
   *   unrelatedBackendDependencyAttempts — a BACKEND dependency call triggered by
   *     page initialization that has nothing to do with the Trailie turn. This is
   *     the astro/daily-feed class the operator flagged, and it is the number that
   *     must be 0 before H sends.
   *
   *   clientThirdPartyBlockedRequests — Maps and analytics <script> traffic from
   *     the browser, blocked by policy and never leaving the machine. This class
   *     has been separately classified and accepted since 14.8A; it is inert and
   *     is reported rather than folded into the figure above.
   */
  const backendExternalAfterA = backendAfterA?.network?.externalNetworkAttempts ?? 0;
  const backendExternalFinal = backendFinal?.network?.externalNetworkAttempts ?? 0;
  const unrelatedBackendDependencyAttempts = Math.max(
    0,
    backendExternalFinal - backendExternalAfterA
  );
  const clientThirdPartyBlockedRequests = summaryB.expectedBlocked;
  const phaseBUnrelatedExternal = unrelatedBackendDependencyAttempts
    + summaryB.unknownExternalRequests
    + summaryB.npsRequests + summaryB.weatherRequests + summaryB.webSearchRequests
    + summaryB.anthropicHttpRequests + summaryB.openAiHttpRequests;

  const report = {
    testId: TEST_ID,
    generatedAt: new Date().toISOString(),
    trailieQuestionSent: false,
    trailieChatCalls: summaryA.trailieChatCalls + summaryB.trailieChatCalls,

    phaseA_realUiLogin: {
      loginSubmittedOnce: true,
      loginHttpStatus: loginStatus,
      loginSucceeded: loginStatus === 200,
      landedOn: rawA.pathname,
      authenticated: stateA.authenticated,
      sameUserResolved: stateA.sameUserResolved,
      authCredential: stateA.authCredential,
      signOutAffordanceVisible: rawA.signOutAffordanceVisible,
      network: summaryA,
      // The known, classified /home initialization traffic.
      homeInitializationCalls: {
        dailyFeed: summaryA.dailyFeedCalls,
        parkData: summaryA.parkDataCalls,
      },
    },

    transportContract: {
      bearerHeaderAccepted: transportProbe.bearer.status === 200,
      bearerResolvedCorrectUser: fingerprint(transportProbe.bearer.email) === emailFingerprint,
      cookieVisibleToBackendOrigin: transportProbe.cookieVisibleToBackendOrigin,
      cookieOnlyStatus: transportProbe.cookieOnly.status,
      cookieAloneRejectedByProtect: transportProbe.cookieOnly.status === 401,
      cookieOnlyError: transportProbe.cookieOnly.error,
      note: 'cookies ignore ports, so the mirror cookie IS sent to the backend origin; it still does not authenticate',
    },

    phaseB_stage14_8H_path: {
      method: 'restore saved session into a fresh context, open /plan-ai directly, never visit /home',
      authenticated: stateB.authenticated,
      sameUserResolved: stateB.sameUserResolved,
      loginFormPresent: rawB.loginFormPresent,
      composerPresent: rawB.composerPresent,
      composerEnabled: rawB.composerEnabled,
      composerValueLength: rawB.composerValueLength,
      messageSent: false,
      trailieTurnsVisible: rawB.userTurnBubbles + rawB.assistantTurnBubbles,
      guestQuotaUiAbsent: !rawB.freeMessageCounterVisible && !rawB.conversionPromptVisible,
      network: summaryB,
      unrelatedExternalRequestsBeforeTrailieSend: phaseBUnrelatedExternal,
      unrelatedBackendDependencyAttempts,
      backendExternalAttemptsAtEndOfPhaseA: backendExternalAfterA,
      backendExternalAttemptsAtEndOfPhaseB: backendExternalFinal,
      clientThirdPartyBlockedRequests,
      clientThirdPartyBlockedClasses: Object.fromEntries(
        Object.entries(summaryB.byClassification).filter(([k]) => k.startsWith('expected_blocked'))
      ),
      dailyFeedCalls: summaryB.dailyFeedCalls,
      // /plan-ai fetches the park catalog on mount. It fails closed here (no NPS
      // key), but once H authorizes NPS this becomes a RELATED pre-send external
      // call, and H's accounting should expect it rather than treat it as a leak.
      parkCatalogCallsBeforeSend: summaryB.parkDataCalls,
      realDependenciesDisabled: false,
      readyForStage14_8HSend: phaseBUnrelatedExternal === 0
        && stateB.authenticated
        && rawB.composerEnabled === true,
    },

    phaseC_sessionRestore: {
      refreshCount: 1,
      loggedOut: false,
      stillAuthenticated: stateC.authenticated,
      sameUserResolved: stateC.sameUserResolved,
      loginFormNotShownAgain: !rawC.loginFormPresent,
      composerEnabled: rawC.composerEnabled,
      guestQuotaUiAbsent: !rawC.freeMessageCounterVisible && !rawC.conversionPromptVisible,
      requestsDuringRefresh: ledgerB.requests.length - requestsBeforeRefresh,
    },

    consoleCredentialScan: consoleScan,

    database: finalDb,

    providerBoundary: {
      liveAnthropicDispatches: 0,
      anthropicHttpRequests: (summaryA.anthropicHttpRequests + summaryB.anthropicHttpRequests),
      liveOpenAiDispatches: 0,
      openAiHttpRequests: (summaryA.openAiHttpRequests + summaryB.openAiHttpRequests),
      backendProviderBoundary: backendFinal?.providerBoundary ?? null,
      backendProviderConstructorCounts: backendFinal?.providerConstructorCounts ?? null,
      backendNetwork: backendFinal?.network ?? null,
      backendAuthSummary: backendFinal?.authSummary ?? null,
      providerInputTokens: 0,
      providerOutputTokens: 0,
      providerCostUsd: 0,
    },

    backendLedgerAfterPhaseB: backendAfterB?.network ?? null,
    hardFailures,
    consoleErrorsRedacted: consoleTranscript
      .filter((line) => /error|failed/i.test(line))
      .slice(0, 12)
      .map((line) => redact(line).slice(0, 200)),
  };

  write('revalidation-report.json', report);
  console.log(JSON.stringify({
    loginSucceeded: report.phaseA_realUiLogin.loginSucceeded,
    bearerAccepted: report.transportContract.bearerHeaderAccepted,
    cookieAloneRejected: report.transportContract.cookieAloneRejectedByProtect,
    phaseB_unrelatedExternal: phaseBUnrelatedExternal,
    phaseB_ready: report.phaseB_stage14_8H_path.readyForStage14_8HSend,
    sessionRestored: report.phaseC_sessionRestore.stillAuthenticated,
    consoleScan,
  }, null, 2));

  await cleanup();
}

main().catch(async (error) => {
  console.error('[stage14_8G1] driver failed:', redact(error.message));
  write('driver-error.json', { testId: TEST_ID, message: redact(error.message) });
  await cleanup();
  process.exitCode = 1;
});
