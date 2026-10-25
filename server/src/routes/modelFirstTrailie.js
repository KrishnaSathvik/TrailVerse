'use strict';

const { validateConversationId } = require('../utils/guestConversationScope');
const express = require('express');
const { randomUUID } = require('crypto');
const { selectTrailieRuntime } = require('../config/trailieRuntimeSelection');
const { protect, optionalAuth } = require('../middleware/auth');
const { checkTokenLimit } = require('../middleware/tokenLimits');
const { createSimpleRuntime } = require('../services/trailieSimpleRuntime');
const { createSimpleTripStore } = require('../services/trailieSimpleStore');
const { createSimpleGuestStore } = require('../services/trailieSimpleGuestStore');
const { resolveAnonymousRequestIdentity } = require('../utils/anonymousIdGenerator');
const { openGuestTurn, GUEST_TURN_FAILURE_CODES, GUEST_ROUTE_CODES } = require('../services/guestTurnScope');
const { createTrailieTransportAdapter } = require('../utils/trailieTransportAdapter');
const { resolveTrailieTransportDialect } = require('../utils/trailieTransportDialect');
const { attachClientDisconnectAbort, setSseHeaders, writeSseEvent } = require('../utils/sseStream');
const { previewEnabled } = require('../utils/trailieDraftPreview');
const { answerStreamEnabled } = require('../utils/trailieAnswerStream');
const { recordModelFirstTurn } = require('../services/trailieTurnLedger');

const PATHS = ['/chat', '/chat-stream', '/chat-anonymous', '/chat-anonymous-stream', '/plan-itinerary'];

function defaultObserve(event) {
  console.info('[Trailie model_first]', JSON.stringify(event));
}

function stageLog(responseId, stage, startedAt, extra = {}) {
  try {
    console.info('[Trailie model_first stage]', JSON.stringify({
      responseId,
      stage,
      elapsedMs: Date.now() - startedAt,
      ...extra,
    }));
  } catch { /* stage logs never affect the turn */ }
}

// Construct providers only after ownership, quota and input admission. Tests
// inject this boundary: no SDK or travel-provider client is needed offline.
function createDependencies() {
  require('../config/providerTestPolicy').assertLiveProviderAllowed({ provider: 'openai', phase: 'constructor' });
  const { createSimpleModel } = require('../services/trailieSimpleModel');
  const { createMemoryAuthorityVerifier } = require('../services/trailieMemoryAuthority');
  const { createMemoryVerificationModel } = require('../services/trailieMemoryVerificationModel');
  const { createSimpleTravelTools } = require('../services/trailieSimpleTools');
  const { createDefaultEvidenceProviders } = require('../services/evidenceBrokerRuntime');
  const { createEvidenceBroker } = require('../services/evidenceBrokerService');
  const OpenAI = require('openai');
  const broker = createEvidenceBroker({ providers: createDefaultEvidenceProviders(),
    acquireLease: async () => { throw new Error('ephemeral_only'); },
    releaseLease: async () => {}, recordRefreshEvent: async () => {} });
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 180000 });
  const parkCatalog = async () => {
    const nps = require('./../services/npsService').getNpsService();
    return nps.getCachedParks() || await nps.getAllParks();
  };
  return { model: createSimpleModel({ client }), travelTools: createSimpleTravelTools({ broker }), parkCatalog,
    verifyMemory: createMemoryAuthorityVerifier({ model: createMemoryVerificationModel({ client }) }) };
}

