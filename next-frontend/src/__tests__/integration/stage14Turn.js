import { server, createSseRecorder } from './stage14Harness';

/**
 * Stage 14.6 — drives one authenticated-streaming turn using the REAL server
 * seams, writing REAL SSE frames.
 *
 * Real: `finalizeStructuredItinerary` (freeze), `buildRevisionOneOutbound`,
 * `buildRevisionTwoOutbound`, `assertItineraryUnchanged`, `buildMismatchSafeTerminal`,
 * `createEarlyEventEmitter`, `writeSseEvent`, `runProseConsistency` (buffer →
 * verify → one retry → deterministic fallback → sanitation).
 *
 * Synthetic: the two providers, and the HTTP layer.
 */

const {
  buildRevisionOneOutbound,
  buildRevisionTwoOutbound,
  assertItineraryUnchanged,
  buildMismatchSafeTerminal,
  createEarlyEventEmitter,
} = server.earlyRevisionEvents;
const { writeSseEvent } = server.sseStream;
const { runProseConsistency } = server.turn;
const { deepFreeze } = server.finalizeItinerary;

export const PROSE_CONFIG = { mode: 'enforce', maxChars: 20000, retryEnabled: true };

export const ITINERARY = {
  days: [
    {
      id: 'd1',
      day: 1,
      title: 'Canyon floor',
      stops: [{ id: 'd1s1', name: 'Visitor Center' }, { id: 'd1s2', name: 'Riverside Walk' }],
    },
    { id: 'd2', day: 2, title: 'Angels Landing', stops: [{ id: 'd2s1', name: 'Scout Lookout' }] },
  ],
};

/** Prose in the real Phase B marker contract, so the real verifier passes it. */
export const VERIFIED_PROSE = [
  '<!--TRAILIE_DAY:d1--> Canyon floor',
  '<!--TRAILIE_STOP:d1s1--> Visitor Center — maps and the shuttle stop.',
  '<!--TRAILIE_STOP:d1s2--> Riverside Walk — a paved stroll by the Virgin River.',
  '<!--TRAILIE_DAY:d2--> Angels Landing',
  '<!--TRAILIE_STOP:d2s1--> Scout Lookout — the turnaround below the chains.',
].join('\n');

/** Fails the real verifier: names no stops. */
export const UNVERIFIABLE_PROSE = 'A nice couple of days, broadly speaking.';

export function createProviderLedger() {
  return { phaseAFirst: 0, phaseARetry: 0, phaseBFirst: 0, phaseBRetry: 0, recoveryPhaseB: 0 };
}

/**
 * @returns {Promise<{recorder, ledger, revisionOne, revisionTwo, terminal, aborted}>}
 */
