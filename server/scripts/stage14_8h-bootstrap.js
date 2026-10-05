'use strict';

/**
 * Stage 14.8H — authenticated live itinerary acceptance preload.
 *
 * Loaded with `node -r` BEFORE the app, so the outbound guard, the provider
 * ledger and every observer are installed before any route, provider, NPS,
 * weather, image or search module can be imported.
 *
 * Network policy — deny by default, with exactly ONE paid destination:
 *   127.0.0.1:<acceptance mongo>  → allowed (isolated authenticated database)
 *   127.0.0.1:<own listener>      → allowed
 *   api.anthropic.com:443         → allowed — the one authorized dependency
 *   everything else               → blocked and recorded (OpenAI included)
 *
 * HARD caps for this stage (§3). These are refusal thresholds, not targets:
 *   4 requests / 80k input tokens / 40k output tokens / $0.56
 *
 * Every provider request is teed at the transport, so a call cannot reach Claude
 * without producing exactly one ledger row, and the projection runs BEFORE each
 * dispatch. A cap breach refuses the dispatch rather than reporting it after the
 * money is spent.
 *
 * Diagnostics discipline: no credential, Authorization header, API key, prompt
 * or response prose is ever retained. Persistence bodies are reduced to bounded
 * identity/lifecycle fields.
 */

const fs = require('fs');
const path = require('path');

const OUT_DIR = process.env.STAGE14_8H_OUT_DIR
  || path.resolve(__dirname, '..', '..', 'artifacts', 'stage14_8H-authenticated-itinerary');
fs.mkdirSync(OUT_DIR, { recursive: true });

const TEST_ID = 'stage14_8H-authenticated-itinerary-1';
const ALLOWED_MODEL_PREFIX = process.env.STAGE14_8H_ALLOWED_MODEL || 'claude-sonnet-5';

const monotonicMs = () => Number(process.hrtime.bigint() / 1000000n);

// ---------------------------------------------------------------------------
// 1. Outbound network guard.
// ---------------------------------------------------------------------------
const { installOutboundNetworkGuard } = require('../src/eval/bootstrap/outboundNetworkGuard');

const acceptanceMongoPort = (() => {
  const match = /^mongodb:\/\/127\.0\.0\.1:(\d+)\//.exec(process.env.MONGODB_URI || '');
  return match ? Number(match[1]) : null;
})();

if (acceptanceMongoPort == null) {
  console.error('[stage14_8H] refusing to install: MONGODB_URI is not an isolated loopback database');
  process.exit(1);
}

const guard = installOutboundNetworkGuard({
  liveClaudeAllowed: true,
  allowedHttpPorts: [Number(process.env.PORT) || 5101, acceptanceMongoPort],
});

// ---------------------------------------------------------------------------
// 2. Provider constructor counters (startup vs request-path construction).
// ---------------------------------------------------------------------------
const providerConstructorCounts = { claude: 0, openai: 0 };

// Shared with the guest bootstrap and covered by deterministic tests. The inline
// copy this replaces forwarded the Proxy as `newTarget`, which stripped the SDK
// client's prototype and aborted this stage's first attempt before any HTTP
// request — see src/eval/bootstrap/providerConstructorCounter.js.
const {
  installProviderConstructorCounting,
} = require('../src/eval/bootstrap/providerConstructorCounter');

installProviderConstructorCounting('@anthropic-ai/sdk', 'claude', providerConstructorCounts);
installProviderConstructorCounting('openai', 'openai', providerConstructorCounts);

// ---------------------------------------------------------------------------
// 3. Provider ledger with the Stage 14.8H caps.
// ---------------------------------------------------------------------------
const { createLiveProviderLedger } = require('../src/eval/stage14_7/liveProviderLedger');
const { CLAUDE_PRIMARY_MODEL } = require('../src/config/aiModels');

const CAPS = {
  maxRequests: 4,
  maxInputTokens: 80000,
  maxOutputTokens: 40000,
  maxCostUsd: 0.56,
};

