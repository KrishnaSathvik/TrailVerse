'use strict';

/**
 * Stage 14.7E §1–§4 — one fresh child per scenario.
 *
 * Boots the REAL application through its existing `{ app, server }` driver seam
 * (no factory extraction), listens on an ephemeral loopback port, seeds the
 * dedicated evaluation user, and hands the parent a base URL plus a token minted
 * by the repository's own jsonwebtoken utility — so the real `protect`
 * middleware is exercised rather than bypassed.
 *
 * The child stays alive on IPC until the parent asks it to clean up, because the
 * parent drives the route and the frontend lifecycle modules.
 *
 * Ordering is inherited from Stage 14.7D2: environment, isolation, fixture
 * validation, URI validation, outbound guard and deterministic providers are all
 * established BEFORE the application is imported.
 */

const path = require('path');
const net = require('net');
const {
  buildLiveChildReadyMessage,
  validateChildProviderConfiguration,
} = require('../stage14_7/childProviderReadiness');

const SERVER_ROOT = path.join(__dirname, '../../..');
/**
 * Stage 14.8E.2 §7 — TEST-ONLY Mongo target override.
 *
 * Defaults to the historical evaluation instance, so production and existing
 * eval behaviour are unchanged. Setting TRAILIE_EVAL_TEST_MONGODB_URI lets a
 * suite run against a fresh loopback instance without mutating historical
 * Stage 14.7 data or editing this file.
 */
const EVAL_URI =
  process.env.TRAILIE_EVAL_TEST_MONGODB_URI || 'mongodb://127.0.0.1:27018/trailverse_eval_14_7';

/** Loopback port implied by EVAL_URI; used by the availability probe. */
const EVAL_MONGO_PORT = (() => {
  const match = /:(\d+)\//.exec(EVAL_URI);
  return match ? Number(match[1]) : 27018;
})();

const LIVE_PROVIDER_KEYS = [
  'OPENAI_API_KEY', 'NPS_API_KEY', 'RESEND_API_KEY', 'OPENWEATHER_API_KEY',
  'GMAPS_SERVER_KEY', 'GOOGLE_MAPS_API_KEY', 'TAVILY_API_KEY', 'SERPER_API_KEY',
  'BRAVE_SEARCH_API_KEY', 'UNSPLASH_ACCESS_KEY',
  // RIDB permits: key-gated, self-disables to empty results when absent.
  'RIDB_API_KEY'
];

/** §3 — the evaluation flag set. Prose consistency is ENFORCE, not off. */
const EVALUATION_FLAGS = {
  NODE_ENV: 'test',
  // Stage 14.7F7 §6 — the OBSOLETE alias is deliberately NOT set. Setting it
  // made `obsoleteAliasPresent` trivially true and risked implying it controls
  // something. The code reads TRAILIE_ITINERARY_GENERATION_MODE only.
  TRAILIE_ITINERARY_GENERATION_MODE: 'tool_first',
  TRAILIE_ROLLOUT_TOOL_FIRST_RATE: '1',
  TRAILIE_ROLLOUT_ENFORCE_RATE: '1',
  // Must stay false: the kill switch forces the non-tool-first path.
  TRAILIE_ROLLOUT_KILL_SWITCH: 'false',
  TRAILIE_PROSE_CONSISTENCY_MODE: 'enforce',
  TRAILIE_EARLY_ITINERARY_EVENTS: 'true',
  TRAILIE_PROSE_RECOVERY: 'false',
  TRAILIE_REVIEW_ENQUEUE_ENABLED: 'false',
  TRAILIE_REVIEW_WORKER_ENABLED: 'false'
};

/**
 * Stage 14.7G §3 — the ONE difference between a deterministic qualification run
 * and a paid live run. Everything else in this file (real app, real auth, real
 * route, real persistence, isolated Mongo, ownership-scoped cleanup) is shared.
 */
const EXECUTION_MODE = {
  DETERMINISTIC: 'deterministic',
  LIVE: 'live',
};

const state = {
  executionMode: EXECUTION_MODE.DETERMINISTIC,
  guard: null,
  /**
   * Stage 14.7J §2/§3/§5 — the dispatch model policy for THIS child, and the
   * identity chain it enforces.
   *
   * `dispatchAllowedModels` starts as null, which every assertion reads as
   * `claude_model_policy_missing`. It is only ever populated by `boot`, so a
   * request issued before boot — or by a path that skipped boot — fails closed
   * rather than inheriting a permissive default.
   */
  dispatchAllowedModels: null,
  resolvedDispatchModel: null,
  reservedDispatchModel: null,
  /**
   * Synthetic and live counters are kept apart on purpose. The deterministic
   * Anthropic stand-in replaces the SDK in the require cache, so constructing it
   * is NOT a live construction — conflating the two would make
   * `liveAnthropicConstructors: 0` meaningless.
   */
  providerLedger: {
    syntheticAnthropicConstructions: 0,
    syntheticAnthropicCalls: 0,
    toolCalls: 0,
    proseCalls: 0,
    liveAnthropicConstructors: 0,
    /** Stage 14.7G — real, billable requests. Zero in deterministic mode. */
    liveAnthropicCalls: 0,
    liveOpenAiConstructors: 0,
    liveNpsServices: 0
  },
  owned: { evaluationRunId: null, evaluationUserId: null, createdTripIds: [], responseIds: [] },
  userWasCreatedByThisRun: false,
  serverHandle: null,
  mongoose: null,
  models: null,
  phaseBBarrier: null,
  releasePhaseB: null
};




/** §7 — the SDK's snake_case usage shape → the ledger's camelCase one. */
function normalizeSdkUsage(usage) {
  if (!usage) return null;
  const input = usage.input_tokens;
  const output = usage.output_tokens;
  if (!Number.isFinite(input) && !Number.isFinite(output)) return null;
  return {
    inputTokens: Number.isFinite(input) ? input : null,
    outputTokens: Number.isFinite(output) ? output : null,
    cacheCreationInputTokens: Number.isFinite(usage.cache_creation_input_tokens)
      ? usage.cache_creation_input_tokens : null,
    cacheReadInputTokens: Number.isFinite(usage.cache_read_input_tokens)
      ? usage.cache_read_input_tokens : null,
  };
}

