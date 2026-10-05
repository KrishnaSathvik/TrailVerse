'use strict';

/**
 * Stage 14.8G — authenticated login/session acceptance preload.
 *
 * Loaded with `node -r` BEFORE the app, so the outbound-network guard is
 * installed before any application, route, provider, NPS, weather, image or
 * search module can be imported.
 *
 * Network policy for this run — DENY BY DEFAULT, with NO provider allowance:
 *   127.0.0.1:<acceptance mongo>  → allowed (isolated auth acceptance database)
 *   127.0.0.1:<own listener>      → allowed
 *   everything else               → blocked and recorded, api.anthropic.com
 *                                   INCLUDED. This stage is zero-provider, so
 *                                   `liveClaudeAllowed` is false: a dispatch
 *                                   cannot leave the process even if some code
 *                                   path tried, and the attempt is recorded.
 *
 * ANTHROPIC_API_KEY is deliberately left PRESENT. Stage 14.8F established that
 * the Anthropic client is constructed once at module load exactly as in
 * production; booting without the key would make this run less representative
 * of the real application. The zero-provider property is enforced at the
 * TRANSPORT (guard) rather than by removing configuration, which is the
 * stronger of the two guarantees: construction is counted, dispatch is refused.
 *
 * Diagnostics discipline: this bootstrap records counts and destination classes
 * only. It never records an email, a password, a JWT, an Authorization header or
 * a request body.
 */

const fs = require('fs');
const path = require('path');

const OUT_DIR = process.env.STAGE14_8G_OUT_DIR
  || path.resolve(__dirname, '..', '..', 'artifacts', 'stage14_8G-auth-login');
fs.mkdirSync(OUT_DIR, { recursive: true });

const TEST_ID = 'stage14_8G-auth-login';

// ---------------------------------------------------------------------------
// 1. Outbound network guard — installed first, before anything else loads.
// ---------------------------------------------------------------------------
const { installOutboundNetworkGuard } = require('../src/eval/bootstrap/outboundNetworkGuard');

const acceptanceMongoPort = (() => {
  const match = /^mongodb:\/\/127\.0\.0\.1:(\d+)\//.exec(process.env.MONGODB_URI || '');
  return match ? Number(match[1]) : null;
})();

if (acceptanceMongoPort == null) {
  console.error('[stage14_8G] refusing to install: MONGODB_URI is not an isolated loopback database');
  process.exit(1);
}

const guard = installOutboundNetworkGuard({
  // §5 — Claude is NOT authorized in this stage.
  liveClaudeAllowed: false,
  allowedHttpPorts: [Number(process.env.PORT) || 5101, acceptanceMongoPort],
});

// ---------------------------------------------------------------------------
// 2. Provider constructor counters.
//
// §13 allows a client constructed at application startup to be recorded
// separately, provided request-attributable dispatch stays zero. Counting
// construction independently of dispatch is what makes that distinction
// provable rather than asserted.
// ---------------------------------------------------------------------------
const providerConstructorCounts = { claude: 0, openai: 0 };

function countConstructions(moduleId, key) {
  let mod;
  try { mod = require(moduleId); } catch { return; }
  const Original = mod && (mod.default || mod);
  if (typeof Original !== 'function') return;

  const countingConstruct = (target) => new Proxy(target, {
    construct(t, args, newTarget) {
      providerConstructorCounts[key] += 1;
      return Reflect.construct(t, args, newTarget);
    },
  });

  const resolved = require.resolve(moduleId);
  if (!require.cache[resolved]) return;

  require.cache[resolved].exports = new Proxy(mod, {
    construct(target, args, newTarget) {
      providerConstructorCounts[key] += 1;
      return Reflect.construct(Original, args, newTarget);
    },
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      return (prop === 'default' && typeof value === 'function')
        ? countingConstruct(value)
        : value;
    },
  });
}

countConstructions('@anthropic-ai/sdk', 'claude');
countConstructions('openai', 'openai');

// ---------------------------------------------------------------------------
// 3. Provider dispatch tripwire.
//
// The guard refuses the transport, but a refusal only proves containment if we
// can also say whether anything TRIED. Every attempt at a provider host is
// counted here, at the fetch boundary, independent of the guard's own ledger.
// ---------------------------------------------------------------------------
let currentPhase = 'import';
const providerDispatchAttempts = [];
const guardedFetch = global.fetch;

global.fetch = function stage14_8gCountingFetch(input, init) {
  const url = typeof input === 'string' ? input : (input?.url || String(input));
  if (/^https:\/\/api\.(anthropic|openai)\.com\//.test(url)) {
    providerDispatchAttempts.push({
      at: new Date().toISOString(),
      provider: url.includes('anthropic') ? 'claude' : 'openai',
      phase: currentPhase,
    });
  }
  return guardedFetch.call(this, input, init);
};

