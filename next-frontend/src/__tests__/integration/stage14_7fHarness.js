/**
 * Stage 14.7F — parent-side harness.
 *
 * The parent owns the frontend half on purpose: `consumeAiSseStream`, the early
 * revision coordinator, the message reducers and the payload selectors are the
 * REAL production modules, imported natively here as ESM. Nothing is
 * reimplemented, and no frontend code is moved into the child to dodge imports.
 *
 * The child owns the server half (real `src/app.js` via its `{ app, server }`
 * seam). They talk over IPC.
 *
 * Zero live provider calls: the child replaces the Anthropic SDK in its require
 * cache before the application graph loads.
 */

import { fork } from 'child_process';
import { resolve } from 'path';
import { createRequire } from 'module';
import { randomBytes } from 'crypto';

import { consumeAiSseStream } from '@/services/aiService';
import { createEarlyRevisionCoordinator } from '@/utils/earlyRevisionCoordinator';
import { upsertItineraryTurn, updateProseTurn } from '@/utils/earlyRevisionMessages';
import { buildResponseSavePayload } from '@/utils/responseSavePayload';
import { sanitizeMessagesForPersistence } from '@/services/tripHistoryService';

const SERVER_DIR = resolve(process.cwd(), '../server');
const CHILD_ENTRY = resolve(SERVER_DIR, 'src/eval/stage14_7e/scenarioChild.js');
const serverRequire = createRequire(resolve(SERVER_DIR, '_entry.js'));
const {
  buildRunScopedEvaluationIdentity,
  validateRunScopedEvaluationIdentity,
} = serverRequire('./src/eval/stage14_7/evaluationIdentity');
const {
  LIVE_CHILD_READY,
  buildSecureScenarioEnvironment,
} = serverRequire('./src/eval/stage14_7/childProviderReadiness');
const { assertIsolatedEvalMongoIfRequired } = serverRequire(
  './src/eval/stage14_7/isolatedEvalMongo',
);
assertIsolatedEvalMongoIfRequired();

export function buildRunIdentity(evaluationRunId, evaluationUserId = null) {
  return buildRunScopedEvaluationIdentity({
    evaluationRunId,
    evaluationUserId: evaluationUserId || randomBytes(12).toString('hex'),
  });
}

/** Real mounted paths, discovered from the application rather than assumed. */
export const MOUNTED_PATHS = {
  chatStream: '/api/ai/chat-stream',
  tripCreate: '/api/trips',
  tripUpdate: (id) => `/api/trips/${id}`,
  tripRead: (id) => `/api/trips/${id}`,
};

export function loadScenario(scenarioId) {
  const scenarios = serverRequire('./src/eval/trailie/scenarios');
  const scenario = scenarios.byId(scenarioId);
  if (!scenario) throw new Error(`unknown scenario: ${scenarioId}`);
  const structured = scenario.structuredResponses?.[0];
  return {
    scenarioId,
    userPrompt: scenario.userPrompt,
    metadata: scenario.resolvedMetadata,
    structuredResponse: structured?.itinerary || structured,
    proseText: scenario.proseResponses?.[0]?.content,
    expected: scenario.expected,
  };
}

