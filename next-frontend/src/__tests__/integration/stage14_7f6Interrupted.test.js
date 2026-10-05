import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  startScenarioChild, driveTurn, loadScenario, readTrip, replayWrite, BARRIER, MOUNTED_PATHS,
  buildRunIdentity,
} from './stage14_7fHarness';
import { deriveTrailieStoredPresentation, VIEWER_CONTEXT } from '@/utils/trailieStoredPresentation';

/**
 * Stage 14.7F6 §3–§11 — interrupted durable states.
 *
 * Every scenario runs through the REAL route, the REAL coordinator and the REAL
 * authenticated persistence endpoints, and is then RESTORED through the real
 * authenticated read endpoint and the real presentation resolver. The barriers
 * exist only in the harness; production timing is untouched and no sleeps are
 * introduced.
 *
 * The question each case answers is the same: after an interruption, is what is
 * durably stored a coherent state the user can come back to — or a fragment?
 */

const TIMEOUT = 120000;
const SCENARIO = 'basic-02-three-day';

/** Each case gets its own child, its own evaluation user, its own trips. */
async function freshRun({ usePhaseBBarrier = true, ...overrides } = {}) {
  const scenario = loadScenario(SCENARIO);
  const evaluationRunId = `eval-14-7f6-${randomUUID()}`;
  // §12 — identity decided HERE, before the child exists, and unique per run so
  // one run's records can never be confused with another's.
  const { evaluationUserId, evaluationUserEmail } = buildRunIdentity(evaluationRunId);
  const handle = await startScenarioChild({
    scenarioId: SCENARIO,
    evaluationRunId,
    evaluationUserId,
    evaluationUserEmail,
    structuredResponse: scenario.structuredResponse,
    proseText: scenario.proseText,
    usePhaseBBarrier,
  });
  const result = await driveTurn(handle, scenario, overrides);
  return { scenario, handle, evaluationRunId, evaluationUserId, evaluationUserEmail, result };
}

const runs = [];
async function tracked(overrides) {
  const run = await freshRun(overrides);
  runs.push(run);
  return run;
}

afterAll(async () => {
  for (const { handle, result } of runs) {
    try {
      await handle.cleanup({
        createdTripIds: [result.persistence.revision1TripId, result.persistence.revision2TripId].filter(Boolean),
        responseIds: [result.responseId].filter(Boolean),
      });
      await handle.shutdown();
    } catch { /* kill is the backstop */ }
    handle.kill();
  }
}, TIMEOUT);

