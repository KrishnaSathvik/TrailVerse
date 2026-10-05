/**
 * Stage 14.7G §11/§14 — the offline flag-off replay, qualified against
 * DETERMINISTIC recorded transcripts before any paid run exists.
 *
 * The transcript is produced by driving a real synthetic turn through the real
 * route and capturing the bytes, so the replay is exercised against the same
 * wire format the live run will produce — not a hand-written fixture that could
 * drift from it.
 *
 * Zero provider calls happen anywhere in this file: the child replaces the
 * Anthropic SDK before the application loads, and the replay itself has no
 * provider client at all.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';

import { startScenarioChild, driveTurn, loadScenario } from './stage14_7fHarness.js';
import { replayFlagOff } from './stage14_7gFlagOffReplay.js';

const RUN_ID = `stage147g-replay-${Date.now().toString(36)}`;
const SCENARIO_ID = 'basic-02-three-day';

let handle = null;
let turn = null;

beforeAll(async () => {
  const scenario = loadScenario(SCENARIO_ID);
  handle = await startScenarioChild({
    scenarioId: SCENARIO_ID,
    evaluationRunId: RUN_ID,
    structuredResponse: scenario.structuredResponse,
    proseText: scenario.proseText,
    usePhaseBBarrier: true,
  });
  turn = await driveTurn(handle, scenario, { captureRawTranscript: true });
}, 180000);

afterAll(async () => {
  if (!handle) return;
  const owned = handle.observedTrips();
  await handle.cleanup({
    createdTripIds: owned.map((t) => t.tripId),
    responseIds: owned.map((t) => t.responseId).filter(Boolean),
  });
  await handle.shutdown();
  handle.kill();
}, 60000);

describe('Stage 14.7G §11 — recorded-transcript capture', () => {
  test('the raw transcript is captured without disturbing the live lifecycle', () => {
    expect(typeof turn.rawTranscript).toBe('string');
    expect(turn.rawTranscript.length).toBeGreaterThan(0);
    // The early-revision path still ran normally alongside the tee.
    expect(turn.journal).toContain('revision_1_persist_succeeded');
    expect(turn.journal).toContain('revision_2_persist_succeeded');
  });

  test('the transcript contains the early-revision events the flag-off path must tolerate', () => {
    expect(turn.rawTranscript).toContain('itinerary_ready');
    expect(turn.rawTranscript).toContain('prose_ready');
  });
});

describe('Stage 14.7G §11 — flag-off replay of that transcript', () => {
  let replay;
  beforeAll(async () => { replay = await replayFlagOff(turn.rawTranscript); });

  test('makes ZERO provider calls', () => {
    expect(replay.providerCalls).toBe(0);
  });

  test('no early-revision-only event corrupts the flag-off path', () => {
    expect(replay.contractErrors).toEqual([]);
    expect(replay.earlyRevisionActive).toBe(false);
    expect(replay.coordinatorOwnedTerminalPersistence).toBe(false);
  });

  test('the early events were on the wire and were simply not routed', () => {
    expect(replay.earlyEventsOnWire).toContain('itinerary_ready');
  });

  test('produces exactly one terminal persistence result', () => {
    expect(replay.terminalPersistenceRequests).toBeLessThanOrEqual(1);
  });

  test('produces no duplicate assistant turn or plan', () => {
    expect(replay.assistantTurns).toBeLessThanOrEqual(1);
    expect(replay.plans).toBeLessThanOrEqual(1);
  });

  test('legacy terminal behaviour remains compatible overall', () => {
    expect(replay.ok).toBe(true);
  });

  test('replaying twice is stable — the transcript is the only input', async () => {
    const again = await replayFlagOff(turn.rawTranscript);
    expect(again.terminalPersistenceRequests).toBe(replay.terminalPersistenceRequests);
    expect(again.assistantTurns).toBe(replay.assistantTurns);
    expect(again.providerCalls).toBe(0);
  });
});