/** Spawns one fresh child and resolves once the real application is listening. */
export function startScenarioChild({
  scenarioId, evaluationRunId, structuredResponse, proseText, usePhaseBBarrier = false, timeoutMs = 90000,
  // Stage 14.7F6 §12 — the PARENT decides who owns this run's records, before
  // the child exists. If the child dies before its first IPC message, cleanup
  // still knows exactly which user and which trips to scope to.
  evaluationUserId = null, evaluationUserEmail = null,
  // Stage 14.7G §3 — 'deterministic' (default, zero cost) or 'live'.
  executionMode = 'deterministic',
  /**
   * §6 — the parent's ledger answers the child's reserve/settle asks, because
   * caps bind across BOTH scenarios and the child is torn down between them.
   * Shape: async (type, msg) => reply.
   */
  onProviderAsk = null,
  /** §5 — provider boundary notifications, marked on the parent's clock. */
  onProviderEvent = null,
  /**
   * Stage 14.7J §2/§4 — the child's dispatch model policy and resolved model
   * identity. A deterministic suite may inject a test-scoped allowlist; a live
   * child ignores both and derives its policy from the receipt-covered
   * configuration instead.
   */
  allowedModels = null,
  model = null,
  liveGates = {},
}) {
  return new Promise((resolvePromise, reject) => {
    let identity;
    try {
      const generated = buildRunIdentity(evaluationRunId, evaluationUserId);
      identity = { ...generated, ...(evaluationUserEmail ? { evaluationUserEmail } : {}) };
      if (!validateRunScopedEvaluationIdentity(identity).ok) {
        throw Object.assign(new Error('evaluation_identity_invalid'), { code: 'evaluation_identity_invalid' });
      }
    } catch {
      reject(Object.assign(new Error('evaluation_identity_invalid'), { code: 'evaluation_identity_invalid' }));
      return;
    }
    // cwd MUST be the server directory: reactEmailRenderer calls
    // @babel/register, which resolves its preset config relative to cwd. Forked
    // from next-frontend the .jsx email templates fail to transform and the
    // application import dies with "Unexpected token '<'".
    const secureChildEnvironment = buildSecureScenarioEnvironment({
      parentEnv: process.env, executionMode, liveGates,
    });
    const child = fork(CHILD_ENTRY, [], {
      cwd: SERVER_DIR,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: secureChildEnvironment.env,
    });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      try { process.kill(child.pid, 'SIGKILL'); } catch { /* already gone */ }
      reject(new Error('child_boot_timeout'));
    }, timeoutMs);

    const pending = new Map();
    let ready = null;
    let liveChildReady = null;
    // §12 — recorded the moment the child reports them, never at scenario end.
    const observedTrips = [];

    child.on('message', (msg) => {
      if (msg.type === LIVE_CHILD_READY) {
        liveChildReady = msg;
        return;
      }
      if (msg.type === 'trip_created') {
        observedTrips.push({ tripId: msg.tripId, responseId: msg.responseId ?? null });
        return;
      }
      // §5 — the provider boundary, marked the moment the parent hears about it.
      // This carries one IPC hop of latency, which is reported as such rather
      // than subtracted out; it is far smaller than the gains being measured.
      if (msg.type === 'provider_started' || msg.type === 'provider_ended') {
        if (onProviderEvent) onProviderEvent(msg);
        return;
      }
      // §6 — reserve/settle. A parent that declines simply replies not-allowed;
      // the child then makes no call at all.
      if (msg.type === 'provider_reserve' || msg.type === 'provider_settle') {
        /**
         * Stage 14.7H §6 — with no ledger supplied (every deterministic suite),
         * dispatch is authorized UNLEDGERED. Those runs cost nothing and have
         * no caps to enforce, and refusing here would break them.
         *
         * The flag is not cosmetic: the child REFUSES an unledgered
         * authorization in live mode, so a paid run can never proceed without a
         * real reservation behind it.
         */
        const fallback = { allowed: true, dispatchAuthorized: true, reservationId: null, unledgered: true };
        Promise.resolve(onProviderAsk ? onProviderAsk(msg.type, msg) : fallback)
          .then((reply) => { try { child.send({ type: 'ask_reply', askId: msg.askId, reply }); } catch { /* child gone */ } })
          .catch(() => { try { child.send({ type: 'ask_reply', askId: msg.askId, reply: { allowed: false, dispatchAuthorized: false, blockedBy: 'ledger_error' } }); } catch { /* child gone */ } });
        return;
      }
      if (msg.type === 'ready') {
        if (executionMode === 'live' && (!liveChildReady
          || liveChildReady.providerConfigured !== true
          || liveChildReady.providerPolicyAllowsLive !== true
          || liveChildReady.providerMode !== 'live'
          || liveChildReady.modelResolved !== true
          || liveChildReady.modelAllowlisted !== true
          || liveChildReady.resolvedModel !== 'claude-sonnet-5'
          || liveChildReady.isolatedMongoConfigured !== true)) {
          clearTimeout(timer);
          reject(Object.assign(new Error('live_child_not_ready'), { code: 'live_child_not_ready' }));
          return;
        }
        clearTimeout(timer);
        ready = msg.result;
        resolvePromise(makeHandle(
          child, () => ready, pending, () => stderr, observedTrips,
          () => liveChildReady,
        ));
        return;
      }
      const waiter = pending.get(msg.type);
      if (waiter) { pending.delete(msg.type); waiter(msg); }
      if (msg.type === 'error') {
        clearTimeout(timer);
        try { child.kill('SIGKILL'); } catch { /* already gone */ }
        // Surface the bounded code, the failing step and the child's stderr tail
        // so a boot failure is diagnosable instead of anonymous.
        const error = new Error(`child_failed step=${msg.step} code=${msg.boundedCode}\nmsg=${msg.boundedMessage}\nat=${msg.boundedStack}\nstderr=${stderr.slice(-1200)}`);
        error.code = msg.boundedCode || 'child_failed';
        reject(error);
      }
    });

    child.send({ type: 'boot', config: {
      scenarioId, evaluationRunId, structuredResponse, proseText, usePhaseBBarrier,
      evaluationUserId: identity.evaluationUserId,
      evaluationUserEmail: identity.evaluationUserEmail,
      executionMode, allowedModels, model,
      liveGates,
    } });
  });
}

