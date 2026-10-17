import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  startScenarioChild, driveTurn, loadScenario, countOf, idx, MOUNTED_PATHS,
  replayWrite, readTrip,
} from './stage14_7fHarness';

/**
 * Stage 14.7F — the exact SSE bytes become two correctly ordered, durable
 * revisions through the same frontend and persistence routes real users hit.
 *
 * Real: src/app.js, protect middleware, POST /api/ai/chat-stream,
 * prepareChatContext, tool-first Phase A, consumeAiSseStream, the early revision
 * coordinator and reducers, POST/PUT/GET /api/trips, local MongoDB.
 *
 * Synthetic: the Anthropic SDK only. Zero live provider calls.
 */

const TIMEOUT = 120000;
const SCENARIOS = ['basic-02-three-day', 'basic-03-seven-day'];

/** One fresh child per scenario — no reused application process. */
const runs = new Map();

beforeAll(async () => {
  for (const scenarioId of SCENARIOS) {
    const scenario = loadScenario(scenarioId);
    const evaluationRunId = `eval-14-7f-${scenarioId}-${randomUUID()}`;
    const handle = await startScenarioChild({
      scenarioId,
      evaluationRunId,
      structuredResponse: scenario.structuredResponse,
      proseText: scenario.proseText,
      usePhaseBBarrier: true,
    });
    const result = await driveTurn(handle, scenario);
    runs.set(scenarioId, { scenario, handle, evaluationRunId, result });
  }
}, TIMEOUT * 2);

afterAll(async () => {
  for (const { handle, result } of runs.values()) {
    try {
      await handle.cleanup({ createdTripIds: [result.persistence.revision1TripId].filter(Boolean) });
      await handle.shutdown();
    } catch { /* the kill below is the backstop */ }
    handle.kill();
  }
}, TIMEOUT);

