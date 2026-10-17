/**
 * Local-only observability for manual Trailie demo review.
 *
 * The operator clicks one demo at a time in a real browser and needs to see, per
 * submission, what the turn actually did — identity, lifecycle, persistence —
 * without reading a Playwright trace. This tees the network the same way
 * `scripts/stage14_8h-instrumentation.js` does (fetch for SSE, XHR for axios
 * trip writes) and folds the events into one record per submitted prompt.
 *
 * NEVER records: Authorization headers, cookies, tokens, passwords, request
 * bodies beyond bounded identity/lifecycle fields, or assistant prose. Only
 * shapes, counts and ids.
 *
 * Development builds only. It installs nothing in production, adds no product
 * UI, and mutates no application state — it is a passive read of traffic the
 * app was already making.
 *
 * Read it in the browser console:
 *   __trailieDemo.last()     → the most recent turn record
 *   __trailieDemo.table()    → all turns, one row each
 *   __trailieDemo.reset()    → clear collected turns
 */

const GLOBAL_KEY = '__trailieDemo';
const CHAT_STREAM_PATTERN = /\/api\/ai\/chat(-stream)?(-anonymous)?\b/;
const TRIP_WRITE_PATTERN = /\/api\/trips\b/;
const MAX_TURNS = 50;

export const TRAILIE_DEMO_OBSERVER_ENABLED =
  process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_TRAILIE_DEMO_OBSERVER !== 'off';

/** The per-submission record shape the operator reviews. */
function createTurnRecord({ prompt, authenticated, tripId }) {
  return {
    prompt,
    authenticated: authenticated === true,
    tripId: tripId || null,
    responseId: null,
    responseVersion: null,
    responseRevision: null,
    provider: null,
    model: null,
    providerRequestCount: 0,
    itineraryReadyObserved: false,
    proseReadyObserved: false,
    turnCompleteObserved: false,
    persistenceWrites: 0,
    doneWrites: 0,
    planSnapshot: null,
    // The server does not stream token usage or cost on `done`, so this cannot
    // be derived in the browser. `providerRequestCount` is the spend signal.
    costUsd: null,
    costUsdSource: 'not-streamed-by-server',
    startedAtMs: null,
    events: [],
    writes: [],
  };
}

/** Public, bounded itinerary evidence for the capture report; no canonical ids/hashes. */
function projectPlan(plan) {
  if (!plan || typeof plan !== 'object') return null;
  const projectAlt = (alt) => {
    if (typeof alt === 'string') return { name: alt, note: null, when: null };
    if (!alt || typeof alt !== 'object') return null;
    const name = alt.name || null;
    if (!name) return null;
    return { name, note: alt.note || null, when: alt.when || null };
  };
  return {
    parkName: plan.parkName || null,
    alternatives: Array.isArray(plan.alternatives)
      ? plan.alternatives.map(projectAlt).filter(Boolean).slice(0, 12)
      : [],
    days: Array.isArray(plan.days)
      ? plan.days.slice(0, 14).map((day) => ({
          day: day.day ?? null,
          title: day.title || null,
          stops: Array.isArray(day.stops)
            ? day.stops.slice(0, 20).map((stop) => ({
                name: stop.name || null,
                startTime: stop.startTime || null,
                timeWindow: stop.timeWindow || null,
                duration: stop.duration || null,
                difficulty: stop.difficulty || null,
                physicalDifficulty: stop.physicalDifficulty || null,
                exposure: stop.exposureLevel || stop.exposure || null,
                alternatives: Array.isArray(stop.alternatives)
                  ? stop.alternatives.map(projectAlt).filter(Boolean).slice(0, 6)
                  : [],
              }))
            : [],
        }))
      : [],
  };
}

function getState() {
  if (typeof window === 'undefined') return null;
  return window[GLOBAL_KEY] || null;
}