function makeHandle(child, getReady, pending, getStderr, observedTrips = [], getLiveChildReady = () => null) {
  /**
   * A child that has already exited will never answer. Every IPC request is
   * therefore bounded — a hung `shutdown()` in an afterAll hook is how a whole
   * suite times out on cleanup rather than reporting its result.
   */
  const request = (message, expectType, timeoutMs = 15000) => new Promise((res) => {
    if (!child.connected) { res({ type: expectType, timedOut: true }); return; }
    const timer = setTimeout(() => {
      pending.delete(expectType);
      res({ type: expectType, timedOut: true });
    }, timeoutMs);
    pending.set(expectType, (msg) => { clearTimeout(timer); res(msg); });
    try { child.send(message); } catch {
      clearTimeout(timer);
      pending.delete(expectType);
      res({ type: expectType, timedOut: true });
    }
  });
  return {
    get ready() { return getReady(); },
    get baseUrl() { return getReady().baseUrl; },
    /** Never returned to callers that print; used only for Authorization. */
    get token() { return getReady().token; },
    get evaluationUserId() { return getReady().evaluationUserId; },
    get effectiveConfig() { return getReady().effectiveConfig; },
    get liveChildReady() { return getLiveChildReady(); },
    pid: child.pid,
    stderr: getStderr,
    releasePhaseB: () => request({ type: 'releasePhaseB' }, 'phaseBReleased'),
    /** Ids the parent learned about via IPC, available even if the child dies. */
    observedTrips: () => [...observedTrips],
    /**
     * §12 — record a real trip id THE MOMENT it exists. The parent issues the
     * writes, so it learns ids first; retaining them here (rather than at
     * scenario end) is what lets cleanup run after an abort or a child death.
     */
    recordTrip: (tripId, responseId = null) => {
      if (tripId && !observedTrips.some((t) => String(t.tripId) === String(tripId))) {
        observedTrips.push({ tripId: String(tripId), responseId });
      }
    },
    counts: (tripIds = [], foreignUserId = null) =>
      request({ type: 'countDocs', tripIds, foreignUserId }, 'counts').then((m) => m.counts),
    mongoAvailability: () => request({ type: 'mongoAvailability' }, 'mongoAvailability')
      .then((m) => m.report),
    seedForeignRun: ({ email, responseId }) =>
      request({ type: 'seedForeignRun', email, responseId }, 'foreignSeeded').then((m) => m.foreign),
    removeForeignRun: ({ userId, tripId }) =>
      request({ type: 'removeForeignRun', userId, tripId }, 'foreignRemoved').then((m) => m.report),
    probePort: (port) => request({ type: 'portProbe', port }, 'portProbed').then((m) => m.closed),
    revalidateProvider: ({ removeCredential = false } = {}) =>
      request({ type: 'revalidateProvider', removeCredential }, 'providerRevalidated')
        .then((m) => m.validation),
    ledger: () => request({ type: 'ledger' }, 'ledgerReport'),
    cleanup: (owned) => request({ type: 'cleanup', owned }, 'cleaned').then((m) => m.report),
    shutdown: () => request({ type: 'shutdown' }, 'down').then((m) => m.report),
    kill: () => { try { process.kill(child.pid, 'SIGKILL'); } catch { /* gone */ } },
    isAlive: () => { try { process.kill(child.pid, 0); return true; } catch { return false; } },
  };
}