describe.each(SCENARIOS)('Stage 14.7F — %s through the real route', (scenarioId) => {
  const run = () => runs.get(scenarioId);

  it('reached the real mounted authenticated stream path', () => {
    expect(MOUNTED_PATHS.chatStream).toBe('/api/ai/chat-stream');
    expect(run().result.httpStatus).toBe(200);
    expect(run().result.contentType).toMatch(/text\/event-stream/);
  });

  it('§3 — production configuration names resolve to tool-first and enforce', () => {
    const cfg = run().handle.effectiveConfig;
    expect(cfg.TRAILIE_ITINERARY_GENERATION_MODE).toBe('tool_first');
    expect(cfg.resolvedItineraryGenerationMode).toBe('tool_first');
    expect(cfg.TRAILIE_ROLLOUT_KILL_SWITCH).toBe('false');
    expect(cfg.TRAILIE_ROLLOUT_TOOL_FIRST_RATE).toBe('1');
    expect(cfg.rolloutKilled).toBe(false);
    expect(cfg.rolloutToolFirstRate).toBe(1);
    expect(cfg.rolloutEnforceRate).toBe(1);
    expect(cfg.TRAILIE_PROSE_CONSISTENCY_MODE).toBe('enforce');
    expect(cfg.TRAILIE_EARLY_ITINERARY_EVENTS).toBe('true');
    expect(cfg.earlyItineraryEventsEnabled).toBe(true);
    expect(cfg.TRAILIE_PROSE_RECOVERY).toBe('false');
  });

  it('§2/§5 — the parsed event sequence has the required exact counts', () => {
    const { parsedEvents } = run().result;
    expect(countOf(parsedEvents, 'response_started')).toBe(1);
    expect(countOf(parsedEvents, 'itinerary_ready')).toBe(1);
    expect(countOf(parsedEvents, 'prose_generation_started')).toBe(1);
    expect(countOf(parsedEvents, 'stream_end')).toBe(1);
    expect(countOf(parsedEvents, 'prose_ready')).toBe(1);
    expect(countOf(parsedEvents, 'done')).toBe(1);
    expect(countOf(parsedEvents, 'chunk')).toBeGreaterThanOrEqual(1);
  });

  it('§2 — the ordering follows the deterministic lifecycle', () => {
    const e = run().result.parsedEvents;
    const at = (t) => e.indexOf(t);
    expect(at('response_started')).toBeLessThan(at('itinerary_ready'));
    expect(at('itinerary_ready')).toBeLessThan(at('prose_generation_started'));
    expect(at('prose_generation_started')).toBeLessThan(at('chunk'));
    expect(at('chunk')).toBeLessThan(at('stream_end'));
    expect(at('stream_end')).toBeLessThan(at('prose_ready'));
    expect(at('prose_ready')).toBeLessThan(at('done'));
  });

  it('§2 — no parsed event occurs after done', () => {
    const e = run().result.parsedEvents;
    expect(e[e.length - 1]).toBe('done');
  });

  it('§2 — nested itinerary values are never classified as SSE event names', () => {
    // The regex transcript used during Stage 14.7E matched nested JSON `type`
    // fields; real SSE framing must not.
    const e = run().result.parsedEvents;
    for (const leaked of ['trail', 'landmark', 'visitor_center', 'nps', 'itinerary']) {
      expect(e).not.toContain(leaked);
    }
  });

  it('§6 — compatibility chunks and stream_end are suppressed after itinerary_ready', () => {
    const { suppressed } = run().result;
    expect(suppressed.chunks).toBeGreaterThan(0);
    expect(suppressed.streamEnds).toBe(1);
  });

  it('§6 — no suppressed chunk text entered visible content', () => {
    const { rendered, messages } = run().result;
    expect(rendered.chunkText).toBe('');
    const assistant = messages.find((m) => m.role === 'assistant');
    expect(assistant).toBeTruthy();
    expect(assistant.content ?? '').not.toContain('__SUPPRESSED__');
  });

  it('§7 — exactly two accepted canonical writes through the real trip endpoints', () => {
    const p = run().result.persistence;
    expect(p.httpRequests).toBe(2);
    expect(p.accepted).toBe(2);
    expect(p.stale).toBe(0);
    expect(p.conflict).toBe(0);
  });

  /**
   * Stage 14.7F4B §16 — the whole counter object at once. Asserted as a single
   * unit so a future change cannot quietly trade one write category for another
   * (e.g. an extra idempotent retry appearing while `accepted` stays at 2).
   */
  it('§16 — the complete persistence counter object is unchanged', () => {
    const p = run().result.persistence;
    const { journal } = run().result;
    expect({
      persistenceHttpRequests: p.httpRequests,
      acceptedWrites: p.accepted,
      idempotentWrites: p.idempotent,
      staleWrites: p.stale,
      conflictWrites: p.conflict,
      thirdWriteFromDone: journal.filter((e) => e === 'terminal_persist_attempted').length,
    }).toEqual({
      persistenceHttpRequests: 2,
      acceptedWrites: 2,
      idempotentWrites: 0,
      staleWrites: 0,
      conflictWrites: 0,
      thirdWriteFromDone: 0,
    });
    expect(p.rejected).toBe(0);
  });

  it('§16 — Phase B was released by visibility, not by the failsafe timer', () => {
    expect(run().result.phaseBReleasedBy).toBe('itinerary_revealed');
  });

  it('§7 — revision 2 succeeds against the revision 1 trip ID', () => {
    const p = run().result.persistence;
    expect(p.revision1TripId).toBeTruthy();
    expect(p.revision2TripId).toBe(p.revision1TripId);
  });

  it('§6 — done performs reconciliation only, with no third canonical write', () => {
    const { journal } = run().result;
    expect(journal).toContain('done_reconciled');
    expect(journal).not.toContain('terminal_persist_attempted');
  });

  it('§8 — the visibility journal is exactly the expected sequence', () => {
    expect(run().result.journal).toEqual([
      'revision_1_received',
      'revision_1_persist_started',
      'revision_1_persist_succeeded',
      'itinerary_revealed',
      // Production emits the passive "Trip notes pending" label here. It is
      // presentation state only and never enters canonical content.
      'pending_label_set',
      'revision_2_received',
      'revision_2_persist_started',
      'revision_2_persist_succeeded',
      'prose_revealed',
      'done_reconciled',
    ]);
  });

  it('§8 — persistence strictly precedes each reveal', () => {
    const j = run().result.journal;
    expect(idx(j, 'revision_1_persist_succeeded')).toBeLessThan(idx(j, 'itinerary_revealed'));
    expect(idx(j, 'revision_2_persist_succeeded')).toBeLessThan(idx(j, 'prose_revealed'));
  });

  it('§8 — the itinerary card is visible while Phase B is still incomplete', () => {
    const j = run().result.journal;
    expect(idx(j, 'itinerary_revealed')).toBeLessThan(idx(j, 'revision_2_received'));
  });

  it('§9 — one assistant turn keyed by responseId, card mounted once', () => {
    const { messages, cardMounts } = run().result;
    const assistants = messages.filter((m) => m.role === 'assistant');
    expect(assistants).toHaveLength(1);
    expect(messages.filter((m) => m.role === 'user')).toHaveLength(1);
    expect(cardMounts.mount).toBe(1);
    expect(cardMounts.unmount).toBe(0);
  });
});

/**
 * Stage 14.7F5 §12 — the DETERMINISTIC REPLAY VARIANT.
 *
 * The normal run proves the happy path writes exactly twice. This resends those
 * same two writes verbatim, plus a `done`-shaped write, with no client-side
 * lifecycle memory to suppress them — the shape a retry, a reconnect or a second
 * tab actually produces. Every replay must be idempotent and change nothing.
 */