const ledger = createLiveProviderLedger({ model: CLAUDE_PRIMARY_MODEL, caps: CAPS });

let attemptNumber = 0;
const pendingSettlements = [];
/** Transport observations, independent of the ledger, for reconciliation. */
const providerHttpObservations = [];
const capRefusals = [];
const modelRefusals = [];

function parseStreamingUsage(text) {
  const usage = {
    inputTokens: null, outputTokens: null,
    cacheCreationInputTokens: null, cacheReadInputTokens: null,
  };
  let model = null;
  let stopReason = null;

  for (const line of text.split('\n')) {
    if (!line.startsWith('data:')) continue;
    let event;
    try { event = JSON.parse(line.slice(5).trim()); } catch { continue; }
    if (event.type === 'message_start' && event.message) {
      model = event.message.model || model;
      const u = event.message.usage || {};
      if (Number.isFinite(u.input_tokens)) usage.inputTokens = u.input_tokens;
      if (Number.isFinite(u.output_tokens)) usage.outputTokens = u.output_tokens;
      if (Number.isFinite(u.cache_creation_input_tokens)) {
        usage.cacheCreationInputTokens = u.cache_creation_input_tokens;
      }
      if (Number.isFinite(u.cache_read_input_tokens)) {
        usage.cacheReadInputTokens = u.cache_read_input_tokens;
      }
    }
    if (event.type === 'message_delta') {
      if (Number.isFinite(event.usage?.output_tokens)) usage.outputTokens = event.usage.output_tokens;
      if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
    }
  }
  return { usage, model, stopReason };
}

function parseJsonUsage(text) {
  try {
    const body = JSON.parse(text);
    const u = body.usage || {};
    return {
      usage: {
        inputTokens: Number.isFinite(u.input_tokens) ? u.input_tokens : null,
        outputTokens: Number.isFinite(u.output_tokens) ? u.output_tokens : null,
        cacheCreationInputTokens: Number.isFinite(u.cache_creation_input_tokens)
          ? u.cache_creation_input_tokens : null,
        cacheReadInputTokens: Number.isFinite(u.cache_read_input_tokens)
          ? u.cache_read_input_tokens : null,
      },
      model: body.model || null,
      stopReason: body.stop_reason || null,
      isError: Boolean(body.error),
    };
  } catch {
    return { usage: null, model: null, stopReason: null, isError: false };
  }
}

const guardedFetch = global.fetch;