// ---------------------------------------------------------------------------
// 4. Authenticated-route observation — counts and outcomes only.
//
// §6 needs `loginEndpointCalls: 1` and §8 needs proof the authenticated
// endpoint accepted the credential. Both are observed server-side here so the
// evidence does not depend on the browser's view alone. The credential itself
// is never touched: only presence, transport and status are recorded.
// ---------------------------------------------------------------------------
const authObservations = [];

/**
 * Installed as the FIRST layer of the Express stack.
 *
 * The obvious placement — a listener on the HTTP server's `request` event — was
 * tried first and is not trustworthy here: with socket.io attached, it observed
 * POSTs but silently missed every GET, which is exactly the shape of evidence
 * that lies by omission (`/api/auth/me` would have reported zero calls while
 * the server was answering them 200). Appending middleware after the routes are
 * mounted is no better, since a matched route never calls next().
 *
 * Splicing the layer to the front of the stack is what actually holds: every
 * request of every method passes through it before routing.
 */
function installAuthObserver(app) {
  const router = app && (app._router || app.router);
  if (!router || !Array.isArray(router.stack)) return false;

  app.use((req, res, next) => {
    const pathOnly = String(req.originalUrl || req.url || '').split('?')[0];
    if (!pathOnly.startsWith('/api/auth') && !pathOnly.startsWith('/api/trips')) return next();

    const authHeader = req.headers.authorization || '';
    const observation = {
      at: new Date().toISOString(),
      method: req.method,
      path: pathOnly,
      // Presence and shape only — never the token value.
      bearerPresent: authHeader.startsWith('Bearer '),
      bearerLength: authHeader.startsWith('Bearer ') ? authHeader.length - 7 : 0,
      status: null,
    };
    authObservations.push(observation);
    res.on('finish', () => { observation.status = res.statusCode; });
    return next();
  });

  // `app.use` appended the layer; move it ahead of the mounted routers.
  const layer = router.stack.pop();
  router.stack.unshift(layer);
  return true;
}

// ---------------------------------------------------------------------------
// 5. Report writing.
// ---------------------------------------------------------------------------
function writeReport(reason) {
  const networkSummary = guard.summary();
  const isLogin = (o) => o.method === 'POST' && o.path === '/api/auth/login';
  const isMe = (o) => o.method === 'GET' && o.path === '/api/auth/me';

  const report = {
    testId: TEST_ID,
    reason,
    generatedAt: new Date().toISOString(),
    network: networkSummary,
    providerConstructorCounts: { ...providerConstructorCounts },
    providerDispatchAttempts,
    providerBoundary: {
      liveClaudeAllowed: networkSummary.liveClaudeAllowed,
      providerHttpRequests: networkSummary.providerHttpRequests,
      providerSocketConnections: networkSummary.providerSocketConnections,
      approvedClaudeProviderAttempts: networkSummary.approvedClaudeProviderAttempts,
      providerDispatchAttemptsObserved: providerDispatchAttempts.length,
      providerInputTokens: 0,
      providerOutputTokens: 0,
      providerCostUsd: 0,
    },
    authObservations,
    authSummary: {
      loginEndpointCalls: authObservations.filter(isLogin).length,
      loginEndpointAccepted: authObservations.filter((o) => isLogin(o) && o.status === 200).length,
      signupEndpointCalls: authObservations.filter(
        (o) => o.method === 'POST' && o.path === '/api/auth/signup'
      ).length,
      meEndpointCalls: authObservations.filter(isMe).length,
      meEndpointAccepted: authObservations.filter((o) => isMe(o) && o.status === 200).length,
      meEndpointRejected: authObservations.filter((o) => isMe(o) && o.status === 401).length,
      migrateChatCalls: authObservations.filter((o) => o.path === '/api/auth/migrate-chat').length,
      bearerPresentOnProtectedCalls: authObservations.filter(
        (o) => !isLogin(o) && o.path !== '/api/auth/signup' && o.bearerPresent
      ).length,
    },
  };

  fs.writeFileSync(
    path.join(OUT_DIR, 'backend-ledger.json'),
    `${JSON.stringify(report, null, 2)}\n`
  );
}

process.on('SIGTERM', () => { writeReport('sigterm'); process.exit(0); });
process.on('SIGINT', () => { writeReport('sigint'); process.exit(0); });

const TRIGGER = path.join(OUT_DIR, 'snapshot.request');
setInterval(() => {
  if (!fs.existsSync(TRIGGER)) return;
  try { fs.unlinkSync(TRIGGER); } catch { /* re-armed next tick */ }
  writeReport('snapshot');
}, 500).unref();

global.__stage14_8gEnterRuntimePhase = () => {
  currentPhase = 'runtime';
  guard.setPhase('runtime');
};
global.__stage14_8gInstallAuthObserver = installAuthObserver;
global.__stage14_8gNetworkSummary = () => guard.summary();

process.stdout.write(
  `[stage14_8G] bootstrap installed — guard active (claude NOT authorized), out=${OUT_DIR}\n`
);
