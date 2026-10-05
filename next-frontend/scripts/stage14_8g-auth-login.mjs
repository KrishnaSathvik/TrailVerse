/**
 * Stage 14.8G — authenticated login/session acceptance, through the real UI.
 *
 * ZERO-PROVIDER BY CONSTRUCTION. No Trailie message is composed and none is
 * sent: the Trailie route is opened only to record its authenticated STARTING
 * state, with the composer left untouched.
 *
 * What this driver proves, in order:
 *   §4  a fresh context carries no auth and no guest state from 14.8A–F
 *   §6  login happens through the real form, submitted exactly once
 *   §7  the observed auth transport, recorded as presence + metadata only
 *   §8  a normal authenticated endpoint accepts the credential
 *   §9  the authenticated Trailie starting state, message-free
 *   §11 one ordinary refresh restores the session
 *
 * SECRET HANDLING
 *   The password is read from a runtime file (or the environment) and used for
 *   exactly one `fill()`. Playwright tracing, video and HAR capture are all
 *   DISABLED, because each would persist the typed value. Nothing this script
 *   writes contains the password, a JWT, or an Authorization header: values are
 *   reduced to presence, length and shape before they reach an artifact, and
 *   console output is redacted — the application logs its own token at info
 *   level, so verbatim capture would leak the credential into the evidence.
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

const OUT_DIR = process.env.STAGE14_8G_OUT_DIR
  || path.resolve(process.cwd(), '..', 'artifacts', 'stage14_8G-auth-login');
const MONGO_URI = process.env.MONGODB_URI
  || 'mongodb://127.0.0.1:27019/trailverse_internal_acceptance_stage14_8_auth';
const TEST_ID = 'stage14_8G-auth-login';

fs.mkdirSync(OUT_DIR, { recursive: true });

const EMAIL = process.env.STAGE14_8G_TEST_EMAIL;
const PASSWORD = process.env.STAGE14_8G_TEST_PASSWORD
  || (process.env.STAGE14_8G_SECRET_FILE
    ? fs.readFileSync(process.env.STAGE14_8G_SECRET_FILE, 'utf8')
    : null);

if (!EMAIL || !PASSWORD) {
  console.error('[stage14_8G] credential unavailable at runtime — refusing to run');
  process.exit(1);
}

const emailFingerprint = crypto.createHash('sha256').update(EMAIL).digest('hex').slice(0, 16);
const write = (name, data) =>
  fs.writeFileSync(path.join(OUT_DIR, name), `${JSON.stringify(data, null, 2)}\n`);

/**
 * Reduces any string to something safe to persist. JWTs are recognised by
 * shape rather than by comparison, so a token this run has never seen is
 * redacted too.
 */
const JWT_SHAPE = /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g;
const redact = (value) => {
  if (typeof value !== 'string') return value;
  let out = value.replace(JWT_SHAPE, '[REDACTED_JWT]');
  if (PASSWORD && out.includes(PASSWORD)) out = out.split(PASSWORD).join('[REDACTED_SECRET]');
  if (EMAIL && out.includes(EMAIL)) out = out.split(EMAIL).join('[REDACTED_EMAIL]');
  return out;
};

/** Describes a stored value without disclosing it. */
const describeValue = (value) => {
  if (value == null) return null;
  return {
    length: value.length,
    looksLikeJwt: /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value),
    containsPassword: PASSWORD ? value.includes(PASSWORD) : false,
  };
};

const openResources = { browser: null, mongo: null };
async function cleanup() {
  try { await openResources.browser?.close(); } catch { /* already closed */ }
  try { await openResources.mongo?.close(); } catch { /* already closed */ }
  openResources.browser = null;
  openResources.mongo = null;
}