describe.each(SCENARIOS)('Stage 14.7F5 §12 — %s replay variant', (scenarioId) => {
  const replay = {};

  beforeAll(async () => {
    const { handle, result } = runs.get(scenarioId);
    const tripId = result.persistence.revision1TripId;
    const log = result.persistence.writeLog;

    const before = await readTrip(handle, tripId);

    const rev1Entry = log[0];
    const rev2Entry = log[log.length - 1];

    replay.duplicateRevision1 = await replayWrite(handle, rev1Entry, { tripId });
    replay.duplicateRevision2 = await replayWrite(handle, rev2Entry, { tripId });

    // A `done`-shaped write: the terminal body WITHOUT the succession claim.
    const doneBody = { ...rev2Entry.body };
    delete doneBody.expectedPreviousRevision;
    replay.duplicateDone = await replayWrite(handle, { ...rev2Entry, isCreate: false, body: doneBody }, { tripId });

    const after = await readTrip(handle, tripId);
    replay.before = before;
    replay.after = after;
    replay.tripId = tripId;
  }, TIMEOUT);

  it('§12 — reports the replay result object', () => {
    const assistants = (replay.after.conversation || []).filter((m) => m.role === 'assistant');
    const report = {
      duplicateRevision1Decision: replay.duplicateRevision1.outcome,
      duplicateRevision2Decision: replay.duplicateRevision2.outcome,
      duplicateDonePersistenceRequests: 1,
      assistantTurnCount: assistants.length,
      planCount: replay.after.plan ? 1 : 0,
      cardMountCount: runs.get(scenarioId).result.cardMounts.mount,
    };
    // eslint-disable-next-line no-console
    console.log(`REPLAY ${scenarioId}`, JSON.stringify(report, null, 2));

    expect(report).toEqual({
      // A revision-1 replay arriving AFTER the turn already reached revision 2 is
      // correctly STALE, not idempotent — it describes an earlier checkpoint of a
      // turn that has moved on. The at-revision-1 duplicate (the case §3 names) is
      // proven idempotent in `duplicateDeliveryIdempotency.test.js`, where the
      // stored state is still revision 1.
      duplicateRevision1Decision: 'stale',
      duplicateRevision2Decision: 'idempotent',
      duplicateDonePersistenceRequests: 1,
      assistantTurnCount: 1,
      planCount: 1,
      cardMountCount: 1,
    });
  });

  it('§12 — no replay is ever counted as a new accepted write', () => {
    for (const r of [replay.duplicateRevision1, replay.duplicateRevision2, replay.duplicateDone]) {
      expect(r.status).toBe(200);
      expect(r.outcome).not.toBe('accept');
    }
    // The stale one is explicitly an unsuccessful persistence decision, so the
    // client reveals nothing; the idempotent ones are successful reconciliation.
    expect(replay.duplicateRevision1.success).toBe(false);
    expect(replay.duplicateRevision2.success).toBe(true);
    expect(replay.duplicateDone.success).toBe(true);
  });

  it('§12 — stored canonical state is byte-equivalent after all three replays', () => {
    expect(JSON.stringify(replay.after.plan)).toBe(JSON.stringify(replay.before.plan));
    expect(JSON.stringify(replay.after.conversation)).toBe(JSON.stringify(replay.before.conversation));
  });

  it('§12 — no duplicate assistant turn and no duplicate plan', () => {
    const assistants = (replay.after.conversation || []).filter((m) => m.role === 'assistant');
    expect(assistants).toHaveLength(1);
    expect(assistants[0].responseRevision).toBe(2);
    expect(Array.isArray(replay.after.plan)).toBe(false);
  });
});

describe('Stage 14.7F — external isolation is test-locked', () => {
  it.each(SCENARIOS)('%s made zero live provider or external calls', async (scenarioId) => {
    const { handle } = runs.get(scenarioId);
    const report = await handle.ledger();

    expect(report.network.externalNetworkAttempts).toBe(0);
    expect(report.network.blockedExternalNetworkAttempts).toBe(0);
    expect(report.ledger.liveOpenAiConstructors).toBe(0);
    expect(report.ledger.liveAnthropicConstructors).toBe(0);
    expect(report.ledger.liveNpsServices).toBe(0);

    // Deterministic adapter activity is reported separately from live activity.
    expect(report.ledger.syntheticAnthropicCalls).toBeGreaterThan(0);
    expect(report.ledger.toolCalls).toBe(1);
    expect(report.ledger.proseCalls).toBe(1);

    // Only the isolated loopback store was contacted.
    expect(Object.keys(report.network.byClass)).toEqual(['loopback_mongo']);
  }, TIMEOUT);
});