function createModelFirstRouter({ dependencies = createDependencies,
  TripPlan = require('../models/TripPlan'), AnonymousSession = require('../models/AnonymousSession'),
  authenticate = protect, authenticateOptional = optionalAuth, tokenAdmission = checkTokenLimit,
  observe = defaultObserve,
  recordMutationOutcome = require('../services/trailieMutationOutcome').recordMutationOutcome,
  recordTurn = recordModelFirstTurn,
} = {}) {
  const router = express.Router();
  router.use((req, res, next) => {
    // Match Express's case-insensitive, optional-trailing-slash semantics too;
    // alternate spellings of a public route must not escape into legacy.
    const pathname = req.path.toLowerCase().replace(/\/+$/, '');
    if (req.method !== 'POST' || !PATHS.includes(pathname)) return next('router');
    const selected = selectTrailieRuntime();
    if (selected === 'legacy') return next('router');
    if (selected !== 'model_first') return res.status(503).json({ error: 'Trailie unavailable', code: 'trailie_runtime_invalid' });
    res.setHeader('X-Trailie-Runtime', 'model_first');
    const exposed = res.getHeader('Access-Control-Expose-Headers');
    res.setHeader('Access-Control-Expose-Headers', [exposed, 'X-Trailie-Runtime'].filter(Boolean).join(', '));
    next();
  });

  async function handle(req, res) {
    const handleStartedAt = Date.now();
    const { signal, cleanup } = attachClientDisconnectAbort(req, res);
    const streaming = req.route.path.endsWith('-stream');
    const planner = req.route.path === '/plan-itinerary';
    const routeName = req.route.path.replace(/^\//, '');
    let turn, anonymousId, transport, heartbeat;
    const responseId = randomUUID();
    const fail = (status, code, content = null) => {
      if (res.destroyed || res.writableEnded) return;
      const message = content || (code === 'responses_timeout'
        ? 'Trailie took too long to respond. Your saved trip was not changed.'
        : 'Trailie could not finish this response. Your saved trip was not changed.');
      const error = { message, code, responseId, retryable: false };
      if (transport) {
        transport.answerEvent({ type: 'withdrawn' });
        transport.error(error);
      }
      else res.status(status).json({ success: false, error: error.message, code, responseId });
    };
    try {
      const body = req.body || {};
      const last = Array.isArray(body.messages) ? body.messages.at(-1) : null;
      const message = last?.role === 'user' ? last.content : body.message;
      if (typeof message !== 'string' || !message.trim() || message.length > 30000) return fail(400, 'invalid_message');
      const metadata = body.metadata || {};
      if (typeof metadata !== 'object' || Array.isArray(metadata)
        || Buffer.byteLength(JSON.stringify(metadata), 'utf8') > 50000) return fail(400, 'invalid_metadata');
      if (metadata.editScope && (!Array.isArray(metadata.editScope.dayNumbers)
        || !metadata.editScope.dayNumbers.length || metadata.editScope.dayNumbers.some(n => !Number.isInteger(n) || n < 1 || n > 60))) {
        return fail(400, 'invalid_edit_scope');
      }
      const conversationId = validateConversationId(metadata.guestConversationId);
      const requestedTrip = body.tripId || metadata.tripId
        || (typeof body.conversationId === 'string' && !body.conversationId.startsWith('temp-') ? body.conversationId : null);
      const target = body.targetTripId || metadata.targetTripId;
      // A request cannot silently redirect a write to another trip. Clients can
      // select that trip explicitly; ownership is checked by the store below.
      if (target && target !== requestedTrip) return fail(400, 'explicit_trip_selection_required');
      let store;
      if (req.user?._id) {
        if (requestedTrip && !/^[a-f0-9]{24}$/i.test(requestedTrip)) return fail(400, 'invalid_trip_id');
        store = createSimpleTripStore({ TripPlan });
      } else {
        if (requestedTrip || target) return fail(403, 'guest_trip_access_denied');
        const identity = resolveAnonymousRequestIdentity(req, body.anonymousId);
        anonymousId = identity.anonymousId;
        await AnonymousSession.findOrCreateSession(anonymousId, { ...identity, userAgent: identity.userAgent || 'unknown' });
        turn = await openGuestTurn({ anonymousId, clientTurnId: body.clientTurnId,
          userMessage: { role: 'user', content: message, conversationId }, trusted: req.isTrustedMcp === true });
        if (!turn.admitted) {
          const r = turn.refusal;
          return res.status(r.code === GUEST_ROUTE_CODES.EXHAUSTED ? 429 : 409).json({
            error: r.code, code: r.code, anonymousId, messageCount: r.completedGuestTurns,
            canSendMore: r.canSendMore, remainingAllowance: r.remainingAllowance });
        }
        store = createSimpleGuestStore({ AnonymousSession, anonymousId, turn, conversationId });
      }
      const userId = req.user?._id ? String(req.user._id) : anonymousId;
      // Hydrate once before constructing any paid-provider dependency. The
      // exact snapshot is retained for the existing store's compare-and-swap.
      const snapshot = await store.load({ userId, tripId: requestedTrip });
      if (signal.aborted) return;
      if (streaming) {
        setSseHeaders(res);
        transport = createTrailieTransportAdapter({ dialect: resolveTrailieTransportDialect(req),
          mode: 'stream', emit: payload => writeSseEvent(res, payload) });
        transport.responseStarted({ responseId });
        heartbeat = setInterval(() => { if (!res.destroyed && !res.writableEnded) res.write(': keepalive\n\n'); }, 15000);
        heartbeat.unref?.();
      }
      const run = createSimpleRuntime({ ...dependencies(),
        store: { ...store, load: async () => snapshot }, observe });
      const runtimeStartedAt = Date.now();
      const preview = streaming && previewEnabled(req) && !snapshot.plan?.days?.length;
      const answerStream = streaming && !preview && answerStreamEnabled(req);
      if (preview) transport.draftStarted({ responseId });
      const result = await run({ userId, tripId: requestedTrip, message, signal, responseId,
        onAnswerEvent: answerStream ? event => transport.answerEvent({ ...event, responseId }) : null,
        onPreview: preview ? event => event.withdrawn ? transport.draftWithdrawn()
          : transport.draftDay(event) : null,
        scope: metadata.editScope || null, timeZone: metadata.timeZone || null, onProgress: event => transport?.progress(event) || false,
        requestContext: { formData: metadata.formData || null, entryContext: metadata.entryContext || null } });
      stageLog(responseId, 'runtime_done', handleStartedAt, {
        status: result.status,
        modelLatencyMs: result.telemetry?.latencyMs ?? null,
        persistenceMs: result.telemetry?.timings?.persistenceMs ?? null,
        mutationAccepted: result.telemetry?.mutationAccepted === true,
      });
      if (result.telemetry?.mutationOutcome) {
        // Diagnostics only: never delays or changes the traveler's response.
        Promise.resolve().then(() => recordMutationOutcome({ responseId, userId: req.user?._id ? String(req.user._id) : null,
          outcome: result.telemetry.mutationOutcome })).catch(() => {});
      }
      if (result.status !== 'complete') {
        await turn?.fail(signal.aborted ? GUEST_TURN_FAILURE_CODES.CLIENT_DISCONNECTED : GUEST_TURN_FAILURE_CODES.PROVIDER_FAILURE);
        return fail(result.httpStatus || (result.status === 'conflict' ? 409 : 422),
          result.telemetry?.failure?.code || result.status, result.failureContent);
      }
      if (result.persisted !== true) {
        await turn?.fail(GUEST_TURN_FAILURE_CODES.BACKEND_EXCEPTION);
        return fail(503, 'persistence_failed');
      }
      stageLog(responseId, 'commit_done', handleStartedAt, {
        tripId: result.tripId || null,
        persisted: true,
      });
      const quota = result.quota;
      const payload = { ...result.response, ...(result.telemetry?.mutationOutcome || {}), canonicalPlan: result.canonicalPlan,
        itinerary: result.response.itineraryData, hasItinerary: !!result.response.itineraryData,
        planningState: result.planningState, persisted: true, tripId: result.tripId || null,
        ...(anonymousId ? { anonymousId, sessionId: anonymousId,
          messageCount: quota.completedGuestTurns, remainingAllowance: quota.remainingAllowance,
          canSendMore: quota.remainingAllowance > 0 } : {}) };
      // Ledger + token bookkeeping must never delay the traveler-visible flush.
      const ledgerStartedAt = Date.now();
      Promise.resolve().then(async () => {
        stageLog(responseId, 'ledger_write_start', handleStartedAt);
        try {
          await recordTurn({
            telemetry: result.telemetry,
            route: routeName,
            userId: req.user?._id ? String(req.user._id) : null,
            responseVersion: result.response?.responseVersion || 1,
            persisted: true,
            tripId: result.tripId || null,
          });
          stageLog(responseId, 'ledger_write_end', handleStartedAt, {
            ledgerMs: Date.now() - ledgerStartedAt,
          });
        } catch (err) {
          console.error('[Trailie] Ledger write failed', { responseId, code: err?.code || 'ledger_write_failed' });
          stageLog(responseId, 'ledger_write_end', handleStartedAt, {
            ledgerMs: Date.now() - ledgerStartedAt,
            error: err?.message || 'ledger_failed',
          });
        }
      }).catch((error) => {
        console.error('[Trailie] Ledger bookkeeping failed', { responseId, code: error?.code || 'ledger_write_failed' });
      });
      if (req.user?.addTokenUsage) {
        const usage = result.telemetry.calls.reduce((a, c) => ({ input: a.input + (c.usage?.inputTokens || 0),
          output: a.output + (c.usage?.outputTokens || 0) }), { input: 0, output: 0 });
        Promise.resolve()
          .then(() => req.user.addTokenUsage(usage.input, usage.output))
          .catch((error) => {
            console.error('[Trailie] Token usage write failed', { responseId, code: error?.code || 'token_usage_write_failed' });
          });
      }
      if (signal.aborted || res.destroyed) return;
      if (transport) {
        // Progress is safe before commit; canonical content waits until the
        // store commits. The same envelope/hash is used for both wire dialects.
        const emitted = transport.contentDelta({ content: payload.content });
        try { observe({runtime:'model_first', contract:'MODEL_FIRST_FINAL', responseId, event:'content_published',
          firstUsefulVisibleContentMs: emitted ? Date.now() - runtimeStartedAt : null, timingBoundary:'server_write_not_client_paint'}); } catch { /* telemetry cannot affect acceptance */ }
        transport.responseFinalized(payload);
        stageLog(responseId, 'response_flushed', handleStartedAt, { mode: 'stream', emitted: Boolean(emitted) });
      } else if (planner) {
        res.json({ success: true, data: payload });
        stageLog(responseId, 'response_flushed', handleStartedAt, { mode: 'planner' });
      } else {
        createTrailieTransportAdapter({ dialect: resolveTrailieTransportDialect(req), mode: 'terminal',
          emit: value => res.json(value) }).responseFinalized(payload);
        stageLog(responseId, 'response_flushed', handleStartedAt, { mode: 'terminal' });
      }
    } catch (error) {
      try { observe({ runtime: 'model_first', responseId, status: 'request_failed', code: error.code || 'request_failed' }); } catch { /* logging only */ }
      fail([400, 403, 404, 409].includes(error.status) ? error.status : 503,
        error.status === 404 ? 'trip_unavailable' : 'model_first_unavailable');
    } finally {
      clearInterval(heartbeat);
      cleanup();
      try { await turn?.settle(GUEST_TURN_FAILURE_CODES.BACKEND_EXCEPTION); }
      catch { /* The ledger's stale-pending recovery handles database outages. */ }
      if (streaming && res.headersSent && !res.writableEnded) res.end();
    }
  }
  router.post('/chat', authenticate, tokenAdmission, handle);
  router.post('/chat-stream', authenticate, tokenAdmission, handle);
  router.post('/chat-anonymous', handle);
  router.post('/chat-anonymous-stream', handle);
  router.post('/plan-itinerary', authenticateOptional, tokenAdmission, handle);
  return router;
}

module.exports = { createModelFirstRouter, PATHS };
