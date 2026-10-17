'use strict';

/**
 * Stage 14.7G §9/§12 — gain calculation and the one decision code.
 *
 * The ordering of the checks below is the whole safety property: correctness,
 * persistence, isolation, artifacts, restore and cleanup are evaluated BEFORE
 * gain, so a fast-but-wrong run can never be reported as a qualified gain. Gain
 * is the LAST question asked, and only of a run that already passed everything
 * else.
 *
 * `LIVE_EXECUTION_NOT_STARTED` is not a Stage 14.7 decision and does not advance
 * rollout; it is what a refusal before the first provider call returns.
 */

const { LIVE_EXECUTION_NOT_STARTED } = require('./liveAuthorization');

const DECISION = {
  FAILED: 'STAGE14_7_LIVE_CONFIRMATION_FAILED',
  CORRECT_BUT_GAIN_INSUFFICIENT: 'STAGE14_7_CORRECT_BUT_GAIN_INSUFFICIENT',
  READY: 'READY_FOR_STAGE14_CANARY_PLAN',
  NOT_STARTED: LIVE_EXECUTION_NOT_STARTED,
};

/** §9 — the two thresholds, both required, per scenario. */
const ABSOLUTE_GAIN_THRESHOLD_MS = 10000;
const RELATIVE_GAIN_THRESHOLD = 0.20;

/**
 * §9 — within-run gain. Both inputs come from ONE monotonic origin and both are
 * post-persistence visibility marks.
 *
 * Returns nulls rather than zeros when a mark is missing: a missing measurement
 * is not a gain of zero, and must not be comparable to a threshold.
 */
function calculateGain({ timeToItineraryVisibleMs, timeToProseVisibleMs } = {}) {
  const itinerary = Number.isFinite(timeToItineraryVisibleMs) ? timeToItineraryVisibleMs : null;
  const prose = Number.isFinite(timeToProseVisibleMs) ? timeToProseVisibleMs : null;

  if (itinerary == null || prose == null || prose <= 0) {
    return {
      measurable: false,
      timeToItineraryVisibleMs: itinerary,
      timeToProseVisibleMs: prose,
      absoluteGainMs: null,
      relativeGain: null,
      meetsAbsolute: false,
      meetsRelative: false,
      qualifies: false,
    };
  }

  const absoluteGainMs = Number((prose - itinerary).toFixed(3));
  const relativeGain = Number((absoluteGainMs / prose).toFixed(6));
  const meetsAbsolute = absoluteGainMs >= ABSOLUTE_GAIN_THRESHOLD_MS;
  const meetsRelative = relativeGain >= RELATIVE_GAIN_THRESHOLD;

  return {
    measurable: true,
    timeToItineraryVisibleMs: itinerary,
    timeToProseVisibleMs: prose,
    absoluteGainMs,
    relativeGain,
    meetsAbsolute,
    meetsRelative,
    qualifies: meetsAbsolute && meetsRelative,
  };
}

/**
 * Every hard invariant for one scenario. A scenario is "correct and safe" only
 * when all of these hold; gain is not among them.
 *
 * @param {Object} s scenario result
 * @returns {{ok: boolean, failures: string[]}}
 */
function hardInvariantFailures(s) {
  const failures = [];
  const fail = (cond, code) => { if (!cond) failures.push(code); };

  fail(s.correctness?.itineraryValid === true, 'itinerary_invalid');
  fail(s.correctness?.proseFirstPass === true, 'prose_not_first_pass');

  // §8 ordering + lifecycle journal
  const o = s.ordering || {};
  fail(o.revision1PersistedBeforeItineraryVisible === true, 'ordering_revision1_after_visible');
  fail(o.revision2PersistedBeforeProseVisible === true, 'ordering_revision2_after_visible');
  fail(o.itineraryVisibleBeforeProseReady === true, 'ordering_itinerary_after_prose_ready');
  fail(s.lifecycleJournalMatches === true, 'lifecycle_journal_mismatch');
  // Field name matches the harness's own `phaseBReleasedBy`, so the barrier's
  // release reason travels from the driver to the decision unchanged.
  fail(s.phaseBReleasedBy === 'itinerary_revealed', 'phase_b_barrier_not_released_by_reveal');

  // §10 persistence
  const p = s.persistence || {};
  fail(p.persistenceHttpRequests === 2, 'persistence_request_count');
  fail(p.acceptedWrites === 2, 'persistence_accepted_count');
  fail(p.idempotentWrites === 0, 'persistence_idempotent_nonzero');
  fail(p.staleWrites === 0, 'persistence_stale_nonzero');
  fail(p.conflictWrites === 0, 'persistence_conflict_nonzero');
  fail(p.automaticPersistenceRequestsFromDone === 0, 'automatic_write_from_done');
  fail(s.identityStable === true, 'identity_not_stable');

  // §11 UI lifecycle
  const ui = s.ui || {};
  fail(ui.userTurns === 1, 'ui_user_turn_count');
  fail(ui.assistantTurns === 1, 'ui_assistant_turn_count');
  fail(ui.canonicalPlans === 1, 'ui_plan_count');
  fail(ui.cardMounts === 1, 'ui_card_mount_count');
  fail(ui.cardUnmountsBeforeCompletion === 0, 'ui_card_unmounted');

  // §12 artifacts
  const a = s.artifacts || {};
  fail(a.itineraryJsonMarkerPresent === false, 'artifact_itinerary_json_marker');
  fail(a.alignmentMarkerLeak === false, 'artifact_alignment_marker');
  fail(a.rawToolPayloadPresent === false, 'artifact_raw_tool_payload');
  fail(a.rejectedDraftPresent === false, 'artifact_rejected_draft');
  fail(a.itineraryMutatedBetweenRevisions === false, 'artifact_itinerary_mutated');
  fail(a.planHashDrift === false, 'artifact_plan_hash_drift');

  // §13 restore
  const r = s.restore || {};
  fail(r.presentationState === 'prose_complete', 'restore_presentation_state');
  fail(r.itineraryHashMatches === true, 'restore_hash_mismatch');
  fail(r.frozenPlanMatches === true, 'restore_plan_mismatch');
  fail(r.emptyBubble === false, 'restore_empty_bubble');
  fail(r.pendingLabel === false, 'restore_pending_label');
  fail(r.duplicatePlan === false, 'restore_duplicate_plan');

  // §14 isolation
  const iso = s.isolation || {};
  fail(iso.productionDatabaseConnections === 0, 'isolation_production_db_connection');
  fail(iso.productionDatabaseWrites === 0, 'isolation_production_db_write');
  fail(iso.externalNonProviderNetworkAttempts === 0, 'isolation_external_network');
  fail(iso.OpenAIConstructors === 0, 'isolation_openai_constructor');
  fail(iso.liveNpsServices === 0, 'isolation_live_nps');
  fail(iso.recoveryCalls === 0, 'isolation_recovery_call');

  // §4 caps
  fail(s.capsRespected === true, 'cap_exceeded');
  fail(s.providerEvidence?.ok === true, 'provider_evidence_incomplete');
  fail(s.localMongoStillAvailable === true, 'local_mongo_unavailable');
  fail(s.foreignPreservation?.unchanged === true, 'foreign_record_preservation_failed');

  return { ok: failures.length === 0, failures };
}