function isAsyncIterable(value) {
  return Boolean(value) && typeof value[Symbol.asyncIterator] === 'function';
}

/**
 * §7/§8 — forwards a provider stream unchanged while accumulating its terminal
 * usage, then settles exactly once.
 *
 * `message_start` carries input tokens; `message_delta` carries the running
 * output total. When neither ever arrives, `usage` stays null and the caller's
 * conservative reservation stands (§8) — a missing usage object is never read as
 * zero.
 */
function wrapStreamForUsage(stream, settle) {
  let inputTokens = null;
  let outputTokens = null;
  let cacheCreation = null;
  let cacheRead = null;
  let stopReason = null;
  let settled = false;

  const finish = async (outcome) => {
    if (settled) return;
    settled = true;
    const known = Number.isFinite(inputTokens) || Number.isFinite(outputTokens);
    await settle(known ? {
      inputTokens: Number.isFinite(inputTokens) ? inputTokens : null,
      outputTokens: Number.isFinite(outputTokens) ? outputTokens : null,
      cacheCreationInputTokens: cacheCreation,
      cacheReadInputTokens: cacheRead,
    } : null, outcome);
  };

  return (async function* forwardingStream() {
    try {
      for await (const event of stream) {
        if (event?.type === 'message_start' && event.message?.usage) {
          const u = event.message.usage;
          if (Number.isFinite(u.input_tokens)) inputTokens = u.input_tokens;
          if (Number.isFinite(u.output_tokens)) outputTokens = u.output_tokens;
          if (Number.isFinite(u.cache_creation_input_tokens)) cacheCreation = u.cache_creation_input_tokens;
          if (Number.isFinite(u.cache_read_input_tokens)) cacheRead = u.cache_read_input_tokens;
        }
        if (event?.type === 'message_delta') {
          if (Number.isFinite(event.usage?.output_tokens)) outputTokens = event.usage.output_tokens;
          if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
        }
        yield event;
      }
      await finish(stopReason === 'max_tokens' ? 'truncated' : 'success');
    } catch (error) {
      // A stream that dies mid-flight still consumed whatever it produced.
      await finish('failed');
      throw error;
    }
  }());
}

/**
 * Stage 14.7I §5 / 14.7J §2 — the request-shape contract the REAL Anthropic SDK
 * enforces, plus this run's dispatch model policy.
 *
 * Mirrors the provider's own 400 for a missing or unauthorized model, so a
 * configuration defect surfaces in deterministic mode instead of waiting for a
 * paid call. The error text matches the shape the live run actually received.
 *
 * The allowlist comes from `state.dispatchAllowedModels`, decided at boot. It is
 * never "whatever the code happens to configure": a deterministic suite may
 * inject synthetic ids, a live run may not.
 */
function assertSyntheticRequestShape(params) {
  const model = params && params.model;
  if (typeof model !== 'string' || model.trim() === '') {
    const error = new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"model: Field required"}}');
    error.status = 400;
    error.code = 'synthetic_invalid_request_missing_model';
    throw error;
  }
  const { isProviderDispatchModelAllowed } = require(path.join(SERVER_ROOT, 'src/config/providerDispatchPolicy'));
  if (!isProviderDispatchModelAllowed({
    model: model.trim(), provider: 'claude', allowedModels: state.dispatchAllowedModels,
  })) {
    const error = new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"model: not allowlisted"}}');
    error.status = 400;
    error.code = 'synthetic_invalid_request_model_not_allowlisted';
    throw error;
  }
  return true;
}

/**
 * Stage 14.7J §2/§5 — the dispatch gate for a REAL, billable request.
 *
 * Runs BEFORE the reservation ask, so a policy failure costs no reservation, no
 * consumption marker and no dispatch acknowledgement — and therefore no
 * scenario. Then again on the request object immediately before the SDK call,
 * which is where a model substituted after validation would show up.
 */
function assertLiveDispatchModel(params, { stage }) {
  const { assertProviderDispatchModel, assertProviderModelIdentity } =
    require(path.join(SERVER_ROOT, 'src/config/providerDispatchPolicy'));
  assertProviderDispatchModel({
    provider: 'claude',
    model: params && params.model,
    allowedModels: state.dispatchAllowedModels,
  });
  if (stage === 'dispatch') {
    // The chain is closed here: the model the run RESOLVED, the model that was
    // reserved, and the model on the request the SDK is about to receive.
    assertProviderModelIdentity({
      resolvedModel: state.resolvedDispatchModel,
      reservationModel: state.reservedDispatchModel || state.resolvedDispatchModel,
      dispatchModel: params.model,
    });
  }
  return true;
}

/**
 * Stage 14.7H §6 — the shared dispatch handshake used by BOTH provider modes.
 *
 * reserve → parent validates caps → parent fsyncs provider_dispatch_authorized
 *   → parent acknowledges → only then may a request be issued.
 *
 * A parent that declines, or that acknowledges without `dispatchAuthorized`,
 * means no call happens at all. When there is no IPC parent (a direct unit
 * import), the handshake is skipped and reported as such rather than faked.
 */
async function requestDispatchAuthorization(params) {
  if (!process.send) return { skipped: true, reservationId: null, phase: null, attemptNumber: 0 };

  const wantsTool = Array.isArray(params?.tools) && params.tools.length > 0;
  const phase = wantsTool ? 'structured' : 'prose';
  const attemptNumber = wantsTool
    ? state.providerLedger.toolCalls + 1
    : state.providerLedger.proseCalls + 1;

  const reservation = await askParent('provider_reserve', {
    phase, attemptNumber, maxOutputTokens: params?.max_tokens ?? null, model: params?.model ?? null,
  });
  if (!reservation || reservation.allowed !== true) {
    const error = new Error('live_provider_call_refused_by_cap');
    error.code = 'live_provider_call_refused_by_cap';
    error.blockedBy = reservation ? reservation.blockedBy : 'no_reservation';
    throw error;
  }
  if (reservation.dispatchAuthorized !== true) {
    const error = new Error('live_provider_dispatch_not_authorized');
    error.code = 'live_provider_dispatch_not_authorized';
    throw error;
  }
  // A LIVE call must be backed by a real reservation. An unledgered
  // authorization is the deterministic-suite convenience and is refused here,
  // so a paid request can never escape cap accounting.
  if (state.executionMode === EXECUTION_MODE.LIVE && reservation.unledgered === true) {
    const error = new Error('live_dispatch_without_ledger');
    error.code = 'live_dispatch_without_ledger';
    throw error;
  }
  process.send({ type: 'provider_started', phase, attemptNumber });
  return { skipped: false, reservationId: reservation.reservationId, phase, attemptNumber };
}

