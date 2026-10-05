'use strict';

/**
 * Stage 14.8A live retest — acceptance backend preload.
 *
 * Loaded with `node -r` BEFORE server.js, so the outbound-network guard is
 * installed before any application, route, provider, NPS, weather, image or
 * search module can be imported. An import-time request is therefore caught as
 * an isolation failure rather than silently succeeding.
 *
 * Network policy for this run:
 *   127.0.0.1:27018        → allowed (isolated acceptance Mongo)
 *   127.0.0.1 http ports   → allowed (own listener)
 *   api.anthropic.com:443  → allowed — the ONE authorized paid destination
 *   everything else        → blocked and recorded (NPS, weather, RIDB, images,
 *                            geocoding, OpenAI, search, Atlas, analytics)
 *
 * Accounting: every provider HTTP request is teed at the fetch transport, so a
 * request cannot reach Claude without producing exactly one ledger row. Usage
 * is read from the provider's own response (streaming `message_start` /
 * `message_delta`, or the terminal JSON `usage`). Missing cache counters stay
 * null and keep the conservative reservation — they are never coerced to zero.
 */

const fs = require('fs');
const path = require('path');

const OUT_DIR = process.env.STAGE14_8A_OUT_DIR
  || path.resolve(__dirname, '..', '..', 'artifacts', 'stage14_8A-live-retest');
fs.mkdirSync(OUT_DIR, { recursive: true });

const TEST_ID = 'stage14_8A-guest-message-1-live-retest';

// ---------------------------------------------------------------------------
// 1. Outbound network guard — installed first, before anything else loads.
// ---------------------------------------------------------------------------
const { installOutboundNetworkGuard } = require('../src/eval/bootstrap/outboundNetworkGuard');
/**
 * The acceptance database may live on any qualified loopback Mongo instance
 * (27018 historical, 27019 fresh), so its port is derived from the configured
 * URI and allowed explicitly. Loopback only — nothing external is opened.
 */
const acceptanceMongoPort = (() => {
  const match = /^mongodb:\/\/127\.0\.0\.1:(\d+)\//.exec(process.env.MONGODB_URI || '');
  return match ? Number(match[1]) : 27018;
})();

const guard = installOutboundNetworkGuard({
  liveClaudeAllowed: true,
  allowedHttpPorts: [Number(process.env.PORT) || 5101, 27018, acceptanceMongoPort],
});

// ---------------------------------------------------------------------------
// 1b. Provider CONSTRUCTOR counters (Stage 14.8F §7).
//
// The boundary under test is stronger than "no dispatch": the sixth-message
// rejection must happen before a provider client is CONSTRUCTED. Counting
// constructions separately from dispatches is what makes that provable. A
// client built once at module load is recorded here too, so a request-window
// delta can distinguish startup from request-path construction.
// ---------------------------------------------------------------------------
const providerConstructorCounts = { claude: 0, openai: 0 };

// Stage 14.8H — extracted to a shared, deterministically tested module. The
// inline version this replaces forwarded the Proxy as `newTarget`; because the
// Anthropic CJS entry is itself a callable wrapper with its own `.prototype`,
// that stripped the constructed client's prototype and every method on it.
// Behaviour here is otherwise unchanged: the same two counters, incremented at
// the same points. See src/eval/bootstrap/providerConstructorCounter.js.
//
// The guest turns recorded in 14.8A-F produced real Claude responses through
// this same inline pattern, which the prototype-stripping defect does not
// obviously permit. That discrepancy is recorded as
// `historical_unexplained_harness_difference` and is NOT taken to invalidate
// those observed outputs; no paid guest test was re-run to chase it.
const {
  installProviderConstructorCounting,
} = require('../src/eval/bootstrap/providerConstructorCounter');

installProviderConstructorCounting('@anthropic-ai/sdk', 'claude', providerConstructorCounts);
installProviderConstructorCounting('openai', 'openai', providerConstructorCounts);

global.__stage14_8fProviderConstructorCounts = () => ({ ...providerConstructorCounts });

// ---------------------------------------------------------------------------
// 2. Provider ledger — reserve/settle per attempt (Stage 14.7G §6 shape).
// ---------------------------------------------------------------------------
const { createLiveProviderLedger } = require('../src/eval/stage14_7/liveProviderLedger');
const { CLAUDE_PRIMARY_MODEL } = require('../src/config/aiModels');

const ledger = createLiveProviderLedger({
  model: CLAUDE_PRIMARY_MODEL,
  caps: {
    maxRequests: 12,
    maxInputTokens: 400000,
    maxOutputTokens: 80000,
    maxCostUsd: 2.0,
  },
});