/**
 * Drives one authenticated turn through the REAL route and the REAL frontend
 * lifecycle, returning the observed transcript, journal and persistence stats.
 *
 * `abortAt` supports the interrupted-state cases: 'before_revision_1' or
 * 'after_revision_1'.
 */
/**
 * Stage 14.7F6 §3 — deterministic interruption barriers.
 *
 * EVALUATION-ONLY. Nothing here exists in production timing: the barriers are
 * awaited inside this harness's persistence adapter and view callbacks, and the
 * production coordinator, reducers and route are untouched. No sleeps.
 */
export const BARRIER = {
  A_BEFORE_REVISION_1_PERSIST: 'A_before_revision_1_persist',
  B_DURING_REVISION_1_PERSIST: 'B_during_revision_1_persist',
  C_AFTER_REVISION_1_PERSIST: 'C_after_revision_1_persist',
  D_BEFORE_REVISION_2_PERSIST: 'D_before_revision_2_persist',
  E_DURING_REVISION_2_PERSIST: 'E_during_revision_2_persist',
  F_AFTER_REVISION_2_PERSIST: 'F_after_revision_2_persist',
  G_BEFORE_DONE: 'G_before_done',
};

/** A one-shot gate the test releases explicitly. */
function makeGate() {
  let release;
  const promise = new Promise((r) => { release = r; });
  return { promise, release: () => release() };
}