export async function runTurn({
  responseId = 'resp-1',
  itinerary = ITINERARY,
  responseVersion = 1,
  earlyEventsEnabled = true,
  structuredFailure = false,
  proseSequence = [VERIFIED_PROSE],
  mutateCandidateItinerary = false,
  ledger = createProviderLedger(),
  disconnectAfterItineraryReady = false,
  abortDuringPhaseB = false,
  replayProseAsChunks = true,
  emitDone = true,
  now = () => '2026-08-01T00:00:00.000Z',
} = {}) {
  const recorder = createSseRecorder();
  const responseIdentity = { responseId, responseVersion };
  const emitter = createEarlyEventEmitter({
    emit: (payload) => writeSseEvent(recorder.res, payload),
    enabled: earlyEventsEnabled,
  });

  emitter.responseStarted({ responseId, requiresStructuredItinerary: null });
  writeSseEvent(recorder.res, { type: 'thinking', stage: 'planning' });

  // ── Phase A ──────────────────────────────────────────────────────────────
  if (structuredFailure) {
    ledger.phaseAFirst += 1;
    // Prose-only fallback: legacy chunk streaming, then a direct-terminal done.
    const prose = 'Zion is busy in June. Aim for early mornings.';
    if (replayProseAsChunks) {
      writeSseEvent(recorder.res, { type: 'chunk', content: prose });
      writeSseEvent(recorder.res, { type: 'stream_end' });
    }
    if (emitDone) {
      writeSseEvent(recorder.res, {
        type: 'done',
        contentUnchanged: true,
        responseId,
        responseVersion,
        content: prose,
        contentHash: server.canonicalResponse.hashPayload(prose),
        itineraryHash: null,
        canonicalPlan: null,
      });
    }
    return { recorder, ledger, revisionOne: null, revisionTwo: null, terminal: null, aborted: false };
  }

  ledger.phaseAFirst += 1;
  const frozen = deepFreeze(JSON.parse(JSON.stringify(itinerary)));

  const revisionOne = buildRevisionOneOutbound({
    responseIdentity,
    finalizedItinerary: frozen,
    feasibilityIssues: [],
    parkName: 'Zion National Park',
    parkCode: 'zion',
    provider: 'synthetic',
    model: 'synthetic-model',
    now,
  });
  emitter.itineraryReady(revisionOne);

  if (disconnectAfterItineraryReady) {
    // The socket dies; Phase B is never entered, so nothing more is spent.
    return { recorder, ledger, revisionOne, revisionTwo: null, terminal: null, aborted: true };
  }

  emitter.proseGenerationStarted({ responseId });

  // ── Phase B (real verification / retry / fallback) ───────────────────────
  const controller = new AbortController();
  if (abortDuringPhaseB) controller.abort();

  let attempt = 0;
  const outcome = await runProseConsistency({
    toolFirst: {
      itineraryData: frozen,
      correctionsApplied: [],
      removedStops: [],
      feasibilityIssues: [],
    },
    baseSystemPrompt: '',
    deliverProse: async () => {
      attempt += 1;
      if (attempt === 1) ledger.phaseBFirst += 1;
      else ledger.phaseBRetry += 1;
      if (controller.signal.aborted) return { aborted: true };
      const content = proseSequence[Math.min(attempt - 1, proseSequence.length - 1)];
      return { content, provider: 'synthetic', model: 'synthetic-model' };
    },
    resolvedMetadata: { parkName: 'Zion National Park' },
    proseConfig: PROSE_CONFIG,
    emitThinking: () => {},
    signal: controller.signal,
    provider: 'synthetic',
    model: 'synthetic-model',
  });

  if (outcome?.aborted) {
    return { recorder, ledger, revisionOne, revisionTwo: null, terminal: null, aborted: true };
  }

  // The server replays the SELECTED prose as chunks before `prose_ready`.
  if (replayProseAsChunks) {
    writeSseEvent(recorder.res, { type: 'chunk', content: outcome.selectedProse });
    writeSseEvent(recorder.res, { type: 'stream_end' });
  }

  const candidateItinerary = mutateCandidateItinerary
    ? { days: [...frozen.days, { id: 'd3', day: 3, title: 'Injected', stops: [] }] }
    : frozen;

  const revisionTwo = buildRevisionTwoOutbound({
    responseIdentity,
    revisionOne,
    finalizedItinerary: candidateItinerary,
    selectedProse: outcome.selectedProse,
    usedDeterministicFallback: outcome.meta?.deterministicFallbackUsed === true,
    feasibilityIssues: [],
    parkName: 'Zion National Park',
    parkCode: 'zion',
    provider: 'synthetic',
    model: 'synthetic-model',
    now,
  });

  const immutability = assertItineraryUnchanged({ revisionOne, revisionTwo });
  let terminal = { envelope: revisionTwo.response, canonicalPlan: revisionTwo.canonicalPlan };

  if (immutability.ok) {
    emitter.proseReady(revisionTwo);
  } else {
    // Stage 14.2A fail-safe: discard the candidate, rebuild from the rev-1 snapshot.
    const safe = buildMismatchSafeTerminal({
      snapshot: revisionOne.snapshot,
      resolvedMetadata: { parkName: 'Zion National Park' },
      provider: 'synthetic',
      model: 'synthetic-model',
      auditTrail: null,
      now,
    });
    terminal = safe ? { envelope: safe.envelope, canonicalPlan: safe.canonicalPlan } : null;
  }

  if (emitDone && terminal) {
    emitter.sealTerminal();
    writeSseEvent(recorder.res, {
      type: 'done',
      contentUnchanged: false,
      content: terminal.envelope.content,
      responseId: terminal.envelope.responseId,
      responseVersion: terminal.envelope.responseVersion,
      responseRevision: terminal.envelope.responseRevision,
      lifecycleStatus: terminal.envelope.lifecycleStatus,
      contentHash: terminal.envelope.contentHash,
      itineraryHash: terminal.envelope.itineraryHash,
      canonicalPlan: terminal.canonicalPlan,
      provider: terminal.envelope.provider,
      model: terminal.envelope.model,
    });
  }

  return { recorder, ledger, revisionOne, revisionTwo, terminal, aborted: false, immutability };
}