let attemptNumber = 0;
const pendingSettlements = [];
/** Raw transport observations, independent of the ledger, for reconciliation. */
const providerHttpObservations = [];

function parseStreamingUsage(text) {
  const usage = {
    inputTokens: null,
    outputTokens: null,
    cacheCreationInputTokens: null,
    cacheReadInputTokens: null,
  };
  let model = null;
  let stopReason = null;

  for (const line of text.split('\n')) {
    if (!line.startsWith('data:')) continue;
    let event;
    try {
      event = JSON.parse(line.slice(5).trim());
    } catch {
      continue; // a partial or non-JSON frame is simply not evidence
    }
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

/**
 * Stage 14.8B §10 — bounded proof that the follow-up reached the generation
 * layer WITH the first completed turn behind it. Presence flags and counts
 * only: no prompt or response text is retained.
 */
function summarizeGenerationContext(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const textOf = (m) => {
    if (typeof m?.content === 'string') return m.content;
    if (Array.isArray(m?.content)) {
      return m.content.map((c) => (typeof c?.text === 'string' ? c.text : '')).join(' ');
    }
    return '';
  };
  const priors = messages.slice(0, -1);
  const current = messages.length ? textOf(messages[messages.length - 1]) : '';
  const priorText = priors.map(textOf).join(' \n ');
  const systemText = typeof body?.system === 'string'
    ? body.system
    : Array.isArray(body?.system)
      ? body.system.map((b) => (typeof b?.text === 'string' ? b.text : '')).join(' ')
      : '';

  return {
    messageCount: messages.length,
    roleSequence: messages.map((m) => m.role),
    completedHistoryTurnsSupplied: priors.filter((m) => m.role === 'assistant').length,
    priorDestinationPresent: /yosemite/i.test(priorText) || /yosemite/i.test(systemText),
    priorDurationPresent: /\b2[- ]day\b|\btwo[- ]day\b|\b2 days\b|\btwo days\b/i.test(priorText)
      || /\b2[- ]day\b|\btwo[- ]day\b|\b2 days\b|\btwo days\b/i.test(systemText),
    priorDay1Present: /day 1/i.test(priorText),
    priorDay2Present: /day 2/i.test(priorText),
    // Stage 14.8C §8 — evidence that the SECOND turn's Day-2 relaxation is
    // itself part of the history the third turn reasons over.
    priorTwoDayPlanPresent: /\b(2|two)[- ]day\b/i.test(priorText) && /day 2/i.test(priorText),
    priorDay2ModificationPresent:
      /revised day 2|make day 2 even more relaxed|total walking/i.test(priorText),
    priorDay1ModificationPresent:
      /revised day 1|first day a little easier|total for day 1/i.test(priorText),
    priorPackingTurnPresent:
      /what should i pack|earns its space in the bag|daypack/i.test(priorText),
    // The marker for THIS stage's message. Hardcoding per-turn phrasings meant
    // a later stage silently reported `currentFollowUpPresent: false` even
    // though the message was supplied — set STAGE14_8_CURRENT_MARKER per run.
    currentFollowUpPresent: (() => {
      const marker = process.env.STAGE14_8_CURRENT_MARKER;
      if (marker) {
        try { return new RegExp(marker, 'i').test(current); } catch { return false; }
      }
      return /make day 2 even more relaxed/i.test(current)
        || /make that first day a little easier/i.test(current)
        || /what should i pack/i.test(current);
    })(),
    currentMessagePresentAsLastUserTurn:
      messages.length > 0
      && messages[messages.length - 1].role === 'user'
      && current.trim().length > 0,
    currentMentionsYosemite: /yosemite/i.test(current),
    currentPreservesNamedStops: {
      tunnelView: /tunnel view/i.test(current),
      bridalveilFall: /bridalveil/i.test(current),
    },
  };
}

const guardedFetch = global.fetch;

global.fetch = async function stage14_8aTeedFetch(input, init) {
  const url = typeof input === 'string' ? input : (input?.url || String(input));
  const isProvider = /^https:\/\/api\.anthropic\.com\//.test(url);

  if (!isProvider) return guardedFetch.call(this, input, init);

  // Read the request the SDK is about to send — model, cap and shape are
  // evidence, and `tools` distinguishes structured generation from prose.
  let requestModel = CLAUDE_PRIMARY_MODEL;
  let maxOutputTokens = null;
  let phase = 'prose';
  let contextEvidence = null;
  try {
    const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
    requestModel = body.model || requestModel;
    maxOutputTokens = Number.isFinite(body.max_tokens) ? body.max_tokens : null;
    if (Array.isArray(body.tools) && body.tools.length > 0) phase = 'structured';
    contextEvidence = summarizeGenerationContext(body);
  } catch { /* unparseable body keeps conservative defaults */ }

  attemptNumber += 1;
  const observation = {
    attemptNumber,
    phase,
    requestModel,
    maxOutputTokens,
    startedAt: new Date().toISOString(),
    httpStatus: null,
    providerRequestId: null,
    settled: false,
    contextEvidence,
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
  });

  if (!attempt.allowed) {
    // A cap refusal is the cap working: refuse the dispatch, never retry.
    observation.httpStatus = 'refused_by_cap';
    observation.blockedBy = attempt.blockedBy;
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

  // Tee via clone so the SDK's own body stream is untouched — this must never
  // change what the application receives.
  const mirror = response.clone();
  const settlement = (async () => {
    let text = '';
    try {
      text = await mirror.text();
    } catch {
      // A body we could not read leaves the conservative reservation standing.
    }
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
// 3. SSE emission capture — the authoritative server-side event order.
// ---------------------------------------------------------------------------
const sseStream = require('../src/utils/sseStream');
const emittedSseEvents = [];
const originalWriteSseEvent = sseStream.writeSseEvent;

/**
 * Stage 14.8B §6 — bounded structured snapshot.
 *
 * The anonymous route's terminal payload is the first and only point at which
 * the guest's structured itinerary is observable (Contract A reveals nothing
 * earlier). Only shape is retained — day count, stop names and any distance
 * strings — plus a canonical hash. No raw provider draft is kept.
 */
const structuredSnapshots = [];

function captureStructuredSnapshot(payload) {
  const itinerary = payload?.itineraryData;
  if (!itinerary) {
    structuredSnapshots.push({
      at: new Date().toISOString(),
      status: 'structured_snapshot_unavailable_by_contract',
      hasItineraryFlag: payload?.hasItinerary ?? null,
    });
    return;
  }

  const days = Array.isArray(itinerary.days) ? itinerary.days : [];
  const numericMiles = (value) => {
    if (Number.isFinite(value)) return value;
    const match = String(value ?? '').match(/([\d.]+)\s*(?:mi|mile)/i);
    return match ? Number(match[1]) : null;
  };
  const describeDay = (day) => {
    const stops = Array.isArray(day?.stops) ? day.stops : [];
    const distances = stops.map((s) => s?.distance ?? s?.miles ?? s?.length ?? null);
    const miles = distances.map(numericMiles).filter((n) => n != null);
    return {
      day: day?.day ?? null,
      title: typeof day?.title === 'string' ? day.title.slice(0, 120) : null,
      stopNames: stops.map((s) => (typeof s?.name === 'string' ? s.name.slice(0, 90) : null)),
      stopDistances: distances,
      totalWalkingMiles: miles.length ? Number(miles.reduce((a, b) => a + b, 0).toFixed(2)) : null,
    };
  };

  let itineraryHash = null;
  try {
    const { hashPayload } = require('../src/utils/canonicalResponse');
    itineraryHash = hashPayload(itinerary);
  } catch { /* hash is evidence, not a requirement */ }

  structuredSnapshots.push({
    at: new Date().toISOString(),
    status: 'captured',
    destination: payload?.parkName || itinerary.parkName || null,
    parkCode: payload?.parkCode || itinerary.parkCode || null,
    numberOfDays: days.length,
    days: days.map(describeDay),
    day1: days.length > 0 ? describeDay(days[0]) : null,
    day2: days.length > 1 ? describeDay(days[1]) : null,
    itineraryHash,
  });
}

sseStream.writeSseEvent = function capturedWriteSseEvent(res, payload) {
  if (payload?.type === 'done') captureStructuredSnapshot(payload);
  emittedSseEvents.push({
    at: new Date().toISOString(),
    type: payload?.type || 'unknown',
    // Bounded shape only — no response prose is retained in the event ledger.
    ...(payload?.stage ? { stage: payload.stage } : {}),
    ...(payload?.type === 'done'
      ? {
        contentUnchanged: payload.contentUnchanged ?? null,
        hasItinerary: payload.hasItinerary ?? null,
        messageCount: payload.messageCount ?? null,
        canSendMore: payload.canSendMore ?? null,
        remainingAllowance: payload.remainingAllowance ?? null,
        provider: payload.provider ?? null,
        model: payload.model ?? null,
      }
      : {}),
  });
  return originalWriteSseEvent.call(this, res, payload);
};

// ---------------------------------------------------------------------------
// 3b. Destination-resolution diagnostics (Stage 14.8C §6).
//
// Captured at the resolver itself rather than from the client payload, so the
// evidence is the decision the server actually made. Bounded: names, codes and
// the closed-vocabulary rejection reason only — never conversation text.
// ---------------------------------------------------------------------------
const activeTripContextService = require('../src/services/activeTripContextService');
const destinationResolutions = [];
const originalResolveActiveTripContext = activeTripContextService.resolveActiveTripContext;

activeTripContextService.resolveActiveTripContext = function capturedResolve(args) {
  const previous = args?.storedContext?.lockedPlanDestination
    || args?.storedContext?.primaryDestination
    || null;
  const result = originalResolveActiveTripContext.call(this, args);
  const ctx = result?.activeTripContext || {};

  destinationResolutions.push({
    at: new Date().toISOString(),
    previousDestinationName: previous?.name || null,
    previousDestinationParkCode: previous?.parkCode || null,
    resolutionSource: ctx.resolutionSource || null,
    destinationChangeIntent: ctx.destinationMutation?.destinationChangeIntent ?? null,
    mutationAccepted: ctx.destinationMutation?.mutationAccepted ?? null,
    rejectionReason: ctx.destinationMutation?.rejectionReason ?? null,
    candidateDestination: ctx.destinationMutation?.candidateDestination ?? null,
    resultingDestinationName: ctx.primaryDestination?.name || null,
    resultingDestinationParkCode: ctx.primaryDestination?.parkCode || null,
    lockedDestinationName: ctx.lockedPlanDestination?.name || null,
    lockedDestinationParkCode: ctx.lockedPlanDestination?.parkCode || null,
    offeredOptionNames: (ctx.lastRecommendationList || []).map((o) => o?.name).filter(Boolean),
  });

  return result;
};

// ---------------------------------------------------------------------------
// 4. Report writing.
// ---------------------------------------------------------------------------
let reported = false;
async function writeReport(reason) {
  if (reported) return;
  reported = true;
  try {
    await Promise.allSettled(pendingSettlements);
  } catch { /* settle best-effort; unsettled rows keep their reservation */ }

  const ledgerReport = ledger.report();
  const networkSummary = guard.summary();
  const report = {
    testId: TEST_ID,
    reason,
    generatedAt: new Date().toISOString(),
    network: networkSummary,
    providerConstructorCounts: { ...providerConstructorCounts },
    providerAttempts: ledgerReport.entries,
    providerRefusals: ledgerReport.refusals,
    providerTotals: ledgerReport.totals,
    ledgerReconciliation: ledgerReport.reconciliation,
    capsRespected: ledger.capsRespected(),
    providerHttpObservations,
    reconciliation: {
      providerHttpRequestsObserved: providerHttpObservations.length,
      ledgerRows: ledgerReport.entries.length,
      unsettledObservations: providerHttpObservations.filter((o) => !o.settled).length,
      guardProviderHttpRequests: networkSummary.providerHttpRequests,
      // §13 — every provider HTTP request must map to exactly one ledgered
      // dispatch. A non-zero value here is an accounting failure, not a warning.
      unaccountedProviderRequests: Math.max(
        0,
        providerHttpObservations.length - ledgerReport.entries.length
      ),
    },
    emittedSseEvents,
    structuredSnapshots,
    destinationResolutions,
  };

  fs.writeFileSync(
    path.join(OUT_DIR, 'backend-ledger.json'),
    `${JSON.stringify(report, null, 2)}\n`
  );
}

process.on('SIGTERM', () => { writeReport('sigterm').finally(() => process.exit(0)); });
process.on('SIGINT', () => { writeReport('sigint').finally(() => process.exit(0)); });
process.on('exit', () => { /* synchronous best-effort snapshot already written */ });

// A file trigger lets the driver snapshot the ledger mid-run without stopping
// the server, so evidence survives even if teardown is interrupted.
const TRIGGER = path.join(OUT_DIR, 'snapshot.request');
setInterval(() => {
  if (!fs.existsSync(TRIGGER)) return;
  try { fs.unlinkSync(TRIGGER); } catch { /* re-armed next tick */ }
  reported = false;
  writeReport('snapshot');
}, 500).unref();

/**
 * The guard labels attempts by phase. Everything up to the point the app has
 * finished importing is `import` (a request there is an import side effect);
 * afterwards it is `runtime`. The entrypoint flips this once `src/app` is
 * loaded so the two are never conflated in the evidence.
 */
global.__stage14_8aEnterRuntimePhase = () => guard.setPhase('runtime');
global.__stage14_8aNetworkSummary = () => guard.summary();

process.stdout.write(
  `[stage14_8A] acceptance bootstrap installed — guard active, provider ledger armed, out=${OUT_DIR}\n`
);