export async function driveTurn(handle, scenario, {
  abortAt = null,
  autoReleasePhaseB = true,
  // Stage 14.7F6 §3 — { [BARRIER]: 'hold' | 'abort' }. 'hold' waits for the
  // returned control's release(); 'abort' cancels the stream at that point.
  barriers = {},
  onBarrier = null,
  // Populated SYNCHRONOUSLY with { releaseBarrier } before the stream starts, so
  // a test can release a held barrier without waiting for driveTurn to resolve
  // (waiting for that while holding a barrier is a deadlock).
  control = null,
  onEvent = null,
  // Stage 14.7F6 §5/§8 — force a bounded persistence failure without touching
  // production code: { revision1: 'transport'|<statusOverride>, revision2: ... }
  failPersistence = {},
  /**
   * Stage 14.7G §5 — an optional monotonic recorder. When absent every `mark()`
   * below is a no-op, so the deterministic suites are unaffected and there is
   * exactly ONE drive implementation rather than a live-only fork.
   */
  timeline = null,
  /** §10/§11 — retain raw SSE bytes. Off by default; deterministic suites unaffected. */
  captureRawTranscript = false,
  // Stage 14.7P — replay preserved SSE bytes through the real parser,
  // coordinator, persistence controller and authenticated restore path without
  // entering the provider-backed chat route.
  rawTranscriptOverride = null,
} = {}) {
  const mark = (checkpoint) => { if (timeline) timeline.mark(checkpoint); };

  /** SSE event type → timeline checkpoint. */
  const EVENT_CHECKPOINT = {
    response_started: 'responseStartedEvent',
    itinerary_ready: 'itineraryReadyEvent',
    prose_generation_started: 'proseGenerationStartedEvent',
    prose_ready: 'proseReadyEvent',
  };
  const journal = [];
  const parsedEvents = [];
  const suppressed = { chunks: 0, streamEnds: 0 };
  const rendered = { chunkText: '' };
  const persistence = {
    httpRequests: 0, accepted: 0, idempotent: 0, stale: 0, conflict: 0, rejected: 0,
    revision1TripId: null, revision2TripId: null, outcomes: [], writeLog: [],
    storedRevision1Trip: null, storedRevision2Trip: null,
    // Stage 14.7F6 §2 — `done` metrics kept strictly apart. An automatic write
    // is one the COORDINATOR issued; a replay is one a test issued on purpose.
    automaticPersistenceRequestsFromDone: 0,
    acceptedWritesFromDone: 0,
    idempotentDecisionsFromDone: 0,
  };
  // Numeric id: persisted conversation ids are Numbers, exactly as the real
  // client allocates them with Date.now().
  const userMessageId = Date.now();
  let phaseBReleasedBy = null;
  let messages = [{ id: userMessageId, role: 'user', content: scenario.userPrompt }];
  const baseConversation = [{ id: userMessageId, role: 'user', content: scenario.userPrompt }];
  let persistedConversation = baseConversation;
  let tripId = null;
  const cardMounts = { mount: 0, unmount: 0 };
  let responseId = null;

  const record = (entry) => journal.push(entry);

  /**
   * Mirrors `writeCanonicalRevision` in TripPlannerChat.jsx exactly: the same
   * sanitizer, the same payload builder, the same create-vs-update branch, and
   * the same success rule (a write is OK unless planPersistence.success is
   * explicitly false). `createTripSummary` is component-local and cannot be
   * imported, so only its `hasPlan` computation is reproduced here.
   */
  const summaryFor = (persisted, plan) => ({
    totalMessages: persisted.length,
    userQuestions: persisted.filter((m) => m.role === 'user').map((m) => m.content).slice(0, 3),
    hasPlan: Array.isArray(plan?.days) && plan.days.some((d) => Array.isArray(d.stops) && d.stops.length > 0),
    lastActivity: new Date().toISOString(),
  });

  // ── Stage 14.7F6 §3 — barrier machinery (evaluation-only) ────────────────
  const barrierLog = [];
  const gates = new Map();
  /** Returns true when the flow was aborted at this barrier. */
  const hitBarrier = async (name) => {
    const mode = barriers[name];
    if (!mode) return false;
    barrierLog.push({ barrier: name, mode });
    if (onBarrier) onBarrier(name);
    if (mode === 'abort') {
      aborted = true;
      // `cancel()` both throws synchronously (locked stream) and rejects.
      try { Promise.resolve(response.body.cancel()).catch(() => {}); } catch { /* already closed */ }
      return true;
    }
    if (mode === 'hold') {
      let gate = gates.get(name);
      if (!gate) { gate = makeGate(); gates.set(name, gate); }
      await gate.promise;
      return false;
    }
    return false;
  };
  const releaseBarrier = (name) => {
    let gate = gates.get(name);
    if (!gate) { gate = makeGate(); gates.set(name, gate); }
    gate.release();
  };
  if (control) control.releaseBarrier = releaseBarrier;

  const writeCanonicalRevision = async ({ conversation, plan, expectedPreviousRevision, barrier = null, fail = null }) => {
    const persisted = sanitizeMessagesForPersistence(conversation);
    const summary = summaryFor(persisted, plan);

    const isCreate = !tripId;
    const payload = buildResponseSavePayload({
      conversation: persisted, summary, plan, expectedPreviousRevision,
    });
    const url = handle.baseUrl + (isCreate ? MOUNTED_PATHS.tripCreate : MOUNTED_PATHS.tripUpdate(tripId));
    const body = isCreate
      ? {
          parkName: scenario.metadata?.parkName || 'General Planning',
          parkCode: scenario.metadata?.parkCode || null,
          title: `${scenario.metadata?.parkName || 'Evaluation'} Trip Plan`,
          formData: {},
          conversation: persisted,
          summary,
          plan,
          provider: 'auto',
          status: 'active',
        }
      : payload;

    // Stage 14.7F5 §12 — record the EXACT wire body so a replay variant can
    // resend it verbatim, the way a retry or a second tab would.
    persistence.writeLog.push({ isCreate, url, body: JSON.parse(JSON.stringify(body)) });

    if (barrier) await hitBarrier(barrier);

    if (fail && fail !== 'transport') {
      const corrupt = JSON.parse(JSON.stringify(body));
      const assistants = (corrupt.conversation || []).filter((m) => m.role === 'assistant');
      if (fail === 'conflict' && corrupt.plan) {
        // A terminal revision that changes the frozen itinerary → conflict.
        corrupt.plan.itineraryHash = 'ih-injected-mismatch';
        assistants.forEach((m) => { m.itineraryHash = 'ih-injected-mismatch'; });
      } else if (fail === 'stale' && corrupt.plan) {
        // A write describing an earlier revision of the same turn → stale.
        corrupt.plan.responseRevision = 1;
        corrupt.plan.contentHash = null;
        assistants.forEach((m) => { m.responseRevision = 1; m.content = ''; m.contentHash = null; });
        delete corrupt.expectedPreviousRevision;
      } else if (fail === 'validation' && corrupt.plan) {
        // A plan naming a response no assistant turn owns → bounded 4xx.
        corrupt.plan.responseId = 'resp-injected-unowned';
      }
      Object.assign(body, corrupt);
    }

    // Stage 14.7F6 §5/§8 — bounded failure injection that produces a REAL server
    // rejection, so stored state is genuinely untouched rather than merely
    // reported as untouched. The payload is corrupted in exactly the way each
    // failure mode describes and the server's own guards do the rejecting.
    if (fail === 'transport') {
      persistence.rejected += 1;
      persistence.outcomes.push({ status: 0, outcome: 'transport_error', create: isCreate, err: 'injected' });
      return { ok: false, uncertain: true, outcome: 'transport_error' };
    }

    persistence.httpRequests += 1;
    const res = await fetch(url, {
      method: isCreate ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${handle.token}` },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    // The server's real verdict on the (deliberately corrupted) payload.
    const pp = json?.planPersistence;
    const outcome = pp?.outcome || (res.ok ? 'accept' : 'error');
    persistence.outcomes.push({ status: res.status, outcome, create: isCreate, err: res.ok ? null : String(json?.error || json?.message || '').slice(0, 200) });

    if (pp && pp.success === false) {
      if (outcome === 'stale') persistence.stale += 1;
      else if (outcome === 'conflict') persistence.conflict += 1;
      return { ok: false, outcome };
    }
    // A transport-level rejection is not a successful save either. Production
    // never sees this because tripService throws on !res.ok; here the status is
    // explicit, so it must be treated as a failure rather than counted accepted.
    if (!res.ok) {
      persistence.rejected += 1;
      return { ok: false, outcome: `http_${res.status}` };
    }
    if (outcome === 'idempotent') persistence.idempotent += 1;
    else persistence.accepted += 1;

    const storedSnapshot = json?.data ?? json ?? null;
    if (plan?.responseRevision === 1) persistence.storedRevision1Trip = storedSnapshot;
    if (plan?.responseRevision === 2) persistence.storedRevision2Trip = storedSnapshot;

    const newTripId = json?.data?._id || json?._id || tripId;
    if (newTripId) {
      tripId = String(newTripId);
      handle.recordTrip(tripId, plan?.responseId ?? null);
    }
    return { ok: true, tripId, outcome };
  };

  const coordinator = createEarlyRevisionCoordinator({
    initialTripId: null,
    persistRevision1: async (effect) => {
      record('revision_1_received');
      if (await hitBarrier(BARRIER.A_BEFORE_REVISION_1_PERSIST)) {
        return { ok: false, aborted: true, outcome: 'aborted_at_barrier' };
      }
      record('revision_1_persist_started');
      mark('revision1PersistenceStart');
      persistedConversation = upsertItineraryTurn(baseConversation, effect);
      const result = await writeCanonicalRevision({
        conversation: persistedConversation, plan: effect.canonicalPlan,
        barrier: BARRIER.B_DURING_REVISION_1_PERSIST,
        fail: failPersistence.revision1,
      });
      await hitBarrier(BARRIER.C_AFTER_REVISION_1_PERSIST);
      if (result.ok) {
        persistence.revision1TripId = result.tripId;
        record('revision_1_persist_succeeded');
        mark('revision1PersistenceSuccess');
      } else {
        record('revision_1_persist_failed');
      }
      return result;
    },
    persistRevision2: async (effect) => {
      record('revision_2_received');
      if (await hitBarrier(BARRIER.D_BEFORE_REVISION_2_PERSIST)) {
        return { ok: false, aborted: true, outcome: 'aborted_at_barrier' };
      }
      record('revision_2_persist_started');
      mark('revision2PersistenceStart');
      persistedConversation = updateProseTurn(persistedConversation, effect);
      const result = await writeCanonicalRevision({
        conversation: persistedConversation,
        plan: effect.canonicalPlan,
        expectedPreviousRevision: effect.expectedPreviousRevision,
        barrier: BARRIER.E_DURING_REVISION_2_PERSIST,
        fail: failPersistence.revision2,
      });
      await hitBarrier(BARRIER.F_AFTER_REVISION_2_PERSIST);
      if (result.ok) {
        persistence.revision2TripId = result.tripId;
        record('revision_2_persist_succeeded');
        mark('revision2PersistenceSuccess');
      } else {
        record('revision_2_persist_failed');
      }
      return result;
    },
    persistTerminal: async () => {
      // Stage 14.7F6 §2 — an AUTOMATIC third canonical write from the coordinator.
      // After revision 2 has persisted this must never happen; recorded so the
      // assertion fails loudly rather than silently passing.
      record('terminal_persist_attempted');
      persistence.automaticPersistenceRequestsFromDone += 1;
      return { ok: true };
    },
    view: {
      revealItinerary: (payload) => {
        cardMounts.mount += 1;
        messages = upsertItineraryTurn(messages, payload);
        record('itinerary_revealed');
        // §7 — user-visible, and only reachable after revision 1 persisted. The
        // recorder itself refuses this mark if that is not already true.
        mark('itineraryVisible');
        // Release Phase B only AFTER revision-1 visibility, so the ordering
        // assertion reflects real sequencing rather than luck.
        if (autoReleasePhaseB) {
          phaseBReleasedBy = 'itinerary_revealed';
          handle.releasePhaseB().catch(() => {});
        }
      },
      revealProse: (payload) => {
        messages = updateProseTurn(messages, payload);
        record('prose_revealed');
        mark('proseVisible');
      },
      revealTerminal: () => record('terminal_revealed'),
      setPendingLabel: () => record('pending_label_set'),
      setTripId: (id) => { if (id) tripId = String(id); },
      onComplete: () => { record('done_reconciled'); mark('doneReconciled'); },
      onContractError: (e) => record(`contract_error:${e?.code || 'unknown'}`),
    },
  });

  // No AbortSignal is passed: under the vitest DOM environment the global
  // AbortController is jsdom's, which Node's fetch rejects. Interrupted cases
  // cancel the response body instead, which is what a closed client looks like
  // to the server anyway.
  // §5 — the monotonic origin: admitted turn start, immediately before the
  // request leaves the parent.
  mark('turnStart');
  const response = typeof rawTranscriptOverride === 'string'
    ? new Response(rawTranscriptOverride, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    : await fetch(handle.baseUrl + MOUNTED_PATHS.chatStream, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${handle.token}` },
        body: JSON.stringify({
          provider: 'claude',
          messages: [{ role: 'user', content: scenario.userPrompt }],
          metadata: scenario.metadata,
        }),
      });

  const httpStatus = response.status;
  const contentType = response.headers.get('content-type');

  /**
   * Stage 14.7G §10/§11 — retain the raw bytes for private evidence and for the
   * offline flag-off replay.
   *
   * The body is TEE'd rather than buffered-then-reparsed: the lifecycle below
   * must still see the stream arrive incrementally, because the whole
   * measurement is about WHEN each event became visible. Buffering first would
   * collapse every timestamp into one.
   */
  let rawTranscript = '';
  let streamForConsumer = response;
  if (captureRawTranscript && response.body) {
    const [forConsumer, forCapture] = response.body.tee();
    streamForConsumer = new Response(forConsumer, {
      status: response.status,
      headers: response.headers,
    });
    const decoder = new TextDecoder();
    const reader = forCapture.getReader();
    // Drained concurrently; a tee'd branch that is never read applies
    // backpressure and would stall the branch the lifecycle is consuming.
    (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          rawTranscript += decoder.decode(value, { stream: true });
        }
        rawTranscript += decoder.decode();
      } catch { /* cancelled with the response */ }
    })();
  }

  // Safety net: if revision 1 fails, `itinerary_revealed` never fires and the
  // barrier would hold the synthetic prose call forever. Release it on a bounded
  // timer and record that it was NOT released by visibility, so the ordering
  // assertion cannot pass on a technicality.
  const barrierFailsafe = setTimeout(() => {
    if (!phaseBReleasedBy) {
      phaseBReleasedBy = 'failsafe_timeout';
      handle.releasePhaseB().catch(() => {});
    }
  }, 15000);

  let aborted = false;
  try {
    await consumeAiSseStream(streamForConsumer, {
      onEarlyEvent: (event) => {
        parsedEvents.push(event.type);
        if (EVENT_CHECKPOINT[event.type]) mark(EVENT_CHECKPOINT[event.type]);
        if (onEvent) onEvent(event.type, event);
        if (event.type === 'itinerary_ready') {
          responseId = event.response?.responseId ?? event.responseId ?? responseId;
        }
        if (abortAt === 'before_revision_1' && event.type === 'itinerary_ready') {
          aborted = true;
          response.body.cancel().catch(() => {});
          return;
        }
        coordinator.handleEvent(event);
        if (abortAt === 'after_revision_1' && event.type === 'prose_generation_started') {
          aborted = true;
          response.body.cancel().catch(() => {});
        }
      },
      onThinking: () => { parsedEvents.push('thinking'); mark('firstThinkingEvent'); },
      onChunk: (text) => {
        parsedEvents.push('chunk');
        mark('firstCompatibilityChunk');
        // Real suppression decision — not an evaluation-only filter.
        if (coordinator.shouldRenderLegacyChunk({})) rendered.chunkText += text ?? '';
        else suppressed.chunks += 1;
      },
      onStreamEnd: () => {
        parsedEvents.push('stream_end');
        mark('streamEndEvent');
        if (!coordinator.shouldFinalizeLegacyStream()) suppressed.streamEnds += 1;
      },
      onDone: (event) => {
        parsedEvents.push('done');
        mark('doneEvent');
        // §3 barrier G — the stream is treated as terminated before `done` is
        // reconciled, which is what a dropped connection at that instant does.
        if (barriers[BARRIER.G_BEFORE_DONE] === 'abort') {
          barrierLog.push({ barrier: BARRIER.G_BEFORE_DONE, mode: 'abort' });
          aborted = true;
          try { Promise.resolve(response.body.cancel()).catch(() => {}); } catch { /* already closed */ }
          return;
        }
        coordinator.handleEvent({ ...event, type: 'done' });
      },
      onError: () => parsedEvents.push('error'),
    });
  } catch (error) {
    if (!aborted) throw error;
  }

  clearTimeout(barrierFailsafe);
  await coordinator.drain();

  return {
    barrierLog,
    releaseBarrier,
    phaseBReleasedBy,
    httpStatus,
    contentType,
    parsedEvents,
    suppressed,
    rendered,
    persistence,
    journal,
    messages,
    cardMounts,
    responseId,
    tripId,
    metrics: coordinator.getMetrics(),
    state: coordinator.getState(),
    // §5/§8 — null when no recorder was supplied, so deterministic callers see
    // no change at all.
    rawTranscript: captureRawTranscript ? rawTranscript : null,
    timeline: timeline ? timeline.report() : null,
    ordering: timeline ? timeline.orderingReport() : null,
    persistenceDurations: timeline ? timeline.persistenceDurations() : null,
  };
}