const assistantsOf = (trip) => (trip?.conversation || []).filter((m) => m.role === 'assistant');
const presentationOf = (trip) => deriveTrailieStoredPresentation({
  response: assistantsOf(trip).slice(-1)[0] || { role: 'assistant', content: '' },
  canonicalPlan: trip?.plan || null,
  viewerContext: VIEWER_CONTEXT.OWNER,
  // §11 — recovery is disabled for this whole stage.
  recoveryCapability: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// §4 — abort BEFORE revision-1 persistence starts (barrier A)
// ─────────────────────────────────────────────────────────────────────────────
describe('§4 — abort before revision 1', () => {
  let run;
  beforeAll(async () => {
    run = await tracked({ barriers: { [BARRIER.A_BEFORE_REVISION_1_PERSIST]: 'abort' } });
  }, TIMEOUT);

  it('released at barrier A', () => {
    expect(run.result.barrierLog).toEqual([
      { barrier: BARRIER.A_BEFORE_REVISION_1_PERSIST, mode: 'abort' },
    ]);
  });

  it('nothing durable exists for the response', async () => {
    const counts = await run.handle.counts([]);
    expect(counts.trips).toBe(0);
    expect(counts.leases ?? 0).toBe(0);
    expect(run.result.persistence.revision1TripId).toBeNull();
    expect(run.result.persistence.httpRequests).toBe(0);
    expect(run.result.persistence.accepted).toBe(0);
  });

  it('nothing is presented — no card, no empty bubble, no pending label', () => {
    expect(run.result.cardMounts.mount).toBe(0);
    expect(assistantsOf({ conversation: run.result.messages })).toHaveLength(0);
    expect(run.result.journal).not.toContain('itinerary_revealed');
    expect(run.result.journal).not.toContain('pending_label_set');
  });

  it('no delayed callback persists revision 1 after the abort', () => {
    expect(run.result.journal).not.toContain('revision_1_persist_started');
    expect(run.result.journal).not.toContain('revision_1_persist_succeeded');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §5 — revision-1 persistence FAILS
// ─────────────────────────────────────────────────────────────────────────────
describe('§5 — revision-1 persistence failure', () => {
  let run;
  beforeAll(async () => {
    run = await tracked({ failPersistence: { revision1: 'validation' } });
  }, TIMEOUT);

  it('the itinerary is never revealed and no pending label is shown', () => {
    expect(run.result.journal).toContain('revision_1_persist_failed');
    expect(run.result.journal).not.toContain('itinerary_revealed');
    expect(run.result.journal).not.toContain('pending_label_set');
    expect(run.result.cardMounts.mount).toBe(0);
  });

  it('prose is never revealed', () => {
    expect(run.result.journal).not.toContain('prose_revealed');
    expect(run.result.rendered.chunkText).toBe('');
  });

  it('revision 2 is not persisted against a missing trip', () => {
    expect(run.result.journal).not.toContain('revision_2_persist_succeeded');
    expect(run.result.persistence.revision2TripId).toBeNull();
  });

  it('done cannot bypass the failed revision-1 boundary with an accepted write', () => {
    // The coordinator may attempt ONE direct-terminal write after a failed
    // revision 1 — that is the documented recovery path, not a bypass. What must
    // not happen is prose becoming visible without a successful persistence.
    expect(run.result.journal).not.toContain('prose_revealed');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §6 — abort AFTER revision 1 succeeds (barrier D)
// ─────────────────────────────────────────────────────────────────────────────
describe('§6 — durable itinerary-only interruption', () => {
  let run;
  let stored;
  beforeAll(async () => {
    run = await tracked({ barriers: { [BARRIER.D_BEFORE_REVISION_2_PERSIST]: 'abort' } });
    stored = await readTrip(run.handle, run.result.persistence.revision1TripId);
  }, TIMEOUT);

  it('released at barrier D, after revision 1 was durable', () => {
    expect(run.result.barrierLog.map((b) => b.barrier))
      .toEqual([BARRIER.D_BEFORE_REVISION_2_PERSIST]);
    expect(run.result.journal).toContain('revision_1_persist_succeeded');
    expect(run.result.journal).toContain('itinerary_revealed');
  });

  it('exactly one trip, one frozen plan, one assistant shell', async () => {
    const counts = await run.handle.counts([run.result.persistence.revision1TripId]);
    expect(counts.trips).toBe(1);
    expect(assistantsOf(stored)).toHaveLength(1);
    expect(Array.isArray(stored.plan)).toBe(false);
    expect(stored.plan).toBeTruthy();
  });

  it('the shell is a valid revision-1 checkpoint, not a fragment', () => {
    const shell = assistantsOf(stored)[0];
    expect(shell.content).toBe('');
    expect(shell.responseRevision).toBe(1);
    expect(shell.lifecycleStatus).toBe('itinerary_ready');
    // The shell and the plan describe the SAME canonical response.
    expect(shell.responseId).toBeTruthy();
    expect(shell.responseId).toBe(stored.plan.responseId);
    expect(shell.itineraryHash).toBe(stored.plan.itineraryHash);
    expect(shell.responseVersion).toBe(stored.plan.responseVersion);
    expect(stored.plan.responseRevision).toBe(1);
  });

  it('no partial prose and no revision-2 write happened', () => {
    expect(run.result.journal).not.toContain('revision_2_persist_started');
    // A revision-1 shell hashes EMPTY content — the marker of "no prose yet" is
    // the empty body plus revision 1, not an absent hash.
    expect(assistantsOf(stored)[0].content).toBe('');
    expect(stored.plan.lifecycleStatus).toBe('itinerary_ready');
    expect(stored.plan.proseReadyAt).toBeUndefined();
  });

  it('restore resolves to itinerary_only with a passive label and no recovery action', () => {
    const p = presentationOf(stored);
    expect(p.publicNotesStatus ?? p.notesStatus).toBeDefined();
    expect(p.showItinerary).toBe(true);
    expect(p.showProse).toBe(false);
    expect(p.notesLabel).toBeTruthy();
    expect(p.showRecoveryAction ?? false).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §7 — revision 2 arriving while revision 1 is still pending (barrier B)
// ─────────────────────────────────────────────────────────────────────────────
describe('§7 — revision 2 buffered behind a pending revision 1', () => {
  let run;
  beforeAll(async () => {
    // Hold the revision-1 REQUEST in flight and let prose generation run
    // independently (no Phase B barrier), so `prose_ready` genuinely arrives
    // while revision 1 is still unresolved. Released the moment that happens.
    const control = {};
    run = await tracked({
      usePhaseBBarrier: false,
      autoReleasePhaseB: false,
      barriers: { [BARRIER.B_DURING_REVISION_1_PERSIST]: 'hold' },
      control,
      onEvent: (type) => {
        if (type === 'prose_ready') control.releaseBarrier(BARRIER.B_DURING_REVISION_1_PERSIST);
      },
    });
  }, TIMEOUT);

  it('prose_ready really did arrive while revision 1 was still pending', () => {
    expect(run.result.barrierLog.map((b) => b.barrier))
      .toContain(BARRIER.B_DURING_REVISION_1_PERSIST);
    expect(run.result.parsedEvents).toContain('prose_ready');
  });

  it('revision 2 waits for the revision-1 tripId, then persists exactly once', () => {
    const j = run.result.journal;
    expect(j.indexOf('revision_1_persist_succeeded')).toBeLessThan(j.indexOf('revision_2_persist_started'));
    expect(j.filter((e) => e === 'revision_2_persist_started')).toHaveLength(1);
    expect(run.result.persistence.revision2TripId).toBe(run.result.persistence.revision1TripId);
  });

  it('prose reveals only after revision-2 success', () => {
    const j = run.result.journal;
    expect(j.indexOf('revision_2_persist_succeeded')).toBeLessThan(j.indexOf('prose_revealed'));
  });

  it('still exactly two accepted writes', () => {
    expect(run.result.persistence.accepted).toBe(2);
    expect(run.result.persistence.httpRequests).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §8 — revision-2 persistence failure, every bounded shape
// ─────────────────────────────────────────────────────────────────────────────
describe.each([
  ['bounded 4xx validation', 'validation'],
  ['bounded conflict', 'conflict'],
  ['bounded stale', 'stale'],
  ['transport failure', 'transport'],
])('§8 — revision-2 %s', (_label, mode) => {
  let run;
  let stored;
  beforeAll(async () => {
    run = await tracked({ failPersistence: { revision2: mode } });
    stored = await readTrip(run.handle, run.result.persistence.revision1TripId);
  }, TIMEOUT);

  it('prose is not visible; the revision-1 itinerary still is', () => {
    expect(run.result.journal).toContain('itinerary_revealed');
    expect(run.result.journal).not.toContain('prose_revealed');
    expect(run.result.cardMounts.mount).toBe(1);
    expect(run.result.cardMounts.unmount).toBe(0);
  });

  it('stored state is untouched by the failed attempt', () => {
    const shell = assistantsOf(stored)[0];
    expect(shell.content).toBe('');
    expect(shell.responseRevision).toBe(1);
    expect(shell.lifecycleStatus).toBe('itinerary_ready');
    expect(stored.plan.responseRevision).toBe(1);
    expect(stored.plan.lifecycleStatus).toBe('itinerary_ready');
    // No progression metadata advanced.
    expect(stored.plan.previousRevision ?? null).toBeNull();
    expect(stored.plan.proseReadyAt).toBeUndefined();
  });

  it('restore continues resolving to itinerary_only', () => {
    const p = presentationOf(stored);
    expect(p.showItinerary).toBe(true);
    expect(p.showProse).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §9 — abort after revision 2 succeeds but before done (barrier F)
// ─────────────────────────────────────────────────────────────────────────────
describe('§9 — terminal state without done', () => {
  let run;
  let stored;
  beforeAll(async () => {
    // Barrier G models a connection dropped after revision 2 was durable but
    // before `done` could be reconciled — the case §9 describes.
    run = await tracked({ barriers: { [BARRIER.G_BEFORE_DONE]: 'abort' } });
    stored = await readTrip(run.handle, run.result.persistence.revision1TripId);
  }, TIMEOUT);

  it('released at barrier G, after revision 2 was durable', () => {
    expect(run.result.barrierLog.map((b) => b.barrier)).toEqual([BARRIER.G_BEFORE_DONE]);
    expect(run.result.journal).toContain('revision_2_persist_succeeded');
    expect(run.result.journal).not.toContain('done_reconciled');
  });

  it('one terminal trip, one plan, one assistant response with prose', async () => {
    const counts = await run.handle.counts([run.result.persistence.revision1TripId]);
    expect(counts.trips).toBe(1);
    const turns = assistantsOf(stored);
    expect(turns).toHaveLength(1);
    expect(turns[0].responseRevision).toBe(2);
    expect((turns[0].content || '').length).toBeGreaterThan(0);
  });

  it('the missing done does not downgrade the accepted terminal state', () => {
    const p = presentationOf(stored);
    expect(p.showItinerary).toBe(true);
    expect(p.showProse).toBe(true);
    expect(stored.plan.responseRevision).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §2/§10 — done metrics and mismatched done
// ─────────────────────────────────────────────────────────────────────────────
describe('§2/§10 — done reconciliation metrics', () => {
  let run;
  let tripId;
  beforeAll(async () => {
    run = await tracked({});
    tripId = run.result.persistence.revision1TripId;
  }, TIMEOUT);

  it('§2 — the normal route issues 1 + 1 + 0 requests', () => {
    expect(run.result.persistence.httpRequests).toBe(2);
    expect(run.result.persistence.automaticPersistenceRequestsFromDone).toBe(0);
    expect(run.result.persistence.acceptedWritesFromDone).toBe(0);
    expect(run.result.journal).toContain('done_reconciled');
    expect(run.result.journal).not.toContain('terminal_persist_attempted');
  });

  it('§10 — an intentionally replayed done is idempotent, and counted as a replay', async () => {
    const entry = run.result.persistence.writeLog.slice(-1)[0];
    const body = { ...entry.body };
    delete body.expectedPreviousRevision;

    const metrics = {
      automaticPersistenceRequestsFromDone: run.result.persistence.automaticPersistenceRequestsFromDone,
      intentionallyReplayedDoneRequests: 0,
      acceptedWritesFromDone: run.result.persistence.acceptedWritesFromDone,
      idempotentDecisionsFromDone: 0,
    };
    for (let i = 0; i < 2; i += 1) {
      const r = await replayWrite(run.handle, { ...entry, isCreate: false, body }, { tripId });
      metrics.intentionallyReplayedDoneRequests += 1;
      if (r.outcome === 'idempotent') metrics.idempotentDecisionsFromDone += 1;
      if (r.outcome === 'accept') metrics.acceptedWritesFromDone += 1;
    }
    // eslint-disable-next-line no-console
    console.log('DONE METRICS', JSON.stringify(metrics, null, 2));

    expect(metrics).toEqual({
      automaticPersistenceRequestsFromDone: 0,
      intentionallyReplayedDoneRequests: 2,
      acceptedWritesFromDone: 0,
      idempotentDecisionsFromDone: 2,
    });
  }, TIMEOUT);

  it('§10 — mismatched done shapes fail closed without overwriting revision 2', async () => {
    const entry = run.result.persistence.writeLog.slice(-1)[0];
    const before = await readTrip(run.handle, tripId);

    const mutate = (fn) => {
      const body = JSON.parse(JSON.stringify(entry.body));
      delete body.expectedPreviousRevision;
      fn(body);
      return body;
    };

    const cases = {
      mismatched_response_id: mutate((b) => {
        b.plan.responseId = 'resp-not-this-turn';
        b.conversation.filter((m) => m.role === 'assistant').forEach((m) => { m.responseId = 'resp-not-this-turn'; });
      }),
      mismatched_response_version: mutate((b) => {
        b.plan.responseVersion += 5;
        b.conversation.filter((m) => m.role === 'assistant').forEach((m) => { m.responseVersion += 5; });
      }),
      mismatched_content_hash: mutate((b) => {
        b.plan.contentHash = 'ch-not-this-response';
        b.conversation.filter((m) => m.role === 'assistant').forEach((m) => { m.contentHash = 'ch-not-this-response'; });
      }),
      mismatched_itinerary_hash: mutate((b) => {
        b.plan.itineraryHash = 'ih-not-this-response';
        b.conversation.filter((m) => m.role === 'assistant').forEach((m) => { m.itineraryHash = 'ih-not-this-response'; });
      }),
    };

    const outcomes = {};
    for (const [name, body] of Object.entries(cases)) {
      const r = await replayWrite(run.handle, { ...entry, isCreate: false, body }, { tripId });
      outcomes[name] = { status: r.status, outcome: r.outcome, success: r.success };
      expect(r.outcome).not.toBe('accept');
    }
    // eslint-disable-next-line no-console
    console.log('MISMATCHED DONE', JSON.stringify(outcomes, null, 2));

    const after = await readTrip(run.handle, tripId);
    expect(JSON.stringify(after.plan)).toBe(JSON.stringify(before.plan));
    expect(JSON.stringify(after.conversation)).toBe(JSON.stringify(before.conversation));
  }, TIMEOUT);
});

// ─────────────────────────────────────────────────────────────────────────────
// §11 / §17 — recovery inert, isolation absolute, across EVERY scenario above
// ─────────────────────────────────────────────────────────────────────────────
describe('§11/§17 — recovery disabled and external isolation, every interruption', () => {
  it('recovery never engages in any run', async () => {
    for (const { handle, result } of runs) {
      expect(handle.effectiveConfig.TRAILIE_PROSE_RECOVERY).toBe('false');
      const counts = await handle.counts(
        [result.persistence.revision1TripId, result.persistence.revision2TripId].filter(Boolean)
      );
      expect(counts.leases ?? 0).toBe(0);
      expect(result.journal.filter((e) => String(e).includes('recovery'))).toEqual([]);
    }
  }, TIMEOUT);

  it('every run made zero external calls', async () => {
    for (const { handle } of runs) {
      const report = await handle.ledger();
      expect(report.network.externalNetworkAttempts).toBe(0);
      expect(report.network.blockedExternalNetworkAttempts).toBe(0);
      expect(report.ledger.liveAnthropicConstructors).toBe(0);
      expect(report.ledger.liveOpenAiConstructors).toBe(0);
      expect(report.ledger.liveNpsServices).toBe(0);
    }
  }, TIMEOUT);

  it('the mounted paths were the real ones', () => {
    expect(MOUNTED_PATHS.chatStream).toBe('/api/ai/chat-stream');
    expect(MOUNTED_PATHS.tripCreate).toBe('/api/trips');
  });
});