/** In-page snapshot of client auth state — shapes only, never values. */
const CLIENT_STATE_FN = () => {
  const storageShape = (store) => {
    const out = {};
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      out[key] = (store.getItem(key) || '').length;
    }
    return out;
  };
  const cookieNames = document.cookie
    .split(';')
    .map((c) => c.split('=')[0].trim())
    .filter(Boolean);

  let parsedUser = null;
  try { parsedUser = JSON.parse(window.localStorage.getItem('user')); } catch { /* absent */ }

  const composer = document.querySelector('textarea');
  const bodyText = document.body.innerText || '';

  return {
    localStorageKeys: Object.keys(storageShape(window.localStorage)).sort(),
    localStorageSizes: storageShape(window.localStorage),
    sessionStorageKeys: Object.keys(storageShape(window.sessionStorage)).sort(),
    cookieNames,
    tokenRaw: window.localStorage.getItem('token'),
    sessionTokenRaw: window.sessionStorage.getItem('token'),
    authCookieRaw: (document.cookie.match(/(?:^|;\s*)trailverse_auth_token=([^;]*)/) || [])[1] || null,
    anonymousSessionPresent: window.localStorage.getItem('anonymousSession') != null,
    returnToChatPresent: window.localStorage.getItem('returnToChat') != null,
    planAiChatStatePresent: window.localStorage.getItem('planai-chat-state') != null,
    userRecord: parsedUser
      ? {
        idPresent: Boolean(parsedUser._id || parsedUser.id),
        emailPresent: Boolean(parsedUser.email),
        email: parsedUser.email || null,
        role: parsedUser.role ?? null,
        namePresent: Boolean(parsedUser.name),
      }
      : null,
    composerPresent: Boolean(composer),
    composerEnabled: composer ? !composer.disabled : null,
    composerPlaceholder: composer ? composer.placeholder : null,
    composerValueLength: composer ? composer.value.length : null,
    loginFormPresent: Boolean(
      document.querySelector('input[type="password"]')
      && document.querySelector('input[type="email"]')
    ),
    signOutAffordanceVisible: /sign out|log out/i.test(bodyText),
    freeMessageCounterVisible: /free messages? left|messages? remaining/i.test(bodyText),
    conversionPromptVisible: /sign in or create an account/i.test(bodyText),
    signInAffordanceVisible: /\bsign in\b/i.test(bodyText),
    userTurnBubbles: document.querySelectorAll('[data-role="user"]').length,
    assistantTurnBubbles: document.querySelectorAll('[data-role="assistant"]').length,
    bodyTextLength: bodyText.length,
    pathname: window.location.pathname,
  };
};