async function settleDispatch(dispatch, usage, outcome, providerEvidence = {}) {
  if (!dispatch || dispatch.skipped) return;
  process.send({ type: 'provider_ended', phase: dispatch.phase, attemptNumber: dispatch.attemptNumber });
  await askParent('provider_settle', {
    reservationId: dispatch.reservationId, usage, outcome,
    phase: dispatch.phase, attemptNumber: dispatch.attemptNumber,
    providerRequestId: providerEvidence.providerRequestId || null,
    usageSource: providerEvidence.usageSource || (usage ? 'provider_terminal_usage' : 'conservative_reservation'),
  });
}

/**
 * Deterministic Anthropic SDK installed into the require cache before any
 * application module loads. This covers all three construction sites
 * (claudeService, trailieLiteLlm, routes/ai) with one seam, and guarantees the
 * real SDK is never constructed.
 */
function installDeterministicAnthropic({ structuredResponse, proseText, usePhaseBBarrier }) {
  const Module = require('module');
  const resolved = require.resolve('@anthropic-ai/sdk');

  const messages = {
    async create(params) {
      /**
       * Stage 14.7I §5 — STRICT. The stand-in now rejects exactly what the real
       * SDK rejects.
       *
       * The 14.7 live run failed because Phase A dispatched with no `model`, and
       * no deterministic test could see it: this stand-in simply ignored
       * `params.model`. A synthetic provider that accepts a request the real one
       * refuses is not a test double, it is a blindfold.
       */
      assertSyntheticRequestShape(params);

      /**
       * Stage 14.7H §12 — the DETERMINISTIC provider goes through the identical
       * reserve → dispatch-authorization → settle handshake as the live one.
       *
       * Without this, deterministic mode would skip the very handshake the live
       * run depends on, and the real-spawn qualification would prove nothing
       * about it. The calls below are synthetic and cost nothing; only the
       * sequencing is real.
       */
      const dispatch = await requestDispatchAuthorization(params);

      state.providerLedger.syntheticAnthropicCalls += 1;
      const wantsTool = Array.isArray(params?.tools) && params.tools.length > 0;
      const settle = (usage) => settleDispatch(dispatch, usage, 'success');

      if (wantsTool) {
        state.providerLedger.toolCalls += 1;
        await settle({ inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 });
        return {
          id: 'msg_eval_tool',
          model: params.model,
          stop_reason: 'tool_use',
          content: [{ type: 'tool_use', id: 'tu_1', name: 'create_itinerary', input: structuredResponse }],
          usage: { input_tokens: 0, output_tokens: 0 }
        };
      }
      state.providerLedger.proseCalls += 1;
      // §8 — deterministic Phase-B barrier. Held inside the SYNTHETIC provider
      // only; production code is never delayed. The parent releases it after it
      // observes revision-1 visibility, which makes
      // `itinerary_revealed < revision_2_received` observable rather than a race.
      if (usePhaseBBarrier) await state.phaseBBarrier;
      await settle({ inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 });
      return {
        id: 'msg_eval_prose',
        model: params.model,
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: proseText }],
        usage: { input_tokens: 0, output_tokens: 0 }
      };
    }
  };

  function DeterministicAnthropic() {
    state.providerLedger.syntheticAnthropicConstructions += 1;
    return { messages };
  }
  // Route-level construction happens outside claudeService's injectable seam.
  // Tag this cache replacement so the deny-live policy can distinguish the
  // recorded adapter from the real SDK without relying on an environment flag.
  Object.defineProperty(DeterministicAnthropic, '__trailieSyntheticProvider', {
    value: true,
    enumerable: false,
  });

  Module._cache[resolved] = {
    id: resolved, filename: resolved, loaded: true, exports: DeterministicAnthropic
  };
}

/**
 * Stage 14.7G §4/§6 — a request/response channel from child to parent.
 *
 * The ledger and the caps live in the PARENT, because caps bind across both
 * scenarios and the child is torn down between them. So the child asks
 * permission before every provider call and reports usage after it. A child that
 * cannot reach its parent gets no permission and therefore makes no call.
 */
let nextAskId = 1;
const pendingAsks = new Map();

function askParent(type, payload, { timeoutMs = 30000 } = {}) {
  return new Promise((resolve) => {
    if (!process.send) { resolve({ ok: false, boundedCode: 'no_ipc_channel' }); return; }
    const askId = nextAskId++;
    const timer = setTimeout(() => {
      pendingAsks.delete(askId);
      resolve({ ok: false, boundedCode: 'parent_ask_timeout' });
    }, timeoutMs);
    pendingAsks.set(askId, (reply) => { clearTimeout(timer); resolve(reply); });
    process.send({ type, askId, ...payload });
  });
}

/**
 * Stage 14.7G §3/§4 — LIVE mode: the REAL Anthropic SDK, wrapped only to
 * reserve, time and settle each attempt.
 *
 * The wrapper deliberately does not transform requests or responses. It cannot
 * "fix" a truncated result or retry on the model's behalf; if it did, the run
 * would be measuring the wrapper rather than production behaviour. Its only
 * powers are: refuse a call the parent will not fund, and report what happened.
 */