/**
 * §12 — the single decision.
 *
 * @param {Object} params
 * @param {boolean} params.liveExecutionStarted  did ANY provider call begin?
 * @param {Array}   params.scenarios             per-scenario results, in order
 * @param {Object}  params.cleanup               { ok: boolean }
 * @param {Object}  [params.offlineReplay]       { ok: boolean }
 * @param {string[]} [params.preProviderReasons] refusal reasons, when not started
 */
function calculateDecision({
  liveExecutionStarted,
  scenarios = [],
  cleanup = null,
  offlineReplay = null,
  preProviderReasons = [],
} = {}) {
  // §12/§13 — nothing was consumed, so no Stage 14.7 decision may be assigned.
  if (!liveExecutionStarted) {
    return {
      decision: DECISION.NOT_STARTED,
      isStage147Decision: false,
      advancesRollout: false,
      reasons: preProviderReasons.slice(),
      scenariosStarted: 0,
    };
  }

  const perScenario = scenarios.map((s) => {
    const invariants = hardInvariantFailures(s);
    return { scenarioId: s.scenarioId, invariants, gain: s.gain || null };
  });

  const invariantFailures = perScenario.filter((s) => !s.invariants.ok);

  // Cleanup failure fails the confirmation even when generation succeeded (§17).
  const cleanupFailed = !cleanup || cleanup.ok !== true;
  const replayFailed = offlineReplay != null && offlineReplay.ok !== true;

  if (invariantFailures.length > 0 || cleanupFailed || replayFailed) {
    return {
      decision: DECISION.FAILED,
      isStage147Decision: true,
      advancesRollout: false,
      reasons: [
        ...invariantFailures.flatMap((s) => s.invariants.failures.map((f) => `${s.scenarioId}:${f}`)),
        ...(cleanupFailed ? ['cleanup_incomplete'] : []),
        ...(replayFailed ? ['offline_flag_off_replay_failed'] : []),
      ],
      scenariosStarted: scenarios.length,
      perScenario,
    };
  }

  // Both scenarios are required before a gain verdict can be reached (§13).
  if (scenarios.length < 2) {
    return {
      decision: DECISION.FAILED,
      isStage147Decision: true,
      advancesRollout: false,
      reasons: ['incomplete_scenario_set'],
      scenariosStarted: scenarios.length,
      perScenario,
    };
  }

  const gainShortfalls = perScenario.filter((s) => !s.gain || s.gain.qualifies !== true);
  if (gainShortfalls.length > 0) {
    return {
      decision: DECISION.CORRECT_BUT_GAIN_INSUFFICIENT,
      isStage147Decision: true,
      advancesRollout: false,
      reasons: gainShortfalls.map((s) => {
        const g = s.gain || {};
        if (!g.measurable) return `${s.scenarioId}:gain_not_measurable`;
        const missed = [!g.meetsAbsolute ? 'absolute' : null, !g.meetsRelative ? 'relative' : null].filter(Boolean);
        return `${s.scenarioId}:gain_below_${missed.join('_and_')}`;
      }),
      scenariosStarted: scenarios.length,
      perScenario,
    };
  }

  return {
    decision: DECISION.READY,
    isStage147Decision: true,
    // Even READY authorizes only Stage 14.8 planning, never a flag.
    advancesRollout: false,
    reasons: [],
    scenariosStarted: scenarios.length,
    perScenario,
  };
}

module.exports = {
  DECISION,
  ABSOLUTE_GAIN_THRESHOLD_MS,
  RELATIVE_GAIN_THRESHOLD,
  calculateGain,
  hardInvariantFailures,
  calculateDecision,
};