/** Strips raw credentials out of a client snapshot before it can be persisted. */
const sanitizeClientState = (raw) => {
  const {
    tokenRaw, sessionTokenRaw, authCookieRaw, userRecord, localStorageSizes, ...rest
  } = raw;
  return {
    ...rest,
    localStorageSizes,
    authCredential: {
      localStorageTokenPresent: tokenRaw != null,
      localStorageToken: describeValue(tokenRaw),
      sessionStorageTokenPresent: sessionTokenRaw != null,
      authCookiePresent: authCookieRaw != null,
      authCookie: describeValue(authCookieRaw),
      tokenMirroredToCookie: Boolean(tokenRaw && authCookieRaw && tokenRaw === authCookieRaw),
    },
    userRecord: userRecord
      ? {
        idPresent: userRecord.idPresent,
        emailPresent: userRecord.emailPresent,
        emailFingerprintMatchesFixture: userRecord.email
          ? crypto.createHash('sha256').update(userRecord.email).digest('hex').slice(0, 16)
            === emailFingerprint
          : false,
        role: userRecord.role,
        namePresent: userRecord.namePresent,
      }
      : null,
  };
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

async function main() {
  const mongo = new MongoClient(MONGO_URI);
  openResources.mongo = mongo;
  await mongo.connect();
  const db = mongo.db();

  const dbSnapshot = async () => ({
    userDocuments: await db.collection('users').countDocuments(),
    tripPlanCount: await db.collection('tripplans').countDocuments(),
    conversationCount: await db.collection('conversations').countDocuments(),
    anonymousSessionDocuments: await db.collection('anonymoussessions').countDocuments(),
    authenticatedUserTurns: 0,
    authenticatedAssistantTurns: 0,
    collections: (await db.listCollections().toArray()).map((c) => c.name).sort(),
  });

  // Trip conversations are embedded in TripPlan, so authenticated turn counts
  // are derived from those documents rather than from a messages collection.
  const turnCounts = async () => {
    const trips = await db.collection('tripplans').find({}).toArray();
    const messages = trips.flatMap((t) => t.conversation || []);
    return {
      authenticatedUserTurns: messages.filter((m) => m.role === 'user').length,
      authenticatedAssistantTurns: messages.filter((m) => m.role === 'assistant').length,
      tripPlanCount: trips.length,
      tripPlanIds: trips.map((t) => String(t._id)),
    };
  };

  const requests = [];
  const hardFailures = [];

  // Tracing, video and HAR are deliberately OFF: each would persist the typed
  // password. This is a §12 requirement, not a performance choice.
  const browser = await chromium.launch({ headless: true });
  openResources.browser = browser;
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });

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

  const consoleErrors = [];
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(redact(m.text()).slice(0, 250));
  });
  page.on('pageerror', (e) => consoleErrors.push(redact(`pageerror: ${String(e.message)}`).slice(0, 250)));

  const apiCalls = (pathSuffix, method) => requests.filter(
    (r) => r.origin === STAGE14_ACCEPTANCE_BACKEND_ORIGIN
      && r.pathname === pathSuffix
      && (!method || r.method === method)
  ).length;

  const networkSummary = () => ({
    total: requests.length,
    requestsToPort5001: requests.filter((r) => r.classification === 'unexpected_local_backend').length,
    atlasConnections: requests.filter((r) => /mongodb\.net/.test(r.origin)).length,
    anthropicHttpRequests: requests.filter((r) => /anthropic\.com/.test(r.origin)).length,
    openAiRequests: requests.filter((r) => /openai\.com/.test(r.origin)).length,
    npsRequests: requests.filter((r) => /nps\.gov/.test(r.origin)).length,
    weatherRequests: requests.filter((r) => /openweathermap|open-meteo|weather\.gov/.test(r.origin)).length,
    webSearchRequests: requests.filter((r) => /brave|serper|tavily/.test(r.origin)).length,
    unknownExternalRequests: requests.filter((r) => r.classification === 'unknown_external').length,
    expectedBlocked: requests.filter((r) => r.classification.startsWith('expected_blocked')).length,
    byClassification: requests.reduce((acc, r) => {
      acc[r.classification] = (acc[r.classification] || 0) + 1; return acc;
    }, {}),
  });

  // ── §4 pre-login state, in a context that has never held a session ──
  await page.goto(`${STAGE14_ACCEPTANCE_FRONTEND_ORIGIN}/login`, {
    waitUntil: 'domcontentloaded', timeout: 60000,
  });
  await page.waitForTimeout(4000);

  const rawPreLogin = await page.evaluate(CLIENT_STATE_FN);
  const preLoginState = sanitizeClientState(rawPreLogin);
  const preLoginDb = { ...(await dbSnapshot()), ...(await turnCounts()) };
  const backendBefore = await readBackendLedger();

  const preLoginGate = {
    // Required to be false here: a fresh context must hold no session at all.
    authenticated: preLoginState.authCredential.localStorageTokenPresent
      || preLoginState.authCredential.authCookiePresent,
    authTokenOrSessionAbsent: !preLoginState.authCredential.localStorageTokenPresent
      && !preLoginState.authCredential.sessionStorageTokenPresent
      && !preLoginState.authCredential.authCookiePresent,
    anonymousSessionAbsent: !rawPreLogin.anonymousSessionPresent
      && !rawPreLogin.returnToChatPresent,
    conversationEmpty: !rawPreLogin.planAiChatStatePresent
      && preLoginDb.tripPlanCount === 0
      && preLoginDb.authenticatedAssistantTurns === 0,
    loginFormPresent: rawPreLogin.loginFormPresent,
  };

  await page.screenshot({ path: path.join(OUT_DIR, 'pre-login.png'), fullPage: false });
  write('pre-login-state.json', {
    testId: TEST_ID,
    step: 'pre-login',
    generatedAt: new Date().toISOString(),
    gate: preLoginGate,
    clientState: preLoginState,
    database: preLoginDb,
    network: networkSummary(),
  });

  if (!preLoginGate.authTokenOrSessionAbsent || !preLoginGate.anonymousSessionAbsent) {
    write('result.json', {
      testId: TEST_ID,
      result: 'FAIL_GUEST_STATE_LEAK',
      generatedAt: new Date().toISOString(),
      preLoginGate,
    });
    await cleanup();
    process.exitCode = 2;
    return;
  }

  // ── §6 login through the real form, submitted exactly ONCE ──
  const emailField = page.locator('input[type="email"]');
  const passwordField = page.locator('input[type="password"]');
  await emailField.waitFor({ state: 'visible', timeout: 30000 });
  await emailField.fill(EMAIL);
  // The only place the credential enters the browser. `showPassword` is never
  // toggled, so no screenshot after this point can render it.
  await passwordField.fill(PASSWORD);

  const loginResponsePromise = page.waitForResponse(
    (r) => r.url().startsWith(`${STAGE14_ACCEPTANCE_BACKEND_ORIGIN}/api/auth/login`),
    { timeout: 45000 }
  );

  await page.locator('button[type="submit"]').click();

  let loginHttpStatus = null;
  let loginResponseShape = null;
  try {
    const loginResponse = await loginResponsePromise;
    loginHttpStatus = loginResponse.status();
    const body = await loginResponse.json().catch(() => null);
    loginResponseShape = body
      ? {
        success: body.success ?? null,
        tokenPresent: Boolean(body.token),
        tokenLooksLikeJwt: /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(body.token || ''),
        dataKeys: body.data ? Object.keys(body.data).sort() : null,
        role: body.data?.role ?? null,
        isEmailVerified: body.data?.isEmailVerified ?? null,
        idPresent: Boolean(body.data?._id || body.data?.id),
        emailFingerprintMatchesFixture: body.data?.email
          ? crypto.createHash('sha256').update(body.data.email).digest('hex').slice(0, 16)
            === emailFingerprint
          : false,
        error: body.error ?? null,
      }
      : null;
  } catch (error) {
    loginHttpStatus = 'no_login_response_observed';
  }

  // The app redirects to /home on success; wait for it rather than for a timer.
  let postLoginPath = null;
  try {
    await page.waitForURL((url) => new URL(url).pathname === '/home', { timeout: 30000 });
    postLoginPath = '/home';
  } catch {
    postLoginPath = new URL(page.url()).pathname;
  }
  await page.waitForTimeout(5000);

  const rawPostLogin = await page.evaluate(CLIENT_STATE_FN);
  const postLoginState = sanitizeClientState(rawPostLogin);
  const authCookieMeta = (await context.cookies()).find((c) => c.name === 'trailverse_auth_token');

  await page.screenshot({ path: path.join(OUT_DIR, 'post-login-home.png'), fullPage: false });

  // ── §8 a normal authenticated endpoint, using the app's OWN stored token ──
  const meProbe = await page.evaluate(async (backend) => {
    const token = window.localStorage.getItem('token');
    if (!token) return { attempted: false };
    const response = await fetch(`${backend}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.json().catch(() => null);
    return {
      attempted: true,
      status: response.status,
      success: body?.success ?? null,
      email: body?.data?.email ?? null,
      idPresent: Boolean(body?.data?._id || body?.data?.id),
      role: body?.data?.role ?? null,
      keys: body?.data ? Object.keys(body.data).sort() : null,
    };
  }, STAGE14_ACCEPTANCE_BACKEND_ORIGIN);

  const meProbeEvidence = {
    attempted: meProbe.attempted,
    status: meProbe.status ?? null,
    success: meProbe.success ?? null,
    authenticatedEndpointAccepted: meProbe.status === 200,
    idPresent: meProbe.idPresent ?? false,
    role: meProbe.role ?? null,
    responseKeys: meProbe.keys ?? null,
    resolvedUserMatchesLocalTestUser: meProbe.email
      ? crypto.createHash('sha256').update(meProbe.email).digest('hex').slice(0, 16) === emailFingerprint
      : false,
  };

  const postLoginDb = { ...(await dbSnapshot()), ...(await turnCounts()) };

  write('login-result.json', {
    testId: TEST_ID,
    step: 'login',
    generatedAt: new Date().toISOString(),
    loginUiSubmittedOnce: true,
    submitClicks: 1,
    loginEndpointCallsObservedInBrowser: apiCalls('/api/auth/login', 'POST'),
    loginHttpStatus,
    loginSucceeded: loginHttpStatus === 200,
    loginResponseShape,
    postLoginPath,
    authTransport: {
      mechanism: 'jwt_bearer_authorization_header',
      tokenIssuedBy: 'POST /api/auth/login',
      clientPersistence: ['localStorage.token', 'localStorage.user', 'document.cookie'],
      cookieName: 'trailverse_auth_token',
      cookieHttpOnly: authCookieMeta?.httpOnly ?? null,
      cookieSameSite: authCookieMeta?.sameSite ?? null,
      cookieSessionOnly: authCookieMeta ? authCookieMeta.expires === -1 : null,
      cookiePath: authCookieMeta?.path ?? null,
      cookieValueRecorded: false,
    },
    clientState: postLoginState,
    authenticatedEndpointProof: meProbeEvidence,
    database: postLoginDb,
    network: networkSummary(),
    consoleErrors,
  });

  // ── §9 authenticated Trailie starting state — NO message is sent ──
  await page.goto(`${STAGE14_ACCEPTANCE_FRONTEND_ORIGIN}/plan-ai`, {
    waitUntil: 'domcontentloaded', timeout: 60000,
  });
  await page.waitForTimeout(9000);

  const rawTrailie = await page.evaluate(CLIENT_STATE_FN);
  const trailieState = sanitizeClientState(rawTrailie);
  const trailieDb = { ...(await dbSnapshot()), ...(await turnCounts()) };
  await page.screenshot({ path: path.join(OUT_DIR, 'trailie-authenticated-start.png'), fullPage: false });

  write('trailie-starting-state.json', {
    testId: TEST_ID,
    step: 'trailie-start',
    generatedAt: new Date().toISOString(),
    messageSent: false,
    composerValueLength: rawTrailie.composerValueLength,
    authenticated: trailieState.authCredential.localStorageTokenPresent,
    userConversationStartingStateKnown: true,
    anonymousFreeMessageCounterVisible: rawTrailie.freeMessageCounterVisible,
    anonymousConversionPromptVisible: rawTrailie.conversionPromptVisible,
    composerPresent: rawTrailie.composerPresent,
    composerEnabled: rawTrailie.composerEnabled,
    composerPlaceholder: rawTrailie.composerPlaceholder,
    trailieTurnsVisible: {
      userTurnBubbles: rawTrailie.userTurnBubbles,
      assistantTurnBubbles: rawTrailie.assistantTurnBubbles,
    },
    blankTripShellCreatedOnNavigation: trailieDb.tripPlanCount > postLoginDb.tripPlanCount,
    tripPlanCountBeforeNavigation: postLoginDb.tripPlanCount,
    tripPlanCountAfterNavigation: trailieDb.tripPlanCount,
    tripCreateCalls: apiCalls('/api/trips', 'POST'),
    clientState: trailieState,
    database: trailieDb,
    network: networkSummary(),
  });

  // ── §10 persistence baseline, read directly from Mongo before any message ──
  const baseline = { ...(await dbSnapshot()), ...(await turnCounts()) };
  const users = await mongo.db().collection('users')
    .find({}, { projection: { _id: 1, role: 1, isEmailVerified: 1, createdAt: 1 } }).toArray();
  const baselineHash = crypto.createHash('sha256')
    .update(JSON.stringify({
      userDocuments: baseline.userDocuments,
      tripPlanCount: baseline.tripPlanCount,
      tripPlanIds: baseline.tripPlanIds,
      authenticatedUserTurns: baseline.authenticatedUserTurns,
      authenticatedAssistantTurns: baseline.authenticatedAssistantTurns,
    }))
    .digest('hex');

  write('persistence-baseline.json', {
    testId: TEST_ID,
    step: 'persistence-baseline',
    generatedAt: new Date().toISOString(),
    mongoUri: MONGO_URI,
    userDocuments: baseline.userDocuments,
    authenticatedUserTurns: baseline.authenticatedUserTurns,
    authenticatedAssistantTurns: baseline.authenticatedAssistantTurns,
    tripPlanCount: baseline.tripPlanCount,
    conversationCount: baseline.conversationCount,
    anonymousSessionDocuments: baseline.anonymousSessionDocuments,
    collections: baseline.collections,
    // Identities and flags only — no email, no password, no token.
    userDocumentSummary: users.map((u) => ({
      idPresent: Boolean(u._id),
      role: u.role,
      isEmailVerified: u.isEmailVerified,
      createdAtPresent: Boolean(u.createdAt),
    })),
    beforeStateHash: baselineHash,
    beforeStateHashInputs: [
      'userDocuments', 'tripPlanCount', 'tripPlanIds',
      'authenticatedUserTurns', 'authenticatedAssistantTurns',
    ],
  });

  // ── §11 exactly one ordinary refresh, no logout ──
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(9000);

  const rawAfterRefresh = await page.evaluate(CLIENT_STATE_FN);
  const afterRefreshState = sanitizeClientState(rawAfterRefresh);
  await page.screenshot({ path: path.join(OUT_DIR, 'after-refresh.png'), fullPage: false });

  const refreshDb = { ...(await dbSnapshot()), ...(await turnCounts()) };
  const backendAfter = await readBackendLedger();

  write('session-restore.json', {
    testId: TEST_ID,
    step: 'session-restore',
    generatedAt: new Date().toISOString(),
    refreshCount: 1,
    loggedOut: false,
    stillAuthenticatedAfterRefresh: afterRefreshState.authCredential.localStorageTokenPresent,
    sameUserResolved: afterRefreshState.userRecord?.emailFingerprintMatchesFixture === true,
    loginFormNotShownAgain: !rawAfterRefresh.loginFormPresent,
    composerEnabled: rawAfterRefresh.composerEnabled,
    guestQuotaUiAbsent: !rawAfterRefresh.freeMessageCounterVisible
      && !rawAfterRefresh.conversionPromptVisible,
    meEndpointCallsAfterRefresh: apiCalls('/api/auth/me', 'GET'),
    clientState: afterRefreshState,
    databaseUnchangedAfterRefresh:
      refreshDb.tripPlanCount === baseline.tripPlanCount
      && refreshDb.authenticatedAssistantTurns === baseline.authenticatedAssistantTurns,
    database: refreshDb,
  });

  write('network-ledger.json', {
    testId: TEST_ID,
    generatedAt: new Date().toISOString(),
    policy: 'deny_by_default; loopback frontend + loopback acceptance backend only; no provider authorized',
    frontendOrigin: STAGE14_ACCEPTANCE_FRONTEND_ORIGIN,
    backendOrigin: STAGE14_ACCEPTANCE_BACKEND_ORIGIN,
    summary: networkSummary(),
    hardFailures,
    backendLedgerBefore: backendBefore?.network ?? null,
    backendLedgerAfter: backendAfter?.network ?? null,
    backendProviderBoundary: backendAfter?.providerBoundary ?? null,
    backendAuthSummary: backendAfter?.authSummary ?? null,
    backendProviderConstructorCounts: backendAfter?.providerConstructorCounts ?? null,
    apiCallCounts: {
      login: apiCalls('/api/auth/login', 'POST'),
      me: apiCalls('/api/auth/me', 'GET'),
      signup: apiCalls('/api/auth/signup', 'POST'),
      migrateChat: apiCalls('/api/auth/migrate-chat', 'POST'),
      logout: apiCalls('/api/auth/logout', 'POST'),
      chatStream: apiCalls('/api/ai/chat-stream', 'POST'),
      chatAnonymousStream: apiCalls('/api/ai/chat-anonymous-stream', 'POST'),
    },
    consoleErrors,
  });

  await cleanup();
  console.log('[stage14_8G] driver complete');
}

main().catch(async (error) => {
  console.error('[stage14_8G] driver failed:', redact(error.message));
  write('driver-error.json', {
    testId: TEST_ID,
    generatedAt: new Date().toISOString(),
    message: redact(error.message),
  });
  await cleanup();
  process.exitCode = 1;
});