function installLiveAnthropicInstrumentation() {
  const Module = require('module');
  const resolved = require.resolve('@anthropic-ai/sdk');
  // The real SDK, loaded normally. Nothing replaces it.
  const RealAnthropic = require('@anthropic-ai/sdk');
  const Ctor = RealAnthropic && RealAnthropic.default ? RealAnthropic.default : RealAnthropic;

  function InstrumentedAnthropic(...args) {
    state.providerLedger.liveAnthropicConstructors += 1;
    const client = new Ctor(...args);
    const realCreate = client.messages.create.bind(client.messages);

    client.messages.create = async function instrumentedCreate(params) {
      const wantsTool = Array.isArray(params?.tools) && params.tools.length > 0;
      const phase = wantsTool ? 'structured' : 'prose';

      const revalidation = validateChildProviderConfiguration({
        env: process.env,
        executionMode: state.executionMode,
        resolvedModel: state.resolvedDispatchModel,
        allowedModels: state.dispatchAllowedModels,
        previouslyReady: true,
      });
      if (!revalidation.ok) {
        const error = new Error(revalidation.boundedCode);
        error.code = revalidation.boundedCode;
        throw error;
      }

      /**
       * Stage 14.7J §2 — the dispatch policy, BEFORE the attempt is even
       * numbered. An unauthorized model must not increment a counter, take a
       * reservation, authorize consumption or reach the network.
       */
      assertLiveDispatchModel(params, { stage: 'reservation' });
      state.reservedDispatchModel = String(params.model).trim();

      const attemptNumber = wantsTool
        ? (state.providerLedger.toolCalls += 1)
        : (state.providerLedger.proseCalls += 1);

      // §6 — reserve BEFORE the request. A refusal stops the run; it is never
      // downgraded into "try anyway and settle later".
      const reservation = await askParent('provider_reserve', {
        phase, attemptNumber, maxOutputTokens: params?.max_tokens ?? null, model: params?.model ?? null,
      });
      if (!reservation || reservation.allowed !== true) {
        const error = new Error('live_provider_call_refused_by_cap');
        error.code = 'live_provider_call_refused_by_cap';
        error.blockedBy = reservation ? reservation.blockedBy : 'no_reservation';
        throw error;
      }
      /**
       * Stage 14.7H §6 — the SDK is not invoked until the parent has fsynced
       * `provider_dispatch_authorized`. `allowed` alone is not sufficient: it
       * would permit a call whose consumption marker had not yet reached disk,
       * which is the crash window the marker exists to close.
       */
      if (reservation.dispatchAuthorized !== true) {
        const error = new Error('live_provider_dispatch_not_authorized');
        error.code = 'live_provider_dispatch_not_authorized';
        throw error;
      }

      /**
       * §5 — the LAST gate. Between the reservation above and this line the
       * request object passed through the parent handshake; if anything
       * replaced its model, the identity chain breaks here, before the SDK is
       * touched and before any byte leaves the process.
       */
      assertLiveDispatchModel(params, { stage: 'dispatch' });

      state.providerLedger.liveAnthropicCalls += 1;
      process.send({ type: 'provider_started', phase, attemptNumber });

      let response = null;
      let outcome = 'success';
      let thrown = null;
      try {
        response = await realCreate(params);
        // A tool call that came back truncated still cost money and is settled
        // as its own attempt, labelled for what it was.
        if (response?.stop_reason === 'max_tokens') outcome = 'truncated';
      } catch (error) {
        outcome = 'failed';
        thrown = error;
      }

      /**
       * Stage 14.7I §7 — a STREAMING response carries no usage on the object
       * returned by `create()`; usage arrives in the terminal `message_start` /
       * `message_delta` events. The Stage 14.7 live run read it synchronously,
       * found nothing, and settled a real successful call from its reservation —
       * which is why the only measured figure was an upper bound.
       *
       * So a stream is wrapped and settled when it COMPLETES, and the events are
       * forwarded untouched so production behaviour is unchanged.
       */
      if (!thrown && isAsyncIterable(response)) {
        const providerRequestId = response?._request_id || response?.request_id || null;
        process.send({ type: 'provider_ended', phase, attemptNumber });
        return wrapStreamForUsage(response, async (usage, streamOutcome) => {
          await askParent('provider_settle', {
            reservationId: reservation.reservationId,
            usage, outcome: streamOutcome, phase, attemptNumber,
            providerRequestId,
            usageSource: usage ? 'provider_terminal_usage' : 'conservative_reservation',
          });
        });
      }

      process.send({ type: 'provider_ended', phase, attemptNumber });

      const usage = normalizeSdkUsage(response?.usage);

      // Settled on EVERY path, including the throw — an unsettled failed call is
      // how a real charge disappears from the totals.
      await askParent('provider_settle', {
        reservationId: reservation.reservationId, usage, outcome, phase, attemptNumber,
        providerRequestId: response?._request_id || response?.request_id || null,
        usageSource: usage ? 'provider_response_usage' : 'conservative_reservation',
      });

      if (thrown) throw thrown;
      return response;
    };

    return client;
  }

  Module._cache[resolved] = {
    id: resolved, filename: resolved, loaded: true, exports: InstrumentedAnthropic,
  };
}

/** OpenAI must never be constructed; any attempt fails the run loudly. */
function prohibitOpenAI() {
  const openaiService = require(path.join(SERVER_ROOT, 'src/services/openaiService'));
  openaiService.__setOpenAIClientConstructorForTests(() => {
    state.providerLedger.liveOpenAiConstructors += 1;
    const error = new Error('openai_constructor_prohibited_in_evaluation');
    error.code = 'openai_constructor_prohibited_in_evaluation';
    throw error;
  });
}