global.fetch = async function stage14_8hTeedFetch(input, init) {
  const url = typeof input === 'string' ? input : (input?.url || String(input));
  const isProvider = /^https:\/\/api\.anthropic\.com\//.test(url);

  if (!isProvider) return guardedFetch.call(this, input, init);

  let requestModel = CLAUDE_PRIMARY_MODEL;
  let maxOutputTokens = null;
  let phase = 'prose';
  let toolCount = 0;
  let messageCount = null;
  try {
    const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
    requestModel = body.model || requestModel;
    maxOutputTokens = Number.isFinite(body.max_tokens) ? body.max_tokens : null;
    toolCount = Array.isArray(body.tools) ? body.tools.length : 0;
    if (toolCount > 0) phase = 'structured';
    messageCount = Array.isArray(body.messages) ? body.messages.length : null;
  } catch { /* unparseable body keeps conservative defaults */ }

  // §3 — only the authorized model may be dispatched. A different model is a
  // configuration surprise, not something to discover from the invoice.
  if (!String(requestModel).startsWith(ALLOWED_MODEL_PREFIX)) {
    modelRefusals.push({ at: new Date().toISOString(), requestModel, phase });
    throw Object.assign(new Error('stage14_8h_model_not_authorized'), {
      code: 'stage14_8h_model_not_authorized',
    });
  }

  attemptNumber += 1;
  const dispatchAuthorizedAt = new Date().toISOString();
  const observation = {
    attemptNumber,
    phase,
    requestModel,
    maxOutputTokens,
    toolCount,
    messageCount,
    dispatchAuthorizedAt,
    dispatchAuthorizedAtMs: monotonicMs(),
    httpStatus: null,
    providerRequestId: null,
    settled: false,
  };
  providerHttpObservations.push(observation);

  const attempt = ledger.beginAttempt({
    scenarioId: TEST_ID,
    phase,
    attemptNumber,
    maxOutputTokens,
    provider: 'claude',
    resolvedModel: requestModel,
    reservationModel: requestModel,
    dispatchModel: requestModel,
    sdkRequestModel: requestModel,
    dispatchAuthorizationId: `h-${attemptNumber}`,
  });

  if (!attempt.allowed) {
    // The cap working. Refuse the dispatch; never retry.
    observation.httpStatus = 'refused_by_cap';
    observation.blockedBy = attempt.blockedBy;
    capRefusals.push({
      at: new Date().toISOString(), attemptNumber, phase, blockedBy: attempt.blockedBy,
    });
    throw Object.assign(new Error('provider_cap_refusal'), { code: 'provider_cap_refusal' });
  }

  let response;
  try {
    response = await guardedFetch.call(this, input, init);
  } catch (error) {
    ledger.settleAttempt(attempt.reservationId, { usage: null, outcome: 'failed' });
    observation.settled = true;
    observation.httpStatus = 'transport_error';
    throw error;
  }

  observation.httpStatus = response.status;
  observation.providerRequestId = response.headers.get('request-id')
    || response.headers.get('x-request-id') || null;

  // Tee via clone so the SDK's own stream is untouched.
  const mirror = response.clone();
  const settlement = (async () => {
    let text = '';
    try { text = await mirror.text(); } catch { /* unreadable body keeps the reservation */ }
    const contentType = response.headers.get('content-type') || '';
    const parsed = contentType.includes('text/event-stream')
      ? parseStreamingUsage(text)
      : parseJsonUsage(text);

    const complete = parsed.usage
      && Number.isFinite(parsed.usage.inputTokens)
      && Number.isFinite(parsed.usage.outputTokens);

    ledger.settleAttempt(attempt.reservationId, {
      usage: complete ? parsed.usage : null,
      outcome: response.ok && !parsed.isError ? 'success' : 'failed',
      providerRequestId: observation.providerRequestId,
      usageSource: complete ? 'provider_terminal_usage' : 'conservative_reservation',
    });
    observation.settled = true;
    observation.responseModel = parsed.model || null;
    observation.stopReason = parsed.stopReason || null;
  })();

  pendingSettlements.push(settlement);
  return response;
};

// ---------------------------------------------------------------------------
// 4. Server-side SSE emission capture — the authoritative event order.
// ---------------------------------------------------------------------------
const sseStream = require('../src/utils/sseStream');
const emittedSseEvents = [];
const structuredSnapshots = [];
const originalWriteSseEvent = sseStream.writeSseEvent;

/** Bounded plan shape: names, order and hashes. No provider draft is kept. */
function describePlan(plan) {
  if (!plan) return null;
  const days = Array.isArray(plan.days) ? plan.days : [];
  return {
    destinationName: plan.parkName || plan.destinationName || null,
    destinationParkCode: plan.parkCode || null,
    numberOfDays: days.length,
    days: days.map((day) => ({
      day: day?.day ?? null,
      title: typeof day?.title === 'string' ? day.title.slice(0, 120) : null,
      stopNames: (Array.isArray(day?.stops) ? day.stops : [])
        .map((s) => (typeof s?.name === 'string' ? s.name.slice(0, 90) : null)),
    })),
    itineraryHash: plan.itineraryHash || null,
    lifecycleStatus: plan.lifecycleStatus || null,
    responseRevision: plan.responseRevision ?? null,
  };
}

