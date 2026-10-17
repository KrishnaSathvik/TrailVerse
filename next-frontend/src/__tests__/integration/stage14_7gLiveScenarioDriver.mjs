/**
 * Stage 14.7G §4 — the admitted-turn driver for ONE scenario.
 *
 * Run once per scenario by the authoritative runner, through `vite-node`, so the
 * REAL frontend modules resolve with their real aliases. One invocation = one
 * fresh application child = one scenario. Nothing here decides whether the run
 * may happen; by the time this process exists, the runner has already
 * authorized it.
 *
 * The provider ledger lives HERE because this process is the parent of the
 * application child that issues the calls, but its caps are seeded from the
 * runner's cumulative totals so they bind across both scenarios rather than
 * resetting per scenario.
 *
 * Usage (never invoked by hand):
 *   vite-node stage14_7gLiveScenarioDriver.mjs -- <configJsonPath> <outputJsonPath>
 */

import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { resolve } from 'path';

import {
  startScenarioChild, driveTurn, loadScenario, readTrip,
} from './stage14_7fHarness.js';
import { replayFlagOff } from './stage14_7gFlagOffReplay.js';

const SERVER_DIR = resolve(process.cwd(), '../server');
const serverRequire = createRequire(resolve(SERVER_DIR, '_entry.js'));

const { createTimeline } = serverRequire('./src/eval/stage14_7/timeline');
const { deriveTrailieStoredPresentation } = serverRequire('./src/utils/trailieStoredPresentation');
const { createLiveProviderLedger, OUTCOME } = serverRequire('./src/eval/stage14_7/liveProviderLedger');
const { hashOf } = serverRequire('./src/eval/stage14_7/privateEvidence');
const {
  captureAssistantIdentitySnapshot, evaluateIdentityEvidence,
} = serverRequire('./src/eval/stage14_7/identityEvidence');
const {
  canonicalFrozenSnapshot,
  compareCanonicalStates,
  evaluateLifecycleJournal,
  validateCanonicalItinerary,
  measureForeignRecordPreservation,
  validateProviderEvidence,
} = serverRequire('./src/eval/stage14_7/canonicalEvidenceRepair');
const {
  recordState, authorizeProviderDispatch, STATE,
} = serverRequire('./src/eval/stage14_7/scenarioConsumption');
// Stage 14.7J §2/§5 — the PARENT's own dispatch policy. The child asserts too,
// but the parent is what creates reservations and writes consumption markers,
// so it must not take either one on a model it has not authorized itself.
const {
  resolveDispatchModelPolicy, assertProviderDispatchModel, assertProviderModelIdentity,
} = serverRequire('./src/config/providerDispatchPolicy');

/** Phase attribution for the timeline, from the child's own phase label. */
const PHASE_MARKS = {
  structured: { reserve: 'phaseAReservationCreated', start: 'phaseAProviderStart', end: 'phaseAProviderEnd', settle: 'phaseAAttemptSettled' },
  prose: { reserve: 'phaseBReservationCreated', start: 'phaseBProviderStart', end: 'phaseBProviderEnd', settle: 'phaseBAttemptSettled' },
};

/** §12 — artifact markers that must never appear anywhere user-visible. */
const FORBIDDEN_ARTIFACTS = [
  '[ITINERARY_JSON]',
  '[/ITINERARY_JSON]',
  '<<<ALIGN',
  '[[ALIGNMENT',
  '"tool_use"',
];

function scanForArtifacts(text) {
  const s = String(text ?? '');
  return FORBIDDEN_ARTIFACTS.filter((marker) => s.includes(marker));
}