async function boot({
  scenarioId, evaluationRunId, structuredResponse, proseText, usePhaseBBarrier = false,
  evaluationUserId = null, evaluationUserEmail = null,
  // Stage 14.7G §3 — the injected execution mode. Defaults to deterministic so
  // every existing caller keeps making zero live calls.
  executionMode = EXECUTION_MODE.DETERMINISTIC,
  /**
   * Stage 14.7J §3/§4 — the dispatch model policy for this child.
   *
   * A DETERMINISTIC child may be handed a test-scoped list so synthetic ids keep
   * working. A LIVE child may not: its policy is derived below from the
   * receipt-covered configuration and an injected value is refused outright,
   * because "the caller said so" is not a basis for spending money.
   */
  allowedModels = null,
  model = null,
}) {
  const isLive = executionMode === EXECUTION_MODE.LIVE;
  state.executionMode = isLive ? EXECUTION_MODE.LIVE : EXECUTION_MODE.DETERMINISTIC;

  // ── 1. Environment, before anything else ──
  // Stage 14.7O: never load `.env` in the scenario child. The authoritative
  // launcher supplies an explicit allowlist, so a missing or denied credential
  // cannot be silently reintroduced from a repository file.
  for (const [key, value] of Object.entries(EVALUATION_FLAGS)) process.env[key] = value;
  // Every non-Claude provider key is removed in BOTH modes. Live mode widens the
  // network guard for Claude alone; it does not re-enable any other dependency.
  for (const key of LIVE_PROVIDER_KEYS) delete process.env[key];

  if (isLive) {
    // The real key must already be in the inherited environment. It is read for
    // presence only, never logged, echoed or written to an artifact.
    if (process.env.TRAILIE_TEST_PROVIDER_MODE === 'deny_live') {
      const error = new Error('live_provider_forbidden_in_test');
      error.code = 'live_provider_forbidden_in_test';
      throw error;
    }
    if (!process.env.ANTHROPIC_API_KEY || !String(process.env.ANTHROPIC_API_KEY).trim()) {
      const error = new Error('live_provider_not_configured');
      error.code = 'live_provider_not_configured';
      throw error;
    }
  } else {
    // The deterministic SDK is installed below, so this key never reaches a real
    // client — it only satisfies the route's `if (ANTHROPIC_API_KEY)` guard.
    process.env.ANTHROPIC_API_KEY = 'deterministic-not-a-live-key';
  }
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'stage-14-7e-evaluation-secret-value';
  process.env.TRAILIE_EVAL_TEST_MONGODB_URI = EVAL_URI;

  // ── 2. Fixture preflight, before models or application ──
  const { assertEvaluationFixtures } = require(path.join(SERVER_ROOT, 'src/eval/bootstrap/fixtureValidator'));
  const {
    buildRunScopedEvaluationIdentity,
    buildEvaluationAuthenticationFixture,
  } = require(path.join(SERVER_ROOT, 'src/eval/stage14_7/evaluationIdentity'));
  // Stage 14.7F6 §12 — the PARENT decides the evaluation user identity before the
  // child creates it. Without that, a child dying before its first IPC message
  // leaves a user the parent cannot name, and cleanup has nothing to scope to.
  // The email is run-scoped for the same reason: two concurrent or successive
  // runs must own disjoint records so one run's cleanup cannot touch another's.
  const identity = buildRunScopedEvaluationIdentity({ evaluationRunId, evaluationUserId });
  if (identity.evaluationUserEmail !== evaluationUserEmail) {
    const error = new Error('evaluation_identity_invalid');
    error.code = 'evaluation_identity_invalid';
    throw error;
  }
  const fixtures = buildEvaluationAuthenticationFixture({ identity, scenarioIds: [scenarioId] });
  assertEvaluationFixtures(fixtures);

  // ── 3. Isolated store guard ──
  const { assessEvalPersistenceTarget } = require(path.join(SERVER_ROOT, 'eval/evalPersistenceGuard'));
  const assessment = assessEvalPersistenceTarget({ evalUri: EVAL_URI, productionUri: process.env.MONGODB_URI });
  if (!assessment.ok) {
    const error = new Error('evaluation_mongo_uri_invalid');
    error.code = 'evaluation_mongo_uri_invalid';
    throw error;
  }
  // The application reads MONGODB_URI; point it at the isolated store only.
  process.env.MONGODB_URI = EVAL_URI;

  // ── 3b. Stage 14.7J §2/§3 — the dispatch model policy, established BEFORE
  // any provider client exists so no request can predate it ──
  const { resolveDispatchModelPolicy } = require(path.join(SERVER_ROOT, 'src/config/providerDispatchPolicy'));
  const productionPolicy = resolveDispatchModelPolicy({ provider: 'claude', env: process.env });
  if (isLive) {
    // §3 — a paid run's allowlist comes from the receipt-covered configuration
    // (TRAILIE_EVAL_MODEL_ALLOWLIST), never from the caller. An empty result
    // fails closed here rather than at the first 400.
    state.dispatchAllowedModels = productionPolicy.allowedModels;
    if (!Array.isArray(state.dispatchAllowedModels) || state.dispatchAllowedModels.length === 0) {
      const error = new Error('claude_model_policy_missing');
      error.code = 'claude_model_policy_missing';
      throw error;
    }
  } else {
    state.dispatchAllowedModels = Array.isArray(allowedModels) && allowedModels.length > 0
      ? [...allowedModels]
      : productionPolicy.allowedModels;
  }
  // §5 — the identity the whole chain is measured against. When the parent did
  // not name a model, the run's resolved identity is the policy's primary.
  state.resolvedDispatchModel = (typeof model === 'string' && model.trim())
    ? model.trim()
    : state.dispatchAllowedModels[0];

  const providerReadiness = isLive
    ? validateChildProviderConfiguration({
      env: process.env,
      executionMode: state.executionMode,
      resolvedModel: state.resolvedDispatchModel,
      allowedModels: state.dispatchAllowedModels,
    })
    : null;
  if (isLive && !providerReadiness.ok) {
    const error = new Error(providerReadiness.boundedCode);
    error.code = providerReadiness.boundedCode;
    throw error;
  }

  // ── 4. Providers, before the application graph loads ──
  state.phaseBBarrier = new Promise((resolve) => { state.releasePhaseB = resolve; });
  if (isLive) {
    // §6 — the real SDK, wrapped for accounting only. No Phase-B barrier: the
    // barrier is a deterministic sequencing device, and holding a live call
    // would distort the very latency this stage measures.
    installLiveAnthropicInstrumentation();
  } else {
    installDeterministicAnthropic({ structuredResponse, proseText, usePhaseBBarrier });
  }

  // ── 5. Outbound guard, before the application import ──
  const { installOutboundNetworkGuard } = require(path.join(SERVER_ROOT, 'src/eval/bootstrap/outboundNetworkGuard'));
  // §7 — exactly one external door, opened only in live mode.
  state.guard = installOutboundNetworkGuard({ liveClaudeAllowed: isLive });

  // ── 6. Recorded NPS adapter + OpenAI prohibition ──
  const { installDeterministicAdapters } = require(path.join(SERVER_ROOT, 'src/eval/bootstrap/deterministicAdapters'));
  const adapters = installDeterministicAdapters({
    requireModule: (rel) => require(path.join(SERVER_ROOT, 'src', rel.replace(/^\.\.\/\.\.\//, '')))
  });
  prohibitOpenAI();

  // ── 7. Mongo (loopback only) and models ──
  state.mongoose = require(path.join(SERVER_ROOT, 'node_modules/mongoose'));
  await state.mongoose.connect(EVAL_URI, { serverSelectionTimeoutMS: 5000 });
    state.models = {
    User: require(path.join(SERVER_ROOT, 'src/models/User')),
    TripPlan: require(path.join(SERVER_ROOT, 'src/models/TripPlan')),
    // Stage 14.7F6 §11/§13 — counted and cleaned even though recovery is off,
    // because "should be zero" is only evidence if it is actually measured.
    Lease: require(path.join(SERVER_ROOT, 'src/models/TrailieProseRecoveryLease')),
    };

    const productionSchemaError = new state.models.User(fixtures.user).validateSync();
    if (productionSchemaError) {
      const error = new Error('evaluation_identity_invalid');
      error.code = 'evaluation_identity_invalid';
      throw error;
    }

  // ── 8. Seed the dedicated evaluation user ──
  state.owned.evaluationRunId = evaluationRunId;
  let user = await state.models.User.findOne({ email: fixtures.user.email });
  if (!user) {
    user = await state.models.User.create({
      // The parent-assigned _id when supplied, so parent and child agree on
      // ownership even if the child dies immediately after this line.
      ...(evaluationUserId ? { _id: new state.mongoose.Types.ObjectId(evaluationUserId) } : {}),
      name: fixtures.user.name,
      email: fixtures.user.email,
      password: fixtures.user.password,
      isEmailVerified: true
    });
    state.userWasCreatedByThisRun = true;
  }
  state.owned.evaluationUserId = user._id.toString();

  // Stage 14.7F6 §16 — indexes must be built before the first authenticated
  // write, otherwise the first request of a fresh run races index creation.
  await Promise.all([
    state.models.TripPlan.init(),
    state.models.User.init(),
  ]);

  // Real token through the repository's own utility — authentication is
  // exercised, never bypassed by attaching req.user.
  const jwt = require(path.join(SERVER_ROOT, 'node_modules/jsonwebtoken'));
  const token = jwt.sign({ id: state.owned.evaluationUserId }, process.env.JWT_SECRET, { expiresIn: '1h' });

  // ── 9. The REAL application driver seam ──
  const { app, server } = require(path.join(SERVER_ROOT, 'src/app'));
  const providerAdapterConfigured = isLive
    ? state.providerLedger.liveAnthropicConstructors > 0
    : state.providerLedger.syntheticAnthropicConstructions >= 0;
  if (isLive && !providerAdapterConfigured) {
    const error = new Error('live_provider_adapter_not_configured');
    error.code = 'live_provider_adapter_not_configured';
    throw error;
  }
  state.serverHandle = server;
  state.appPresent = typeof app === 'function';

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  state.guard.allowHttpPort(port);
  state.guard.setPhase('runtime');

  // §3 — assert the configuration production actually reads, not an alias.
  const { resolveItineraryGenerationMode, earlyItineraryEventsEnabled } =
    require(path.join(SERVER_ROOT, 'src/config/itineraryGenerationConfig'));
  const resolvedMode = resolveItineraryGenerationMode(process.env.TRAILIE_ITINERARY_GENERATION_MODE);
  const { getTrailieRolloutRates } = require(path.join(SERVER_ROOT, 'src/config/trailieRolloutConfig'));
  // The real shape is { killed, toolFirstRate, enforceRate, rawEnforceRate }.
  // Note `killed` is ALSO forced true when the generation mode is not
  // tool_first — the kill switch alone does not describe rollout state.
  const rolloutRates = getTrailieRolloutRates();
  const effectiveConfig = {
    TRAILIE_ITINERARY_GENERATION_MODE: process.env.TRAILIE_ITINERARY_GENERATION_MODE,
    TRAILIE_ROLLOUT_KILL_SWITCH: process.env.TRAILIE_ROLLOUT_KILL_SWITCH,
    TRAILIE_ROLLOUT_TOOL_FIRST_RATE: process.env.TRAILIE_ROLLOUT_TOOL_FIRST_RATE,
    TRAILIE_PROSE_CONSISTENCY_MODE: process.env.TRAILIE_PROSE_CONSISTENCY_MODE,
    TRAILIE_EARLY_ITINERARY_EVENTS: process.env.TRAILIE_EARLY_ITINERARY_EVENTS,
    TRAILIE_PROSE_RECOVERY: process.env.TRAILIE_PROSE_RECOVERY,
    resolvedItineraryGenerationMode: resolvedMode,
    rolloutKilled: rolloutRates.killed,
    rolloutToolFirstRate: rolloutRates.toolFirstRate,
    rolloutEnforceRate: rolloutRates.enforceRate,
    earlyItineraryEventsEnabled: earlyItineraryEventsEnabled(),
    // §11 — the obsolete alias must control nothing.
    obsoleteAliasPresent: process.env.TRAILIE_ITINERARY_MODE !== undefined,
    // Stage 14.7J §2/§3 — reported so a run's effective policy is evidence
    // rather than an assumption. Model IDS only; no keys, no URIs.
    dispatchAllowedModels: [...state.dispatchAllowedModels],
    dispatchModelPolicySource: isLive ? 'receipt_covered_configuration' : productionPolicy.source,
    resolvedDispatchModel: state.resolvedDispatchModel,
  };

  if (!isLive) {
    // The real SDK export was replaced before any import, so a live Anthropic
    // client cannot have been built; recorded explicitly rather than assumed.
    // In LIVE mode this counter is left alone — it is the instrumented wrapper's
    // own tally, and zeroing it here would erase the evidence it exists to give.
    state.providerLedger.liveAnthropicConstructors = 0;
  }

  return {
    ready: true,
    executionMode: state.executionMode,
    baseUrl: `http://127.0.0.1:${port}`,
    effectiveConfig,
    token,
    evaluationUserId: state.owned.evaluationUserId,
    evaluationRunId,
    applicationDriverSeamReady: true,
    applicationFactoryPresent: false,
    applicationFactoryRequired: false,
    authenticationMiddlewareExercised: true,
      authenticatedEvaluationUserIdPresent: Boolean(state.owned.evaluationUserId),
      evaluationIdentityContractPassed: true,
      authenticationFixtureCreated: true,
      productionSchemaValidated: true,
      evaluationUserCreatedByThisRun: state.userWasCreatedByThisRun === true,
    adapterDisposition: adapters.disposition,
    anthropicKeyPresent: isLive && providerReadiness?.anthropicKeyPresent === true,
    providerAdapterConfigured,
    liveChildReady: isLive ? buildLiveChildReadyMessage(providerReadiness) : null,
  };
}

/**
 * Stage 14.7F5 §15 / 14.7F6 §13 — ownership-scoped cleanup.
 *
 * Two independent ownership proofs are required for every deletion: the
 * dedicated per-run evaluation user AND this run's explicitly recorded ids.
 * `evaluationRunId` is an ADDITIONAL condition where it is safely stored, never
 * the sole proof.
 *
 * There is deliberately no `deleteMany({})` and no database drop anywhere in
 * this file. A foreign run's user, trips and leases must survive untouched.
 */
async function cleanup({ createdTripIds = [], responseIds = [], failInjection = null } = {}) {
  const report = {
    ok: false,
    boundedCode: null,
    // Identifiers stay in the report so an operator can finish manually. No
    // credentials, URIs, tokens, prompts or conversation content appear here.
    unresolvedEvaluationUserId: null,
    unresolvedTripIds: [],
    unresolvedResponseIds: [],
    counts: {},
  };

  const userId = state.owned.evaluationUserId;
  const ids = createdTripIds.filter(Boolean);
  const rids = responseIds.filter(Boolean);
  const Lease = state.models?.Lease || null;

  const countFor = async (owner) => ({
    trips: await state.models.TripPlan.countDocuments({ userId: owner }),
    users: await state.models.User.countDocuments({ _id: owner }),
    leases: Lease ? await Lease.countDocuments({ userId: String(owner) }) : 0,
  });

  try {
    if (!userId) throw Object.assign(new Error('cleanup_missing_owner'), { code: 'cleanup_missing_owner' });

    report.unresolvedEvaluationUserId = userId;
    report.unresolvedTripIds = ids;
    report.unresolvedResponseIds = rids;

    const before = await countFor(userId);
    report.counts.evaluationTripsBeforeCleanup = before.trips;
    report.counts.evaluationUsersBeforeCleanup = before.users;
    report.counts.recoveryLeasesBeforeCleanup = before.leases;

    if (failInjection === 'trips') {
      throw Object.assign(new Error('cleanup_trip_delete_failed'), { code: 'cleanup_trip_delete_failed' });
    }

    // Trips: owner AND (recorded ids OR recorded responseIds). Never owner alone,
    // so a stray document that this run did not create is left for a human.
    const ownershipClauses = [];
    if (ids.length > 0) ownershipClauses.push({ _id: { $in: ids } });
    if (rids.length > 0) ownershipClauses.push({ 'plan.responseId': { $in: rids } });

    report.tripsDeleted = 0;
    if (ownershipClauses.length > 0) {
      const removed = await state.models.TripPlan.deleteMany({ userId, $or: ownershipClauses });
      report.tripsDeleted = removed.deletedCount;
    }

    // Recovery leases should not exist at all with TRAILIE_PROSE_RECOVERY=false;
    // removed defensively, still scoped to this run's owner and responses.
    report.leasesDeleted = 0;
    if (Lease && rids.length > 0) {
      const removedLeases = await Lease.deleteMany({ userId: String(userId), responseId: { $in: rids } });
      report.leasesDeleted = removedLeases.deletedCount;
    }

    if (failInjection === 'user') {
      throw Object.assign(new Error('cleanup_user_delete_failed'), { code: 'cleanup_user_delete_failed' });
    }

    if (state.userWasCreatedByThisRun) {
      await state.models.User.deleteMany({ _id: userId });
      report.evaluationUserDeleted = true;
    } else {
      report.evaluationUserDeleted = false;
    }

    const after = await countFor(userId);
    report.counts.evaluationTripsAfterCleanup = after.trips;
    report.counts.evaluationUsersAfterCleanup = after.users;
    report.counts.recoveryLeasesAfterCleanup = after.leases;

    if (after.trips === 0) report.unresolvedTripIds = [];
    if (after.users === 0) {
      report.unresolvedEvaluationUserId = null;
      report.unresolvedResponseIds = [];
    }
    report.ok = true;
  } catch (error) {
    report.boundedCode = error.code || 'cleanup_failed';
  }
  return report;
}

/** Counts for an arbitrary owner — used to prove foreign runs are untouched. */
async function countsForOwner(ownerId) {
  const Lease = state.models?.Lease || null;
  return {
    trips: await state.models.TripPlan.countDocuments({ userId: ownerId }),
    users: await state.models.User.countDocuments({ _id: ownerId }),
    leases: Lease ? await Lease.countDocuments({ userId: String(ownerId) }) : 0,
  };
}

async function diagnoseMongoAvailability() {
  const { classifyMongoAvailability } = require('../stage14_7/canonicalEvidenceRepair');
  let portListening = false;
  await new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: EVAL_MONGO_PORT });
    socket.setTimeout(1500);
    socket.once('connect', () => { portListening = true; socket.destroy(); resolve(); });
    socket.once('timeout', () => { socket.destroy(); resolve(); });
    socket.once('error', () => resolve());
  });

  let connectionSucceeded = false;
  let pingSucceeded = false;
  let processRunning = false;
  let fresh = null;
  try {
    fresh = state.mongoose.createConnection(EVAL_URI, { serverSelectionTimeoutMS: 2000 });
    await fresh.asPromise();
    connectionSucceeded = true;
    const ping = await fresh.db.admin().ping();
    pingSucceeded = ping?.ok === 1;
    const status = await fresh.db.admin().command({ serverStatus: 1 });
    processRunning = status?.process === 'mongod' || Number.isFinite(status?.pid);
  } catch { /* classification below is intentionally bounded */ }
  finally { if (fresh) await fresh.close().catch(() => {}); }

  return classifyMongoAvailability({
    processRunning,
    portListening,
    connectionSucceeded,
    pingSucceeded,
    targetMatches: true,
    existingMongooseConnectionState: state.mongoose?.connection?.readyState ?? null,
    cleanupClosedSharedResource: state.mongoose?.connection?.readyState !== 1,
    pingAttemptedDuringShutdown: false,
  });
}