sseStream.writeSseEvent = function capturedWriteSseEvent(res, payload) {
  const type = payload?.type || 'unknown';

  emittedSseEvents.push({
    at: new Date().toISOString(),
    atMs: monotonicMs(),
    type,
    ...(payload?.stage ? { stage: payload.stage } : {}),
    responseId: payload?.responseId ?? payload?.response?.responseId ?? null,
    responseVersion: payload?.responseVersion ?? payload?.response?.responseVersion ?? null,
    responseRevision: payload?.responseRevision ?? payload?.response?.responseRevision ?? null,
    lifecycleStatus: payload?.lifecycleStatus ?? payload?.response?.lifecycleStatus ?? null,
    itineraryHash: payload?.itineraryHash ?? payload?.response?.itineraryHash ?? null,
    hasItinerary: payload?.hasItinerary ?? null,
    ...(type === 'done'
      ? {
        contentUnchanged: payload.contentUnchanged ?? null,
        provider: payload.provider ?? null,
        model: payload.model ?? null,
      }
      : {}),
  });

  if (type === 'itinerary_ready' || type === 'prose_ready' || type === 'done') {
    structuredSnapshots.push({
      at: new Date().toISOString(),
      event: type,
      plan: describePlan(payload?.canonicalPlan || payload?.itineraryData || payload?.plan),
      responseId: payload?.responseId ?? payload?.response?.responseId ?? null,
      responseVersion: payload?.responseVersion ?? payload?.response?.responseVersion ?? null,
      itineraryHash: payload?.itineraryHash ?? payload?.response?.itineraryHash ?? null,
    });
  }

  return originalWriteSseEvent.call(this, res, payload);
};

// ---------------------------------------------------------------------------
// 5. Persistence-write observer (auth + trips + ai), status and timing only.
//
// Spliced to the FRONT of the Express stack: middleware appended after the
// routers never runs for a matched route, and a listener on the server's
// `request` event was found in Stage 14.8G.1 to miss GETs entirely.
// ---------------------------------------------------------------------------
const httpObservations = [];

function installRequestObserver(app) {
  const router = app && (app._router || app.router);
  if (!router || !Array.isArray(router.stack)) return false;

  app.use((req, res, next) => {
    const pathOnly = String(req.originalUrl || req.url || '').split('?')[0];
    if (!/^\/api\/(auth|trips|ai)\b/.test(pathOnly)) return next();

    const authHeader = req.headers.authorization || '';
    const observation = {
      at: new Date().toISOString(),
      atMs: monotonicMs(),
      method: req.method,
      path: pathOnly,
      bearerPresent: authHeader.startsWith('Bearer '),
      status: null,
      finishedAtMs: null,
      durationMs: null,
    };
    httpObservations.push(observation);
    res.on('finish', () => {
      observation.status = res.statusCode;
      observation.finishedAtMs = monotonicMs();
      observation.durationMs = observation.finishedAtMs - observation.atMs;
    });
    return next();
  });

  const layer = router.stack.pop();
  router.stack.unshift(layer);
  return true;
}