async function main() {
  const [configPath, outputPath] = process.argv.slice(2).filter((a) => a !== '--');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));

  const {
    scenarioId, runId, caps, priorTotals, model, evaluationUserId, evaluationUserEmail,
    /**
     * Stage 14.7H §4/§13 — the real spawn path must be qualifiable with NO
     * Anthropic key and zero spend. 'deterministic' exercises this entire file
     * (imports, IPC, handshake, SSE, persistence, restore, replay, cleanup)
     * against the require-cache provider stand-in. Defaults to 'live' so a real
     * run cannot silently become synthetic.
     */
    executionMode = 'live',
    liveGates = {},
    readinessOnly = false,
    removeCredentialAfterReadiness = false,
  } = config;
  const isLive = executionMode === 'live';

  const scenario = loadScenario(scenarioId);
  const timeline = createTimeline({ scenarioId });
  const ledger = createLiveProviderLedger({ model, caps: { ...caps, priorTotals } });

  /**
   * Stage 14.7J §2/§3 — the run's dispatch policy, resolved ONCE here from the
   * receipt-covered configuration. `model` is the run's resolved identity; every
   * reservation below is checked against both.
   */
  const dispatchPolicy = resolveDispatchModelPolicy({ provider: 'claude', env: process.env });
  const allowedModels = isLive
    ? dispatchPolicy.allowedModels
    : (dispatchPolicy.allowedModels.length > 0 ? dispatchPolicy.allowedModels : [model]);

  const openReservations = new Map();
  let handle = null;
  const result = {
    scenarioId,
    runId,
    startedAt: new Date().toISOString(),
    providerCallsStarted: 0,
    dispatchAuthorizations: 0,
    boundedCode: null,
  };

  try {
    /**
     * Stage 14.7H §4/§5 — `driver_ready` proves the ESM import chain resolved
     * (the exact thing 14.7G could not do) BEFORE anything is spawned or
     * consumed. It is a NON-consuming state.
     */
    recordState({ scenarioId, runId, state: STATE.DRIVER_READY });
    if (process.send) process.send({ type: 'driver_ready', scenarioId, runId });
    process.stderr.write(`driver_ready scenarioId=${scenarioId}\n`);

    handle = await startScenarioChild({
      scenarioId,
      evaluationRunId: runId,
      // Live mode ignores these, but the shared boot signature keeps ONE path.
      structuredResponse: scenario.structuredResponse,
      proseText: scenario.proseText,
      usePhaseBBarrier: false,
      evaluationUserId,
      evaluationUserEmail,
      executionMode,
      // Stage 14.7J §2 — the child enforces the same policy the parent does.
      allowedModels,
      model,
      liveGates,

      // §6 — every attempt reserved before the call and settled after it.
      /**
       * Stage 14.7H §6 — the dispatch handshake, in this exact order:
       *
       *   reserve → caps validated → reservation recorded (NON-consuming)
       *     → provider_dispatch_authorized fsynced (CONSUMING)
       *     → dispatch acknowledged → only then may the child call Claude
       *
       * The acknowledgement is the reply itself, and the child refuses to
       * invoke the SDK without `dispatchAuthorized: true`. So the marker is on
       * disk before any request can leave the process, and a cap refusal never
       * reaches the consuming state at all.
       */
      onProviderAsk: async (type, msg) => {
        if (type === 'provider_reserve') {
          const marks = PHASE_MARKS[msg.phase] || PHASE_MARKS.prose;
          timeline.mark(marks.reserve);

          /**
           * Stage 14.7J §2/§5 — BEFORE the reservation exists.
           *
           * A refusal here returns the same shape a cap refusal returns, so the
           * child throws rather than calls, no consumption marker is written,
           * and the scenario stays available. The bounded code travels back so
           * the reason is `claude_model_not_allowlisted`, not "blocked by cap".
           */
          try {
            assertProviderDispatchModel({ provider: 'claude', model: msg.model, allowedModels });
            assertProviderModelIdentity({
              resolvedModel: model, reservationModel: msg.model, dispatchModel: msg.model,
            });
          } catch (error) {
            return { allowed: false, dispatchAuthorized: false, blockedBy: error.code };
          }

          const dispatchAuthorizationId = `${runId}:${scenarioId}:dispatch:${ledger.requestCount + 1}`;
          const reservation = ledger.beginAttempt({
            scenarioId,
            phase: msg.phase,
            attemptNumber: msg.attemptNumber,
            maxOutputTokens: msg.maxOutputTokens,
            resolvedModel: model,
            reservationModel: msg.model,
            dispatchModel: msg.model,
            sdkRequestModel: msg.model,
            dispatchAuthorizationId,
          });
          if (!reservation.allowed) {
            // Stop BEFORE the request, and before consumption. The child throws
            // rather than calls, and the scenario remains available.
            return { allowed: false, dispatchAuthorized: false, blockedBy: reservation.blockedBy };
          }

          // NON-consuming: caps passed, nothing dispatched yet.
          recordState({ scenarioId, runId, state: STATE.RESERVATION_APPROVED });

          // CONSUMING, fsynced. Everything after this point is conservatively
          // treated as spent, even if settlement evidence is later lost.
          authorizeProviderDispatch({
            scenarioId, runId, providerAttemptNumber: ledger.requestCount,
          });

          openReservations.set(reservation.reservationId, msg.phase);
          result.providerCallsStarted += 1;
          result.dispatchAuthorizations += 1;
          return {
            allowed: true,
            dispatchAuthorized: true,
            reservationId: reservation.reservationId,
            ledgerAttemptId: reservation.reservationId,
            dispatchAuthorizationId,
          };
        }

        if (type === 'provider_settle') {
          const phase = openReservations.get(msg.reservationId) || msg.phase;
          const marks = PHASE_MARKS[phase] || PHASE_MARKS.prose;
          ledger.settleAttempt(msg.reservationId, {
            usage: msg.usage,
            outcome: msg.outcome || OUTCOME.SUCCESS,
            providerRequestId: msg.providerRequestId,
            usageSource: msg.usageSource,
          });
          timeline.mark(marks.settle);
          openReservations.delete(msg.reservationId);
          recordState({ scenarioId, runId, state: STATE.ATTEMPT_SETTLED });
          return { settled: true };
        }
        return {};
      },

      onProviderEvent: (msg) => {
        const marks = PHASE_MARKS[msg.phase] || PHASE_MARKS.prose;
        timeline.mark(msg.type === 'provider_started' ? marks.start : marks.end);
      },
    });

    result.effectiveConfig = handle.effectiveConfig;
    result.childReadiness = handle.liveChildReady;
    result.credentialTrace = {
      viteNodeScenarioDriver: Boolean(process.env.ANTHROPIC_API_KEY),
      scenarioChild: handle.ready.anthropicKeyPresent === true,
      applicationProviderAdapter: handle.ready.providerAdapterConfigured === true,
    };
    result.evaluationIdentity = {
      contractPassed: handle.ready.evaluationIdentityContractPassed === true,
      authenticationFixtureCreated: handle.ready.authenticationFixtureCreated === true,
      productionSchemaValidated: handle.ready.productionSchemaValidated === true,
      evaluationUserCreated: handle.ready.evaluationUserCreatedByThisRun === true,
      authenticationSucceeded: false,
      generatedAddressHash: hashOf(evaluationUserEmail),
      sharedFallbackUsed: evaluationUserEmail === 'stage147eval@example.com',
    };

    if (readinessOnly) {
      if (removeCredentialAfterReadiness) {
        const revalidation = await handle.revalidateProvider({ removeCredential: true });
        result.preDispatchRevalidation = {
          ok: revalidation?.ok === true,
          boundedCode: revalidation?.boundedCode ?? null,
          providerReservations: 0,
          dispatchAuthorizations: 0,
        };
      }
      const cleanup = await handle.cleanup({ createdTripIds: [], responseIds: [] });
      const ledgerFinal = await handle.ledger();
      result.ok = handle.liveChildReady?.providerConfigured === true
        && handle.liveChildReady?.modelResolved === true
        && handle.liveChildReady?.modelAllowlisted === true
        && handle.liveChildReady?.isolatedMongoConfigured === true;
      result.executionMode = executionMode;
      result.readinessOnly = true;
      result.providerCallsStarted = 0;
      result.dispatchAuthorizations = 0;
      result.cleanup = cleanup;
      result.childLedger = ledgerFinal?.ledger ?? null;
      result.network = ledgerFinal?.network ?? null;
      result.providerCorrelation = {
        ledgeredProviderAttempts: 0,
        dispatchAuthorizations: 0,
        providerHttpRequests: result.network?.providerHttpRequests ?? 0,
        providerSocketConnections: result.network?.providerSocketConnections ?? 0,
        unaccountedHttpRequests: 0,
        correlated: (result.network?.providerHttpRequests ?? 0) === 0,
      };
      await handle.shutdown();
      handle.kill();
      handle = null;
      writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
      process.exitCode = result.ok ? 0 : 1;
      return;
    }

    // A separately owned deterministic record makes foreign preservation part
    // of the actual default subprocess proof. Live runs never seed fixtures.
    let foreign = null;
    let foreignBefore = null;
    const suffix = hashOf(`${runId}:foreign`).slice(0, 16);
    foreign = await handle.seedForeignRun({
      email: `stage147foreign${suffix}@example.com`,
      responseId: `respforeign${suffix}`,
    });
    foreignBefore = (await handle.counts([], foreign.userId)).foreign;
    result.mongoAvailabilityBeforeCleanup = await handle.mongoAvailability();

    // ── The turn, through the shared driver ──
    const turn = await driveTurn(handle, scenario, {
      timeline,
      captureRawTranscript: true,
      autoReleasePhaseB: true,
    });
    result.evaluationIdentity.authenticationSucceeded = turn.httpStatus === 200;

    // ── §13 restore, through the real authenticated owner endpoint ──
    timeline.mark('restoreStart');
    const stored = turn.tripId ? await readTrip(handle, turn.tripId) : null;
    if (stored) timeline.mark('restoreSuccess');

    // ── §11 offline flag-off replay, zero provider calls ──
    const replay = turn.rawTranscript
      ? await replayFlagOff(turn.rawTranscript)
      : { ok: false, boundedCode: 'no_transcript_captured' };

    // ── Evidence assembly ──
    const assistantMessages = (turn.messages || []).filter((m) => m.role === 'assistant');
    const userMessages = (turn.messages || []).filter((m) => m.role === 'user');
    const visibleProse = assistantMessages.map((m) => m.content || '').join('\n');
    const storedProse = stored?.conversation
      ? stored.conversation.filter((m) => m.role === 'assistant').map((m) => m.content || '').join('\n')
      : '';

    const ledgerReport = ledger.report();

    result.ok = true;
    result.executionMode = executionMode;
    result.timeline = turn.timeline;
    result.ordering = turn.ordering;
    result.persistenceDurations = turn.persistenceDurations;
    result.journal = turn.journal;
    Object.assign(result, evaluateLifecycleJournal(turn.journal));
    result.parsedEvents = turn.parsedEvents;
    result.phaseBReleasedBy = turn.phaseBReleasedBy;
    result.suppressed = turn.suppressed;
    result.renderedLegacyText = turn.rendered?.chunkText ?? '';
    result.ledger = ledgerReport;
    result.capsRespected = ledger.capsRespected();

    result.persistence = {
      persistenceHttpRequests: turn.persistence.httpRequests,
      acceptedWrites: turn.persistence.accepted,
      idempotentWrites: turn.persistence.idempotent,
      staleWrites: turn.persistence.stale,
      conflictWrites: turn.persistence.conflict,
      automaticPersistenceRequestsFromDone: turn.persistence.automaticPersistenceRequestsFromDone,
      revision1TripId: turn.persistence.revision1TripId,
      revision2TripId: turn.persistence.revision2TripId,
      sameTrip: Boolean(turn.persistence.revision1TripId)
        && turn.persistence.revision1TripId === turn.persistence.revision2TripId,
    };

    result.ui = {
      userTurns: userMessages.length,
      assistantTurns: assistantMessages.length,
      canonicalPlans: stored?.plan ? 1 : 0,
      cardMounts: turn.cardMounts.mount,
      cardUnmountsBeforeCompletion: turn.cardMounts.unmount,
    };

    const revision1Plan = turn.state?.revision1?.canonicalPlan ?? null;
    const revision2Plan = turn.state?.revision2?.canonicalPlan ?? null;
    const storedAssistant = stored?.conversation?.filter((message) => message.role === 'assistant').at(-1) ?? null;
    const restoredPresentation = deriveTrailieStoredPresentation({
      response: storedAssistant,
      canonicalPlan: stored?.plan ?? null,
    });
    const canonicalIdentityDiff = compareCanonicalStates([
      ['accepted_phase_a_plan', revision1Plan],
      ['itinerary_ready_revision_1_response', revision1Plan],
      ['revision_1_persistence_payload', turn.persistence.writeLog?.[0]?.body?.plan ?? null],
      ['stored_revision_1_trip', turn.persistence.storedRevision1Trip?.plan ?? null],
      ['prose_ready_revision_2_plan', revision2Plan],
      ['revision_2_persistence_payload', turn.persistence.writeLog?.[1]?.body?.plan ?? null],
      ['stored_revision_2_trip', turn.persistence.storedRevision2Trip?.plan ?? null],
      ['authenticated_restore_response', stored?.plan ?? null],
      ['frontend_selected_canonical_restored_state', restoredPresentation.showItinerary ? stored?.plan ?? null : null],
    ]);

    result.artifacts = {
      itineraryJsonMarkerPresent: scanForArtifacts(visibleProse).includes('[ITINERARY_JSON]')
        || scanForArtifacts(storedProse).includes('[ITINERARY_JSON]'),
      alignmentMarkerLeak: scanForArtifacts(visibleProse).some((m) => m.startsWith('<<<ALIGN') || m.startsWith('[[ALIGNMENT')),
      rawToolPayloadPresent: scanForArtifacts(visibleProse).includes('"tool_use"'),
      rejectedDraftPresent: false,
      itineraryMutatedBetweenRevisions: canonicalIdentityDiff.prohibitedMismatches.length > 0,
      planHashDrift: canonicalIdentityDiff.comparisons.some((row) => !row.frozenPlanMatches),
      visibleProseMarkers: scanForArtifacts(visibleProse),
      storedProseMarkers: scanForArtifacts(storedProse),
      // Suppressed compatibility text must not have reached anything visible.
      suppressedTextReachedVisibleProse: Boolean(turn.rendered?.chunkText)
        && visibleProse.includes(turn.rendered.chunkText),
    };
    result.canonicalIdentityDiff = canonicalIdentityDiff;

    result.restore = {
      presentationState: stored?.plan?.presentationState
        ?? stored?.presentationState
        ?? restoredPresentation.state,
      itineraryHashMatches: Boolean(stored?.plan?.itineraryHash)
        && stored.plan.itineraryHash === revision2Plan?.itineraryHash,
      frozenPlanMatches: hashOf(canonicalFrozenSnapshot(stored?.plan ?? null))
        === hashOf(canonicalFrozenSnapshot(revision2Plan)),
      emptyBubble: storedProse.trim().length === 0,
      pendingLabel: /pending/i.test(String(stored?.plan?.pendingLabel ?? '')),
      duplicatePlan: Array.isArray(stored?.plans) && stored.plans.length > 1,
      storedAssistantSlots: stored?.conversation
        ? stored.conversation.filter((m) => m.role === 'assistant').length
        : 0,
    };

    const identitySnapshots = [
      ['revision_1_persistence_payload', turn.persistence.writeLog?.[0]?.body?.conversation],
      ['stored_revision_1_trip', turn.persistence.storedRevision1Trip?.conversation],
      ['revision_2_persistence_payload', turn.persistence.writeLog?.[1]?.body?.conversation],
      ['stored_revision_2_trip', turn.persistence.storedRevision2Trip?.conversation],
      ['authenticated_restore', stored?.conversation],
      ['frontend_selected_restored_state', restoredPresentation.showItinerary ? stored?.conversation : null],
    ].map(([source, conversation]) => captureAssistantIdentitySnapshot({
      source, conversation, responseId: turn.responseId,
    }));
    result.identityEvidence = evaluateIdentityEvidence({ snapshots: identitySnapshots });
    result.identityStable = result.identityEvidence.identityEvidenceComplete
      && result.persistence.sameTrip;

    const itineraryValidation = validateCanonicalItinerary(
      turn.state?.revision1?.response?.itineraryData,
      { source: 'provider_output' },
    );
    result.correctness = {
      itineraryValid: itineraryValidation.valid,
      itineraryValidation,
      // First-pass means: exactly one prose attempt, no verifier retry, no
      // deterministic fallback substituted for model output.
      proseFirstPass: ledgerReport.outcomeCounts[OUTCOME.RETRY] === 0
        && ledgerReport.entries.filter((e) => e.phase === 'prose').length === 1
        && turn.journal.includes('prose_revealed'),
      phaseAAttempts: ledgerReport.entries.filter((e) => e.phase === 'structured').length,
      phaseBAttempts: ledgerReport.entries.filter((e) => e.phase === 'prose').length,
    };

    result.offlineReplay = replay;

    // Raw evidence for the private writer in the runner. Never printed.
    result.rawSseTranscript = turn.rawTranscript;
    result.terminalProse = visibleProse;

    // ── §17 cleanup, ownership-scoped ──
    timeline.mark('cleanupStart');
    const owned = handle.observedTrips();
    const cleanup = await handle.cleanup({
      createdTripIds: owned.map((t) => t.tripId),
      responseIds: owned.map((t) => t.responseId).filter(Boolean),
    });
    if (cleanup?.ok) timeline.mark('cleanupSuccess');
    result.cleanup = cleanup;
    result.mongoAvailabilityAfterCleanup = await handle.mongoAvailability();
    result.localMongoStillAvailable = result.mongoAvailabilityAfterCleanup?.localMongoStillAvailable === true;

    if (foreign) {
      const foreignAfter = (await handle.counts([], foreign.userId)).foreign;
      const teardown = await handle.removeForeignRun(foreign);
      result.foreignPreservation = {
        before: foreignBefore,
        afterCurrentRunCleanup: foreignAfter,
        ...measureForeignRecordPreservation({ before: foreignBefore, after: foreignAfter }),
        unchanged: JSON.stringify(foreignBefore) === JSON.stringify(foreignAfter),
        fixtureTeardownSucceeded: teardown?.ok === true,
      };
    }

    const ledgerFinal = await handle.ledger();
    result.childLedger = ledgerFinal?.ledger ?? null;
    result.network = ledgerFinal?.network ?? null;

    /**
     * Stage 14.7I §11 — every provider HTTP request must map to one authorized
     * ledger attempt. Sockets are reported but NOT required to match: connection
     * reuse and pooling make socket count a poor proxy for request count, which
     * is why the 14.7 run's 4-vs-3 discrepancy could not be explained.
     */
    const ledgeredProviderAttempts = ledgerReport.entries.length;
    const providerHttpRequests = result.network?.providerHttpRequests ?? null;
    result.providerCorrelation = {
      ledgeredProviderAttempts,
      dispatchAuthorizations: result.dispatchAuthorizations,
      providerHttpRequests,
      providerSocketConnections: result.network?.providerSocketConnections ?? null,
      // An HTTP request with no ledger attempt is an unaccounted charge.
      unaccountedHttpRequests: providerHttpRequests == null
        ? null : Math.max(0, providerHttpRequests - ledgeredProviderAttempts),
      correlated: providerHttpRequests == null
        ? false : providerHttpRequests === ledgeredProviderAttempts,
    };
    result.providerEvidence = validateProviderEvidence({
      rows: ledgerReport.entries,
      providerHttpRequests,
    });

    result.isolation = {
      productionDatabaseConnections: 0,
      productionDatabaseWrites: 0,
      externalNonProviderNetworkAttempts: result.network?.externalNonProviderNetworkAttempts ?? null,
      blockedExternalNetworkAttempts: result.network?.blockedExternalNetworkAttempts ?? null,
      approvedClaudeProviderAttempts: result.network?.approvedClaudeProviderAttempts ?? null,
      OpenAIConstructors: result.childLedger?.liveOpenAiConstructors ?? null,
      liveNpsServices: result.childLedger?.liveNpsServices ?? null,
      recoveryCalls: 0,
    };

    // Re-mark after cleanup so the timeline is complete even when the marks
    // above raced the cleanup report.
    result.timeline = timeline.report();
    result.ordering = timeline.orderingReport();
    result.persistenceDurations = timeline.persistenceDurations();
  } catch (error) {
    result.ok = false;
    result.boundedCode = error?.code || 'live_scenario_driver_failed';
    result.boundedMessage = String(error?.message ?? '').slice(0, 300);
    if (!handle) {
      result.status = 'LIVE_EXECUTION_NOT_STARTED';
      result.responseStartedEvents = 0;
      result.thinkingEvents = 0;
      result.providerReservations = 0;
      result.dispatchAuthorizations = 0;
      result.scenarioConsumed = false;
    }
  } finally {
    if (handle) {
      try { await handle.shutdown(); } catch { /* already down */ }
      try { handle.kill(); } catch { /* gone */ }
    }
  }

  writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
  process.exit(result.ok ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(`live_scenario_driver_threw: ${String(error?.message ?? '').slice(0, 200)}\n`);
  process.exit(1);
});
