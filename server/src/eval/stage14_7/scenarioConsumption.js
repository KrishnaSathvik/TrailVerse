'use strict';

/**
 * Stage 14.7H §5/§6 — scenario consumption as a state machine.
 *
 * WHAT WENT WRONG IN 14.7G
 * ------------------------
 * A single marker was written before the driver subprocess was invoked. When the
 * driver died during module resolution — before any child booted, before turn
 * admission, before a provider client existed — `basic-02-three-day` was
 * recorded as consumed for a run that cost $0.00 and never touched Claude.
 *
 * The original reasoning was sound but incomplete: a crash with a request
 * ALREADY IN FLIGHT must not permit a silent rerun. The error was collapsing
 * that case together with "the driver never started", which provably precedes
 * provider construction.
 *
 * THE MODEL
 * ---------
 * Five ordered states. Exactly ONE of them consumes the scenario:
 *
 *   launch_attempted              non-consuming
 *   driver_ready                  non-consuming
 *   provider_reservation_approved non-consuming
 *   provider_dispatch_authorized  CONSUMING  ← fsynced before the SDK is called
 *   provider_attempt_settled      consuming (terminal)
 *
 * `provider_dispatch_authorized` is written and fsynced by the PARENT before it
 * acknowledges dispatch, and the child must not call Claude until it receives
 * that acknowledgement. So a crash anywhere after authorization is
 * conservatively consumed — including when settlement evidence is lost — while
 * every failure before it leaves the scenario available.
 */

const fs = require('fs');
const path = require('path');

const SERVER_ROOT = path.resolve(__dirname, '../../..');
const REPO_ROOT = path.resolve(SERVER_ROOT, '..');

const MARKER_DIR = path.join(REPO_ROOT, 'artifacts/private/stage14_7-consumption');

const STAGE = '14.7';

/** Ordered; index is the progression. */
const STATE = {
  LAUNCH_ATTEMPTED: 'launch_attempted',
  DRIVER_READY: 'driver_ready',
  RESERVATION_APPROVED: 'provider_reservation_approved',
  DISPATCH_AUTHORIZED: 'provider_dispatch_authorized',
  ATTEMPT_SETTLED: 'provider_attempt_settled',
};

const STATE_ORDER = [
  STATE.LAUNCH_ATTEMPTED,
  STATE.DRIVER_READY,
  STATE.RESERVATION_APPROVED,
  STATE.DISPATCH_AUTHORIZED,
  STATE.ATTEMPT_SETTLED,
];

/** The threshold. Everything at or past this index consumes the scenario. */
const CONSUMING_FROM_INDEX = STATE_ORDER.indexOf(STATE.DISPATCH_AUTHORIZED);

/** §2 — the one acknowledgement that authorizes a reviewed reset. */
const REVIEWED_RESET_ACK = 'REVIEWED_RESET_STAGE14_7_BASIC_02_PRE_PROVIDER_LAUNCH_FAILURE';

function markerDir() {
  return process.env.TRAILIE_EVAL_CONSUMPTION_DIR || MARKER_DIR;
}

function voidedDir() {
  return path.join(markerDir(), 'voided');
}

function safeId(value, label) {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(String(value))) {
    const error = new Error(`invalid_${label}_for_marker`);
    error.code = `invalid_${label}_for_marker`;
    throw error;
  }
  return String(value);
}

function markerPath(scenarioId) {
  // Scenario ids come from a closed approved list, but the value still reaches
  // the filesystem, so anything that could traverse is refused outright rather
  // than sanitized into something that "looks" safe.
  return path.join(markerDir(), `${safeId(scenarioId, 'scenario_id')}.json`);
}