// ---------------------------------------------------------------------------
// 6. Report writing.
// ---------------------------------------------------------------------------
let reported = false;
async function writeReport(reason) {
  if (reported) return;
  reported = true;
  try { await Promise.allSettled(pendingSettlements); } catch { /* best effort */ }

  const ledgerReport = ledger.report();
  const networkSummary = guard.summary();
  const isWrite = (o) => ['POST', 'PUT', 'PATCH'].includes(o.method);
  const authorizedDispatches = providerHttpObservations.filter(
    (o) => o.dispatchAuthorizedAt && o.httpStatus !== 'refused_by_cap'
  ).length;

  const report = {
    testId: TEST_ID,
    reason,
    generatedAt: new Date().toISOString(),
    caps: CAPS,
    allowedModelPrefix: ALLOWED_MODEL_PREFIX,

    network: networkSummary,
    providerConstructorCounts: { ...providerConstructorCounts },
    providerAttempts: ledgerReport.entries,
    providerRefusals: ledgerReport.refusals,
    providerTotals: ledgerReport.totals,
    ledgerReconciliation: ledgerReport.reconciliation,
    capsRespected: ledger.capsRespected(),
    capRefusals,
    modelRefusals,
    providerHttpObservations,

    reconciliation: {
      providerHttpRequestsObserved: providerHttpObservations.length,
      dispatchAuthorizations: authorizedDispatches,
      ledgerRows: ledgerReport.entries.length,
      unsettledObservations: providerHttpObservations.filter((o) => !o.settled).length,
      guardProviderHttpRequests: networkSummary.providerHttpRequests,
      unaccountedProviderRequests: Math.max(
        0, networkSummary.providerHttpRequests - ledgerReport.entries.length
      ),
      ledgerAttemptsEqualDispatchAuthorizations: ledgerReport.entries.length === authorizedDispatches,
      dispatchAuthorizationsEqualProviderHttpRequests:
        authorizedDispatches === networkSummary.providerHttpRequests,
    },

    emittedSseEvents,
    serverEventCounts: emittedSseEvents.reduce((acc, e) => {
      acc[e.type] = (acc[e.type] || 0) + 1; return acc;
    }, {}),
    structuredSnapshots,

    httpObservations,
    persistenceWrites: httpObservations.filter((o) => isWrite(o) && o.path.startsWith('/api/trips')),
    persistenceWriteCounts: {
      tripCreates: httpObservations.filter((o) => o.method === 'POST' && o.path === '/api/trips').length,
      tripCreatesAccepted: httpObservations.filter(
        (o) => o.method === 'POST' && o.path === '/api/trips' && o.status >= 200 && o.status < 300
      ).length,
      tripUpdates: httpObservations.filter(
        (o) => o.method === 'PUT' && /^\/api\/trips\/[^/]+$/.test(o.path)
      ).length,
      tripUpdatesAccepted: httpObservations.filter(
        (o) => o.method === 'PUT' && /^\/api\/trips\/[^/]+$/.test(o.path)
          && o.status >= 200 && o.status < 300
      ).length,
      messageAppends: httpObservations.filter((o) => /\/messages$/.test(o.path)).length,
      conflicts: httpObservations.filter((o) => o.status === 409).length,
      rejected4xx: httpObservations.filter((o) => o.status >= 400 && o.status < 500).length,
      rejected5xx: httpObservations.filter((o) => o.status >= 500).length,
    },
    chatStreamCalls: httpObservations.filter((o) => o.path === '/api/ai/chat-stream').length,
    anonymousChatCalls: httpObservations.filter((o) => /chat-anonymous/.test(o.path)).length,
  };

  fs.writeFileSync(path.join(OUT_DIR, 'backend-ledger.json'), `${JSON.stringify(report, null, 2)}\n`);
}

process.on('SIGTERM', () => { writeReport('sigterm').finally(() => process.exit(0)); });
process.on('SIGINT', () => { writeReport('sigint').finally(() => process.exit(0)); });

const TRIGGER = path.join(OUT_DIR, 'snapshot.request');
setInterval(() => {
  if (!fs.existsSync(TRIGGER)) return;
  try { fs.unlinkSync(TRIGGER); } catch { /* re-armed next tick */ }
  reported = false;
  writeReport('snapshot');
}, 500).unref();

global.__stage14_8hEnterRuntimePhase = () => guard.setPhase('runtime');
global.__stage14_8hInstallRequestObserver = installRequestObserver;

process.stdout.write(
  `[stage14_8H] bootstrap installed — claude AUTHORIZED, caps ${CAPS.maxRequests}req/`
  + `${CAPS.maxInputTokens}in/${CAPS.maxOutputTokens}out/$${CAPS.maxCostUsd}, out=${OUT_DIR}\n`
);