/** Bounded projection of one SSE payload — identity and lifecycle, never prose. */
function projectSseEvent(payload) {
  return {
    type: payload.type || 'unknown',
    stage: payload.stage || null,
    responseId: payload.responseId ?? payload.response?.responseId ?? null,
    responseVersion: payload.responseVersion ?? payload.response?.responseVersion ?? null,
    responseRevision: payload.responseRevision ?? payload.response?.responseRevision ?? null,
    provider: payload.provider ?? null,
    model: payload.model ?? null,
    hasItinerary: payload.hasItinerary ?? null,
    dayCount: Array.isArray(payload.canonicalPlan?.days)
      ? payload.canonicalPlan.days.length
      : Array.isArray(payload.itineraryData?.days)
        ? payload.itineraryData.days.length
        : null,
  };
}

export function applySseEvent(turn, payload) {
  const event = projectSseEvent(payload);
  turn.events.push(event);

  if (event.responseId) turn.responseId = event.responseId;
  if (event.responseVersion != null) turn.responseVersion = event.responseVersion;
  if (event.responseRevision != null) turn.responseRevision = event.responseRevision;
  if (event.provider) turn.provider = event.provider;
  if (event.model) turn.model = event.model;
  const plan = payload.canonicalPlan || payload.itineraryData || null;
  if (plan) turn.planSnapshot = projectPlan(plan);

  if (event.type === 'itinerary_ready') turn.itineraryReadyObserved = true;
  if (event.type === 'prose_ready') turn.proseReadyObserved = true;
  // Terminal lifecycle — turn is complete. Do NOT treat this as prose-ready;
  // itinerary turns often finalize without a separate prose_ready event, and
  // recapture must still wait for the accepted plan/card rather than welcome chrome.
  if (
    event.type === 'done'
    || event.type === 'response_finalized'
  ) {
    turn.turnCompleteObserved = true;
    // Legacy `done` with user-facing content can also count as prose-ready.
    if (event.type === 'done' && typeof payload.content === 'string' && payload.content.trim()) {
      turn.proseReadyObserved = true;
    }
  }
}

