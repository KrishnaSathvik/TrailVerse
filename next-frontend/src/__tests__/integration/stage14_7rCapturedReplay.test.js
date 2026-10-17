import { afterAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { createRequire } from 'module';
import {
  startScenarioChild, driveTurn, loadScenario, readTrip, buildRunIdentity,
} from './stage14_7fHarness';

const TIMEOUT = 120000;
const REPO_ROOT = resolve(process.cwd(), '..');
const LIVE_EVIDENCE = resolve(REPO_ROOT, 'artifacts/private/stage14_7-live/stage147g-mshyixvk-52ed4e/basic-03-seven-day.json');
const REPLAY_EVIDENCE = resolve(REPO_ROOT, 'artifacts/private/stage14_7R-captured-replay.json');
const require = createRequire(import.meta.url);
const {
  captureAssistantIdentitySnapshot, evaluateIdentityEvidence,
} = require(resolve(REPO_ROOT, 'server/src/eval/stage14_7/identityEvidence.js'));
const { deriveTrailieStoredPresentation } = require(resolve(REPO_ROOT, 'server/src/utils/trailieStoredPresentation.js'));
const { createLiveProviderLedger, OUTCOME } = require(resolve(REPO_ROOT, 'server/src/eval/stage14_7/liveProviderLedger.js'));

const handles = [];
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

afterAll(async () => {
  for (const handle of handles) {
    try { await handle.shutdown(); } catch { /* already down */ }
    handle.kill();
  }
}, TIMEOUT);

describe('Stage 14.7R — captured seven-day mechanism replay', () => {
  it('retains exact assistant identity through persistence and restore with zero providers', async () => {
    const liveBytes = readFileSync(LIVE_EVIDENCE);
    const live = JSON.parse(liveBytes.toString('utf8'));
    const scenario = loadScenario('basic-03-seven-day');
    const identity = buildRunIdentity(`stage147r-replay-${randomUUID()}`);
    const handle = await startScenarioChild({
      scenarioId: scenario.scenarioId,
      structuredResponse: scenario.structuredResponse,
      proseText: scenario.proseText,
      usePhaseBBarrier: false,
      ...identity,
    });
    handles.push(handle);

    const turn = await driveTurn(handle, scenario, {
      rawTranscriptOverride: live.rawSseTranscript,
      captureRawTranscript: false,
    });
    const stored = await readTrip(handle, turn.tripId);
    const storedAssistant = stored.conversation.filter((message) => message.role === 'assistant').at(-1);
    const presentation = deriveTrailieStoredPresentation({ response: storedAssistant, canonicalPlan: stored.plan });
    const snapshots = [
      ['revision_1_persistence_payload', turn.persistence.writeLog[0].body.conversation],
      ['stored_revision_1_trip', turn.persistence.storedRevision1Trip.conversation],
      ['revision_2_persistence_payload', turn.persistence.writeLog[1].body.conversation],
      ['stored_revision_2_trip', turn.persistence.storedRevision2Trip.conversation],
      ['authenticated_restore', stored.conversation],
      ['frontend_selected_restored_state', presentation.showItinerary ? stored.conversation : null],
    ].map(([source, conversation]) => captureAssistantIdentitySnapshot({
      source, conversation, responseId: turn.responseId,
    }));
    const identityEvidence = evaluateIdentityEvidence({ snapshots });

    // Recorded provider-usage fixture: explicit zero is distinct from absence.
    const ledger = createLiveProviderLedger({ model: 'claude-sonnet-5', caps: { maxRequests: 2 } });
    for (const phase of ['structured', 'prose']) {
      const reservation = ledger.beginAttempt({
        scenarioId: scenario.scenarioId, phase, attemptNumber: 1,
        maxOutputTokens: phase === 'structured' ? 12000 : 8000,
      });
      ledger.settleAttempt(reservation.reservationId, {
        usage: { inputTokens: 10, outputTokens: 5, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
        outcome: OUTCOME.SUCCESS,
      });
    }
    const cacheRows = ledger.report().entries.map((row) => ({
      phase: row.phase,
      cacheCreationInputTokens: row.cacheCreationInputTokens,
      cacheReadInputTokens: row.cacheReadInputTokens,
      cacheUsageEvidence: row.cacheUsageEvidence,
      settlementStatus: row.settlementStatus,
    }));

    expect(identityEvidence.identityEvidenceComplete).toBe(true);
    expect(turn.journal).toEqual([
      'revision_1_received', 'revision_1_persist_started', 'revision_1_persist_succeeded',
      'itinerary_revealed', 'pending_label_set', 'revision_2_received',
      'revision_2_persist_started', 'revision_2_persist_succeeded',
      'prose_revealed', 'done_reconciled',
    ]);
    expect(turn.persistence).toEqual(expect.objectContaining({
      httpRequests: 2, accepted: 2, automaticPersistenceRequestsFromDone: 0,
    }));
    expect(cacheRows.every((row) => row.cacheUsageEvidence === 'provider_reported_zero'
      && row.settlementStatus === 'settled_actual_complete')).toBe(true);

    const owned = handle.observedTrips();
    const cleanup = await handle.cleanup({
      createdTripIds: owned.map((trip) => trip.tripId),
      responseIds: owned.map((trip) => trip.responseId).filter(Boolean),
    });
    const childLedger = await handle.ledger();
    expect(cleanup.ok).toBe(true);
    expect(childLedger.ledger.liveAnthropicCalls).toBe(0);
    expect(childLedger.ledger.syntheticAnthropicCalls).toBe(0);

    const artifact = {
      schemaVersion: 'stage14_7R.1',
      sourceRunId: live.runId,
      scenarioId: live.scenarioId,
      sourceEvidenceSha256: sha256(liveBytes),
      mechanismReplayPassed: true,
      providerCalls: 0,
      providerCostUsd: 0,
      identityEvidence,
      cacheUsageMechanism: { passed: true, rows: cacheRows, source: 'recorded_provider_usage_fixture' },
      lifecycleJournal: turn.journal,
      persistence: {
        httpRequests: turn.persistence.httpRequests,
        acceptedWrites: turn.persistence.accepted,
        automaticPersistenceRequestsFromDone: turn.persistence.automaticPersistenceRequestsFromDone,
      },
      frozenPlanStable: turn.state.revision1.canonicalPlan.itineraryHash
        === turn.state.revision2.canonicalPlan.itineraryHash,
      restorePassed: presentation.state === 'prose_complete',
      cleanupPassed: cleanup.ok === true,
    };
    if (process.env.STAGE147R_WRITE_ARTIFACT === 'true') {
      mkdirSync(dirname(REPLAY_EVIDENCE), { recursive: true });
      writeFileSync(REPLAY_EVIDENCE, `${JSON.stringify(artifact, null, 2)}\n`);
    }
  }, TIMEOUT);
});