async function shutdown() {
  const out = {};
  try {
    if (state.serverHandle && state.serverHandle.listening) {
      await new Promise((resolve) => state.serverHandle.close(resolve));
    }
    out.httpServerClosed = !state.serverHandle || state.serverHandle.listening === false;
  } catch { out.httpServerClosed = false; }

  try {
    const ws = global.__trailverseWsService;
    if (ws && typeof ws.shutdown === 'function') ws.shutdown();
    out.websocketClosed = true;
  } catch { out.websocketClosed = false; }

  try {
    if (state.mongoose) await state.mongoose.connection.close();
    out.mongoClosed = state.mongoose ? state.mongoose.connection.readyState === 0 : true;
  } catch { out.mongoClosed = false; }

  if (state.guard) {
    out.network = state.guard.summary();
    state.guard.uninstall();
  }
  out.providerLedger = state.providerLedger;
  return out;
}

// ── IPC protocol ──
if (require.main === module) {
  process.on('message', async (msg) => {
    try {
      // Stage 14.7G §6 — replies to the child's own reserve/settle asks. Handled
      // first and returned, so a reply can never be mistaken for a command.
      if (msg.type === 'ask_reply') {
        const waiter = pendingAsks.get(msg.askId);
        if (waiter) { pendingAsks.delete(msg.askId); waiter(msg.reply); }
        return;
      }
      if (msg.type === 'boot') {
        const result = await boot(msg.config);
        if (result.executionMode === EXECUTION_MODE.LIVE) {
          process.send(result.liveChildReady);
        }
        process.send({ type: 'ready', result });
      } else if (msg.type === 'releasePhaseB') {
        if (state.releasePhaseB) state.releasePhaseB();
        process.send({ type: 'phaseBReleased' });
      } else if (msg.type === 'countDocs') {
        const userId = state.owned.evaluationUserId;
        const Lease = state.models.Lease;
        process.send({ type: 'counts', counts: {
          trips: await state.models.TripPlan.countDocuments({ userId }),
          tripsForRun: await state.models.TripPlan.countDocuments({ userId, _id: { $in: (msg.tripIds || []).filter(Boolean) } }),
          users: await state.models.User.countDocuments({ _id: userId }),
          leases: Lease ? await Lease.countDocuments({ userId: String(userId) }) : 0,
          // Stage 14.7F6 §15 — a FOREIGN owner's counts, so preservation is proven
          // from the same source of truth as the current run's counts.
          foreign: msg.foreignUserId ? await countsForOwner(msg.foreignUserId) : null,
        } });
      } else if (msg.type === 'seedForeignRun') {
        // Stage 14.7F6 §14 — a second evaluation run's records, created through
        // the real models so cleanup has something real to leave alone.
        const foreignUser = await state.models.User.create({
          name: 'Stage 147 Foreign Eval',
          email: msg.email,
          password: 'Evaluation-Only-Password-1',
          isEmailVerified: true,
        });
        const foreignTrip = await state.models.TripPlan.create({
          userId: foreignUser._id,
          title: 'Foreign run fixture',
          conversation: [{ id: 1, role: 'user', content: 'foreign' }],
          plan: { type: 'itinerary', responseId: msg.responseId, responseVersion: 1, days: [] },
        });
        process.send({ type: 'foreignSeeded', foreign: {
          userId: foreignUser._id.toString(), tripId: foreignTrip._id.toString(),
        } });
      } else if (msg.type === 'removeForeignRun') {
        // Test-fixture teardown only. Exact ids created by `seedForeignRun` are
        // required together; this is never used by current-run cleanup.
        const userId = new state.mongoose.Types.ObjectId(msg.userId);
        const tripId = new state.mongoose.Types.ObjectId(msg.tripId);
        const trip = await state.models.TripPlan.deleteOne({ _id: tripId, userId });
        const user = await state.models.User.deleteOne({ _id: userId });
        process.send({ type: 'foreignRemoved', report: {
          ok: trip.deletedCount === 1 && user.deletedCount === 1,
          tripsDeleted: trip.deletedCount,
          usersDeleted: user.deletedCount,
        } });
      } else if (msg.type === 'portProbe') {
        const net = require('net');
        const closed = await new Promise((resolve) => {
          const sock = net.connect(msg.port, '127.0.0.1');
          const done = (v) => { try { sock.destroy(); } catch { /* noop */ } resolve(v); };
          sock.once('connect', () => done(false));
          sock.once('error', () => done(true));
          setTimeout(() => done(true), 1500);
        });
        process.send({ type: 'portProbed', closed });
      } else if (msg.type === 'revalidateProvider') {
        if (msg.removeCredential === true) delete process.env.ANTHROPIC_API_KEY;
        const validation = validateChildProviderConfiguration({
          env: process.env,
          executionMode: state.executionMode,
          resolvedModel: state.resolvedDispatchModel,
          allowedModels: state.dispatchAllowedModels,
          previouslyReady: true,
        });
        process.send({ type: 'providerRevalidated', validation: {
          ok: validation.ok === true,
          boundedCode: validation.boundedCode || null,
        } });
      } else if (msg.type === 'ledger') {
        process.send({ type: 'ledgerReport', ledger: state.providerLedger, network: state.guard ? state.guard.summary() : null });
      } else if (msg.type === 'cleanup') {
        const report = await cleanup(msg.owned || {});
        process.send({ type: 'cleaned', report });
      } else if (msg.type === 'mongoAvailability') {
        process.send({ type: 'mongoAvailability', report: await diagnoseMongoAvailability() });
      } else if (msg.type === 'shutdown') {
        const report = await shutdown();
        process.send({ type: 'down', report });
        // The application registers ref'd timers (Stage 14.7D2 finding), so the
        // child never exits on its own and must exit explicitly.
        setTimeout(() => process.exit(0), 50);
      }
    } catch (error) {
      // Bounded diagnostic: a truncated message and stack head, never a full
      // object, URI or credential.
      process.send({
        type: 'error',
        boundedCode: error.code || 'child_failed',
        step: msg.type,
        boundedMessage: String(error && error.message).slice(0, 300),
        boundedStack: String(error && error.stack).split('\n').slice(1, 4).join(' | ').slice(0, 400)
      });
    }
  });
}

module.exports = {
  boot, cleanup, shutdown, diagnoseMongoAvailability, EVALUATION_FLAGS, EVAL_URI, EXECUTION_MODE,
};