/** Bounded projection of a trip persistence body — counts and identity only. */
function projectWriteBody(raw) {
  let body = null;
  try {
    body = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object') return null;

  const conversation = Array.isArray(body.conversation) ? body.conversation : [];
  return {
    conversationLength: conversation.length,
    userTurns: conversation.filter((m) => m && m.role === 'user').length,
    assistantTurns: conversation.filter((m) => m && m.role === 'assistant').length,
    responseId: body.plan?.responseId ?? body.responseId ?? body.response?.responseId ?? null,
    responseVersion: body.plan?.responseVersion ?? body.responseVersion ?? body.response?.responseVersion ?? null,
    responseRevision: body.plan?.responseRevision ?? body.responseRevision ?? body.response?.responseRevision ?? null,
    lifecycleStatus: body.plan?.lifecycleStatus ?? body.lifecycleStatus ?? body.response?.lifecycleStatus ?? null,
    dayCount: Array.isArray(body.plan?.days) ? body.plan.days.length : null,
  };
}

function applyWrite(turn, { method, status, body, responseBody }) {
  const projected = projectWriteBody(body);
  let persistence = null;
  try {
    const parsed = typeof responseBody === 'string' ? JSON.parse(responseBody) : responseBody;
    persistence = parsed?.planPersistence || null;
  } catch {
    persistence = null;
  }
  turn.persistenceWrites += 1;
  turn.writes.push({
    method,
    status,
    ...(projected || {}),
    persistenceOutcome: persistence?.outcome || null,
    persistenceAccepted: persistence?.success !== false,
    persistenceReason: persistence?.reason || null,
  });
  if (projected?.lifecycleStatus === 'done' || projected?.responseRevision === 2) {
    turn.doneWrites += 1;
  }
  if (!turn.tripId && projected?.responseId) turn.responseId = projected.responseId;
}

/** Parse an SSE text chunk into payload objects, ignoring keep-alives. */
function parseSseChunk(chunk) {
  const payloads = [];
  for (const line of String(chunk).split('\n')) {
    if (!line.startsWith('data:')) continue;
    const raw = line.slice(5).trim();
    if (!raw || raw === '[DONE]') continue;
    try {
      payloads.push(JSON.parse(raw));
    } catch {
      /* partial frame across chunk boundary — the next chunk carries it */
    }
  }
  return payloads;
}

/**
 * Install the observer. Idempotent, safe to call on every mount, and a no-op
 * outside development or on the server.
 */
export function installTrailieDemoObserver() {
  if (!TRAILIE_DEMO_OBSERVER_ENABLED) return null;
  if (typeof window === 'undefined') return null;
  if (window[GLOBAL_KEY]) return window[GLOBAL_KEY];

  const state = {
    turns: [],
    current: null,
    last: () => state.turns[state.turns.length - 1] || null,
    table: () =>
      state.turns.map((t) => ({
        prompt: t.prompt.length > 60 ? `${t.prompt.slice(0, 57)}…` : t.prompt,
        auth: t.authenticated,
        tripId: t.tripId,
        responseId: t.responseId,
        v: t.responseVersion,
        rev: t.responseRevision,
        provider: t.provider,
        model: t.model,
        providerReqs: t.providerRequestCount,
        itinerary: t.itineraryReadyObserved,
        prose: t.proseReadyObserved,
        turnComplete: t.turnCompleteObserved,
        writes: t.persistenceWrites,
        doneWrites: t.doneWrites,
        costUsd: t.costUsd,
      })),
    reset: () => {
      state.turns.length = 0;
      state.current = null;
    },
  };
  window[GLOBAL_KEY] = state;

  // ── SSE tee (fetch) — read a clone so the app's stream is untouched ────────
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const response = await originalFetch(input, init);

    if (!CHAT_STREAM_PATTERN.test(url)) return response;

    const turn = state.current;
    if (turn) turn.providerRequestCount += 1;

    const cloned = response.clone();
    (async () => {
      try {
        const reader = cloned.body?.getReader();
        if (!reader) return;
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const payload of parseSseChunk(decoder.decode(value, { stream: true }))) {
            if (state.current) applySseEvent(state.current, payload);
          }
        }
      } catch {
        /* the tee must never affect the real stream */
      }
    })();

    return response;
  };

  // ── Persistence tee (XHR) — axios uses XHR in the browser, so a fetch-only
  //    tee would miss every trip write.
  const OriginalXhr = window.XMLHttpRequest;
  class ObservedXhr extends OriginalXhr {
    open(method, url, ...rest) {
      this.__trailieMethod = method;
      this.__trailieUrl = url;
      return super.open(method, url, ...rest);
    }

    send(body) {
      const url = this.__trailieUrl || '';
      const method = String(this.__trailieMethod || '').toUpperCase();
      if (TRIP_WRITE_PATTERN.test(url) && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        this.addEventListener('load', () => {
          if (state.current) {
            applyWrite(state.current, {
              method,
              status: this.status,
              body,
              responseBody: this.responseText,
            });
          }
        });
      }
      return super.send(body);
    }
  }
  window.XMLHttpRequest = ObservedXhr;

  return state;
}

/**
 * Open a record for one submitted prompt. Called at the top of the real send
 * path, so a demo chip and a typed message are recorded identically.
 */
export function recordTrailieDemoSubmission({ prompt, authenticated, tripId }) {
  const state = getState();
  if (!state) return;

  const turn = createTurnRecord({ prompt, authenticated, tripId });
  turn.startedAtMs = performance.now();
  state.turns.push(turn);
  if (state.turns.length > MAX_TURNS) state.turns.shift();
  state.current = turn;

  console.info('[trailie-demo] submitted:', { prompt, authenticated: turn.authenticated, tripId: turn.tripId });
}

/** Attach the trip id once the turn's create/update write resolves it. */
export function recordTrailieDemoTripId(tripId) {
  const state = getState();
  if (!state?.current || !tripId) return;
  state.current.tripId = tripId;
}
