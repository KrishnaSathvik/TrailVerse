import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID, createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createRequire } from 'module';
import {
  startScenarioChild, driveTurn, loadScenario, readTrip, buildRunIdentity,
} from './stage14_7fHarness';

const TIMEOUT = 120000;
const REPO_ROOT = resolve(process.cwd(), '..');
const LIVE_EVIDENCE = resolve(
  REPO_ROOT,
  'artifacts/private/stage14_7-live/stage147g-mshqzkal-cda9db',
  'basic-02-three-day-model-fix-validation-1.json',
);
const EXPECTED_JOURNAL = [
  'revision_1_received', 'revision_1_persist_started', 'revision_1_persist_succeeded',
  'itinerary_revealed', 'pending_label_set', 'revision_2_received',
  'revision_2_persist_started', 'revision_2_persist_succeeded',
  'prose_revealed', 'done_reconciled',
];

const require = createRequire(import.meta.url);
const {
  compareCanonicalStates,
  validateCanonicalItinerary,
} = require(resolve(REPO_ROOT, 'server/src/eval/stage14_7/canonicalEvidenceRepair.js'));
const {
  deriveTrailieStoredPresentation,
} = require(resolve(REPO_ROOT, 'server/src/utils/trailieStoredPresentation.js'));

const handles = [];
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

afterAll(async () => {
  for (const handle of handles) {
    try { await handle.shutdown(); } catch { /* kill is the backstop */ }
    handle.kill();
  }
}, TIMEOUT);

describe('Stage 14.7P — exact captured live transcript replay', () => {
  it('drives preserved bytes through parser, coordinator, isolated persistence and authenticated restore', async () => {
    const evidence = JSON.parse(readFileSync(LIVE_EVIDENCE, 'utf8'));
    const scenario = loadScenario('basic-02-three-day');
    const identity = buildRunIdentity(`stage147p-replay-${randomUUID()}`);
    const handle = await startScenarioChild({
      scenarioId: 'basic-02-three-day',
      structuredResponse: scenario.structuredResponse,
      proseText: scenario.proseText,
      usePhaseBBarrier: false,
      ...identity,
    });
    handles.push(handle);

    const foreign = await handle.seedForeignRun({
      email: `stage147p-foreign-${randomUUID()}@example.com`,
      responseId: `stage147p-foreign-${randomUUID()}`,
    });
    const foreignBefore = (await handle.counts([], foreign.userId)).foreign;
    const mongoBefore = await handle.mongoAvailability();

    const turn = await driveTurn(handle, scenario, {
      rawTranscriptOverride: evidence.rawSseTranscript,
      captureRawTranscript: true,
    });
    const stored = await readTrip(handle, turn.tripId);
    const storedAssistant = stored.conversation.filter((message) => message.role === 'assistant').at(-1);
    const restoredPresentation = deriveTrailieStoredPresentation({
      response: storedAssistant,
      canonicalPlan: stored.plan,
    });
    const canonicalIdentityDiff = compareCanonicalStates([
      ['A_accepted_phase_a_plan', turn.state.revision1.canonicalPlan],
      ['B_itinerary_ready_revision_1_response', turn.state.revision1.canonicalPlan],
      ['C_revision_1_persistence_payload', turn.persistence.writeLog[0].body.plan],
      ['D_stored_revision_1_trip', turn.persistence.storedRevision1Trip.plan],
      ['E_prose_ready_revision_2_response', turn.state.revision2.canonicalPlan],
      ['F_revision_2_persistence_payload', turn.persistence.writeLog[1].body.plan],
      ['G_stored_revision_2_trip', turn.persistence.storedRevision2Trip.plan],
      ['H_authenticated_restore_response', stored.plan],
      ['I_frontend_selected_canonical_restored_state', restoredPresentation.showItinerary ? stored.plan : null],
    ]);

    expect(turn.journal).toEqual(EXPECTED_JOURNAL);
    expect(turn.state.revision1.response.itineraryData.days).toHaveLength(3);
    expect(validateCanonicalItinerary(turn.state.revision1.response.itineraryData, {
      source: 'provider_output',
    })).toEqual({ valid: true, category: null, failures: [] });
    expect(canonicalIdentityDiff.comparisons).toHaveLength(8);
    expect(canonicalIdentityDiff.prohibitedMismatches).toEqual([]);
    expect(canonicalIdentityDiff.comparisons.every((comparison) => comparison.frozenPlanMatches)).toBe(true);
    if (process.env.STAGE147P_PRINT_DIFF === 'true') {
      process.stdout.write(`STAGE147P_CANONICAL_DIFF=${JSON.stringify(canonicalIdentityDiff)}\n`);
    }
    expect(turn.state.revision1.canonicalPlan.itineraryHash)
      .toBe(turn.state.revision2.canonicalPlan.itineraryHash);
    expect(hash(turn.state.revision1.canonicalPlan.days))
      .toBe(hash(turn.state.revision2.canonicalPlan.days));
    expect(stored.plan.responseId).toBe(turn.responseId);
    expect(stored.plan.itineraryHash).toBe(turn.state.revision2.canonicalPlan.itineraryHash);
    expect(hash(stored.plan.days)).toBe(hash(turn.state.revision2.canonicalPlan.days));
    expect(turn.persistence).toEqual(expect.objectContaining({
      httpRequests: 2,
      accepted: 2,
      automaticPersistenceRequestsFromDone: 0,
    }));

    const owned = handle.observedTrips();
    const cleanup = await handle.cleanup({
      createdTripIds: owned.map((trip) => trip.tripId),
      responseIds: owned.map((trip) => trip.responseId).filter(Boolean),
    });
    const foreignAfter = (await handle.counts([], foreign.userId)).foreign;
    const mongoAfter = await handle.mongoAvailability();
    const ledger = await handle.ledger();

    expect(cleanup.ok).toBe(true);
    expect(foreignAfter).toEqual(foreignBefore);
    expect(mongoBefore).toEqual(expect.objectContaining({ localMongoStillAvailable: true, classification: null }));
    expect(mongoAfter).toEqual(expect.objectContaining({ localMongoStillAvailable: true, classification: null }));
    expect(ledger.ledger.syntheticAnthropicCalls).toBe(0);
    expect(ledger.ledger.liveAnthropicCalls).toBe(0);

    await handle.removeForeignRun(foreign);
  }, TIMEOUT);
});