/** Durable write: a crash immediately after must not lose the record. */
function writeFsynced(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fd = fs.openSync(file, 'w');
  try {
    fs.writeFileSync(fd, JSON.stringify(payload, null, 2) + '\n');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  return file;
}

function readMarker(scenarioId) {
  try {
    return JSON.parse(fs.readFileSync(markerPath(scenarioId), 'utf8'));
  } catch {
    return null;
  }
}

function stateIndex(state) {
  return STATE_ORDER.indexOf(state);
}

/**
 * Records a state transition.
 *
 * A test run must never be able to move a REAL approved scenario: under
 * NODE_ENV=test the temp-directory override is mandatory, not optional.
 * (14.7G shipped without this and polluted the live directory.)
 */
function recordState({
  scenarioId, runId, state, providerAttemptNumber = null, now = () => new Date().toISOString(),
} = {}) {
  if (String(process.env.NODE_ENV).toLowerCase() === 'test' && !process.env.TRAILIE_EVAL_CONSUMPTION_DIR) {
    const error = new Error('consumption_marker_refused_in_test_without_override');
    error.code = 'consumption_marker_refused_in_test_without_override';
    throw error;
  }
  if (stateIndex(state) === -1) {
    const error = new Error('unknown_consumption_state');
    error.code = 'unknown_consumption_state';
    throw error;
  }
  safeId(runId, 'run_id');

  const previous = readMarker(scenarioId);
  // States only advance. A late-arriving earlier state must never walk a
  // consumed scenario backwards into "available".
  if (previous && stateIndex(previous.status) > stateIndex(state)) return previous;

  const marker = {
    stage: STAGE,
    scenarioId,
    runId,
    status: state,
    // Retained for compatibility with the 14.7G field name, now DERIVED from
    // the state rather than being the state itself.
    providerAttemptStarted: stateIndex(state) >= CONSUMING_FROM_INDEX,
    ...(providerAttemptNumber != null ? { providerAttemptNumber } : {}),
    startedAt: previous?.startedAt || now(),
    updatedAt: now(),
  };
  writeFsynced(markerPath(scenarioId), marker);
  return marker;
}

/** §6 — the consuming transition, fsynced BEFORE dispatch is acknowledged. */
function authorizeProviderDispatch({ scenarioId, runId, providerAttemptNumber = 1 } = {}) {
  return recordState({
    scenarioId, runId, state: STATE.DISPATCH_AUTHORIZED, providerAttemptNumber,
  });
}

function readConsumption(scenarioId) {
  return readMarker(scenarioId);
}

/**
 * Consumed ONLY at or past dispatch authorization.
 *
 * A marker in a pre-dispatch state means an attempt was made and abandoned
 * before Claude was ever called; the scenario remains available.
 */
function isConsumed(scenarioId) {
  const marker = readMarker(scenarioId);
  if (!marker) return false;

  const index = stateIndex(marker.status);
  if (index === -1) {
    /**
     * A 14.7G-era marker has no `status` — only `providerAttemptStarted`. Such a
     * marker cannot distinguish "dispatched" from "launch failed", so it is read
     * CONSERVATIVELY as consumed. Reading an unrecognized marker as available is
     * the one direction that could silently re-spend a scenario.
     */
    return marker.providerAttemptStarted === true;
  }
  return index >= CONSUMING_FROM_INDEX;
}

function availability(scenarioIds = []) {
  const out = {};
  let consumed = 0;
  for (const id of scenarioIds) {
    const used = isConsumed(id);
    out[id] = used ? 'consumed' : 'available';
    if (used) consumed += 1;
  }
  return { ...out, consumedScenarios: consumed };
}

/**
 * §1 — preserve a failed pre-provider attempt as bounded audit evidence.
 *
 * Deliberately NOT a deletion. A voided attempt still happened, and the record
 * of why it did not consume anything is what makes the reset reviewable later.
 */
function recordVoidedAttempt({
  scenarioId, runId, reason, providerCallsStarted = 0, now = () => new Date().toISOString(),
} = {}) {
  const record = {
    scenarioId: safeId(scenarioId, 'scenario_id'),
    runId: safeId(runId, 'run_id'),
    status: 'voided_pre_provider_launch_failure',
    reason,
    providerCallsStarted,
    providerRequests: 0,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    voidedAt: now(),
  };
  const file = path.join(voidedDir(), `${record.runId}-${record.scenarioId}.json`);
  writeFsynced(file, record);
  return { record, file: path.relative(REPO_ROOT, file) };
}

function readVoidedAttempts() {
  try {
    return fs.readdirSync(voidedDir())
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(fs.readFileSync(path.join(voidedDir(), f), 'utf8')));
  } catch {
    return [];
  }
}

/**
 * §2 — the reviewed reset.
 *
 * Every precondition is verified against evidence rather than trusted from the
 * caller, and a marker that ever reached dispatch authorization can NEVER be
 * reset through this path — that is the case the marker exists to protect.
 */
function resetConsumptionForReviewedInstruction({
  scenarioId, runId, acknowledgement, evidence = {},
} = {}) {
  const refusals = [];

  if (acknowledgement !== REVIEWED_RESET_ACK) refusals.push('acknowledgement_mismatch');

  const marker = readMarker(scenarioId);
  if (!marker) refusals.push('no_marker_to_reset');

  if (marker && marker.runId !== runId) refusals.push('run_id_mismatch');

  /**
   * The hard rule: a scenario that reached settlement is never resettable here,
   * and one that reached dispatch authorization is resettable ONLY when the
   * evidence positively shows no provider call began. A legacy marker with no
   * recognized status is treated as if it had dispatched, so the conservative
   * reading applies to the reset path as well as to `isConsumed`.
   */
  if (marker) {
    const index = stateIndex(marker.status);
    if (index > CONSUMING_FROM_INDEX) refusals.push('marker_past_dispatch_authorization');
    if (index === -1 && marker.providerAttemptStarted !== true) {
      refusals.push('marker_state_unrecognized');
    }
  }

  // Evidence that the attempt never reached a provider.
  if (evidence.providerCallsStarted !== 0) refusals.push('provider_calls_started_nonzero');
  if (evidence.providerLedgerEntries !== 0) refusals.push('provider_ledger_entries_present');
  if (evidence.providerReservations !== 0) refusals.push('provider_reservation_present');
  if (evidence.childApplicationBoots !== 0) refusals.push('child_application_booted');
  if (evidence.evaluationUsersCreated !== 0) refusals.push('evaluation_user_created');
  if (evidence.evaluationTripsCreated !== 0) refusals.push('evaluation_trip_created');
  if (evidence.inputTokens !== 0 || evidence.outputTokens !== 0) refusals.push('token_totals_nonzero');
  if (evidence.costUsd !== 0) refusals.push('cost_nonzero');

  // The audit record must already exist — the void is written BEFORE the reset,
  // so a reset can never erase the only trace of what happened.
  const voided = readVoidedAttempts()
    .some((v) => v.scenarioId === scenarioId && v.runId === runId);
  if (!voided) refusals.push('voided_audit_record_missing');

  if (refusals.length > 0) {
    return { reset: false, refusals };
  }

  fs.unlinkSync(markerPath(scenarioId));
  return { reset: true, refusals: [], scenarioId, runId, restoredTo: 'available' };
}

module.exports = {
  MARKER_DIR,
  STAGE,
  STATE,
  STATE_ORDER,
  CONSUMING_FROM_INDEX,
  REVIEWED_RESET_ACK,
  markerDir,
  voidedDir,
  markerPath,
  stateIndex,
  recordState,
  authorizeProviderDispatch,
  readConsumption,
  isConsumed,
  availability,
  recordVoidedAttempt,
  readVoidedAttempts,
  resetConsumptionForReviewedInstruction,
};
