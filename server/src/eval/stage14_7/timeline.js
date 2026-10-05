'use strict';

/**
 * Stage 14.7G §5 — one monotonic origin per scenario.
 *
 * Why not Date.now(): the whole point of this stage is a gain measurement in
 * milliseconds, and wall-clock time can step backwards (NTP, suspend), which
 * would silently produce a negative or inflated gain. `performance.now()` is
 * monotonic, so a difference between two marks is always a real elapsed
 * duration.
 *
 * Two rules this enforces rather than documents:
 *   - A mark is recorded ONCE. A second mark of the same checkpoint is retained
 *     as a duplicate and flagged, never silently overwritten.
 *   - A visibility mark must be preceded by its persistence-success mark. The
 *     recorder refuses to record `itineraryVisible` before
 *     `revision1PersistenceSuccess`, so "visible" cannot mean "received".
 */

const { performance } = require('perf_hooks');

/** §5 — every checkpoint the report must contain. */
const CHECKPOINTS = [
  'turnStart',
  'responseStartedEvent',
  'firstThinkingEvent',

  'phaseAReservationCreated',
  'phaseAProviderStart',
  'phaseAFirstToken',
  'phaseAProviderEnd',
  'phaseAAttemptSettled',

  'itineraryReadyEvent',
  'revision1PersistenceStart',
  'revision1PersistenceSuccess',
  'itineraryVisible',

  'proseGenerationStartedEvent',
  'phaseBReservationCreated',
  'phaseBProviderStart',
  'phaseBFirstToken',
  'phaseBProviderEnd',
  'phaseBAttemptSettled',

  'firstCompatibilityChunk',
  'streamEndEvent',
  'proseReadyEvent',
  'revision2PersistenceStart',
  'revision2PersistenceSuccess',
  'proseVisible',

  'doneEvent',
  'doneReconciled',
  'restoreStart',
  'restoreSuccess',
  'cleanupStart',
  'cleanupSuccess',
];

/**
 * Checkpoints whose timing the real adapter may not expose. Reported as
 * `unavailable` rather than fabricated (§5).
 */
const OPTIONAL_CHECKPOINTS = new Set(['phaseAFirstToken', 'phaseBFirstToken']);

/** A visibility mark is only legitimate after its persistence succeeded. */
const VISIBILITY_PRECONDITIONS = {
  itineraryVisible: 'revision1PersistenceSuccess',
  proseVisible: 'revision2PersistenceSuccess',
};

function createTimeline({ scenarioId, now = () => performance.now() } = {}) {
  const originMs = now();
  const originWallClockIso = new Date().toISOString();
  const marks = new Map();
  const duplicates = [];
  const violations = [];

  function mark(name) {
    if (!CHECKPOINTS.includes(name)) {
      violations.push({ checkpoint: name, code: 'unknown_checkpoint' });
      return null;
    }
    const at = Number((now() - originMs).toFixed(3));

    if (marks.has(name)) {
      // Kept, not dropped: a duplicate reveals a double-fire that an overwrite
      // would hide, and the FIRST occurrence remains the measurement.
      duplicates.push({ checkpoint: name, atMs: at });
      return marks.get(name);
    }

    const requires = VISIBILITY_PRECONDITIONS[name];
    if (requires && !marks.has(requires)) {
      // Recorded so the run fails loudly. Recording the mark anyway would let a
      // "visible before persisted" ordering pass the gain calculation.
      violations.push({ checkpoint: name, code: 'visibility_before_persistence', requires });
      return null;
    }

    marks.set(name, at);
    return at;
  }

  function at(name) {
    return marks.has(name) ? marks.get(name) : null;
  }

  /** Present-or-unavailable, never fabricated. */
  function report() {
    const checkpoints = {};
    const missingRequired = [];
    for (const name of CHECKPOINTS) {
      if (marks.has(name)) {
        checkpoints[name] = marks.get(name);
      } else {
        checkpoints[name] = OPTIONAL_CHECKPOINTS.has(name) ? 'unavailable' : null;
        if (!OPTIONAL_CHECKPOINTS.has(name)) missingRequired.push(name);
      }
    }
    return {
      scenarioId,
      clock: 'perf_hooks.performance.now',
      monotonic: true,
      originWallClockIso,
      checkpoints,
      missingRequired,
      duplicates,
      violations,
      complete: missingRequired.length === 0 && violations.length === 0,
    };
  }

  /**
   * §8 — the three orderings the stage requires, computed from marks rather
   * than asserted in prose. A null mark makes its ordering false, not absent.
   */
  function orderingReport() {
    const lt = (a, b) => (at(a) != null && at(b) != null ? at(a) < at(b) : false);
    return {
      revision1PersistedBeforeItineraryVisible: lt('revision1PersistenceSuccess', 'itineraryVisible'),
      revision2PersistedBeforeProseVisible: lt('revision2PersistenceSuccess', 'proseVisible'),
      itineraryVisibleBeforeProseReady: lt('itineraryVisible', 'proseReadyEvent'),
    };
  }

  /** §7 — persistence durations, from the same origin. */
  function persistenceDurations() {
    const span = (a, b) => (at(a) != null && at(b) != null ? Number((at(b) - at(a)).toFixed(3)) : null);
    return {
      revision1PersistenceMs: span('revision1PersistenceStart', 'revision1PersistenceSuccess'),
      revision2PersistenceMs: span('revision2PersistenceStart', 'revision2PersistenceSuccess'),
    };
  }

  return { originMs, mark, at, report, orderingReport, persistenceDurations };
}

module.exports = {
  CHECKPOINTS,
  OPTIONAL_CHECKPOINTS,
  VISIBILITY_PRECONDITIONS,
  createTimeline,
};