/** Counts a parsed event type. */
export const countOf = (events, type) => events.filter((e) => e === type).length;

/** Index helper for strict ordering assertions. */
export const idx = (journal, entry) => journal.indexOf(entry);


/**
 * Stage 14.7F5 §12 — resend a previously recorded canonical write VERBATIM.
 *
 * This is the replay a retry, a reconnect or a second tab produces: the same
 * bytes arriving again with no client-side lifecycle memory to suppress them.
 * A create replay is re-pointed at the trip that was actually created, because
 * that is what the real client does once it knows the id.
 */
export async function replayWrite(handle, entry, { tripId = null } = {}) {
  const url = entry.isCreate && tripId
    ? handle.baseUrl + MOUNTED_PATHS.tripUpdate(tripId)
    : entry.url;
  const method = entry.isCreate && tripId ? 'PUT' : (entry.isCreate ? 'POST' : 'PUT');
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${handle.token}` },
    body: JSON.stringify(entry.body),
  });
  const json = await res.json().catch(() => ({}));
  return {
    status: res.status,
    outcome: json?.planPersistence?.outcome ?? (json?.idempotent ? 'idempotent' : null),
    reason: json?.planPersistence?.reason ?? null,
    success: json?.success,
  };
}

/** Reads the stored trip back through the REAL authenticated owner endpoint. */
export async function readTrip(handle, tripId) {
  const res = await fetch(handle.baseUrl + `/api/trips/${tripId}`, {
    headers: { Authorization: `Bearer ${handle.token}` },
  });
  const json = await res.json().catch(() => ({}));
  return json?.data ?? null;
}
