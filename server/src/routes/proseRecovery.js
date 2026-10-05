const express = require('express');

const TripPlan = require('../models/TripPlan');
const TrailieProseRecoveryLease = require('../models/TrailieProseRecoveryLease');
const { setSseHeaders, writeSseEvent, attachClientDisconnectAbort } = require('../utils/sseStream');
const { getProseRecoveryConfig } = require('../config/proseRecoveryConfig');
const { getProseConsistencyConfig } = require('../config/proseConsistencyConfig');
const {
  RECOVERY_DECISION,
  evaluateStoredRevisionForRecovery,
} = require('../utils/storedRevisionValidation');
const { RECOVERY_OUTCOME, runProseRecovery } = require('../services/proseRecoveryService');
const {
  LEASE_OUTCOME,
  acquireRecoveryLease,
  transitionToAwaitingPersistence,
  releaseRecoveryLease,
} = require('../services/proseRecoveryLease');
const { buildDefaultProseDeliverer } = require('../services/proseRecoveryDeliverer');

/**
 * Stage 14.4 — explicit prose recovery.
 *
 *   POST /api/trips/:tripId/response/:responseId/prose
 *
 * Completes Phase B for an EXISTING logical response whose revision 1 is already
 * durable. It reads the owned trip, fences spend with a lease, streams the
 * successor, and stops. It never writes trip content: the client remains the
 * sole persistence initiator, exactly as in Stage 8 and Stage 14.3.
 *
 * Every refusal — missing trip, foreign trip, unknown response, mismatched
 * identity — returns the SAME bounded 404, so a `responseId` cannot be probed.
 */

/**
 * @param {Object} deps  injected so the whole route is testable with no network,
 *                       no mongo and no provider.
 */
function createProseRecoveryRouter({
  Trip = TripPlan,
  LeaseModel = TrailieProseRecoveryLease,
  config = getProseRecoveryConfig,
  proseConfig = getProseConsistencyConfig,
  buildDeliverProse = ({ signal } = {}) => buildDefaultProseDeliverer({ signal }),
  logRecovery = () => {},
  now = () => new Date(),
} = {}) {
  const router = express.Router({ mergeParams: true });

  router.post('/:tripId/response/:responseId/prose', async (req, res) => {
    const cfg = config();

    // Flag off: fail closed BEFORE any lease or provider work.
    if (!cfg.enabled) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }

    const notFound = () => res.status(404).json({ success: false, error: 'Not found' });
    const { tripId, responseId } = req.params;
    const userId = req.user?._id?.toString() || req.user?.id;
    if (!userId) return notFound();

    // ── Authorization: ownership first, and indistinguishable failures ──────
    let trip;
    try {
      trip = await Trip.findById(tripId);
    } catch {
      return notFound();
    }
    if (!trip) return notFound();
    if (trip.userId?.toString() !== userId) return notFound();

    // ── Stored-state validation, before any spend ───────────────────────────
    const evaluation = evaluateStoredRevisionForRecovery({ trip, responseId });

    if (evaluation.decision === RECOVERY_DECISION.REFUSED) {
      logRecovery({ recoveryAttempted: true, recoveryLeaseOutcome: 'not_acquired', code: evaluation.code });
      return notFound();
    }

    // Already finished: zero provider calls, and no lease acquired.
    if (evaluation.decision === RECOVERY_DECISION.ALREADY_COMPLETE) {
      logRecovery({ recoveryAttempted: true, recoveryLeaseOutcome: 'already_complete', proseAttemptCount: 0 });
      return res.status(200).json({
        success: true,
        data: { alreadyComplete: true, responseId, responseVersion: evaluation.context.responseVersion },
      });
    }

    const stored = evaluation.context;

    // ── Spend fence ─────────────────────────────────────────────────────────
    const acquisition = await acquireRecoveryLease({
      LeaseModel,
      Model: LeaseModel,
      userId,
      responseId,
      tripId,
      itineraryHash: stored.itineraryHash,
      now: now(),
      leaseMs: cfg.leaseMs,
      retryAfterSeconds: cfg.retryAfterSeconds,
    });

    if (acquisition.outcome !== LEASE_OUTCOME.ACQUIRED) {
      const awaiting = acquisition.outcome === LEASE_OUTCOME.CONFLICT_AWAITING_PERSISTENCE;
      logRecovery({
        recoveryAttempted: true,
        recoveryLeaseOutcome: acquisition.outcome,
        proseAttemptCount: 0,
      });
      res.set('Retry-After', String(acquisition.retryAfterSeconds ?? cfg.retryAfterSeconds));
      return res.status(409).json({
        success: false,
        // Bounded slugs — never provider or driver detail.
        error: awaiting ? 'prose_result_awaiting_persistence' : 'prose_generation_in_progress',
        retryAfterSeconds: acquisition.retryAfterSeconds ?? cfg.retryAfterSeconds,
      });
    }

    const { leaseToken } = acquisition.lease;
    const controller = new AbortController();
    // Hard request-bound deadline, strictly shorter than the lease.
    const deadline = setTimeout(() => controller.abort(), cfg.maxRuntimeMs);
    let released = false;
    const releaseIfOwned = async () => {
      if (released) return;
      released = true;
      await releaseRecoveryLease({ Model: LeaseModel, userId, responseId, leaseToken }).catch(() => {});
    };

    // Disconnect before the provider call: release and spend nothing.
    if (req.aborted || res.writableEnded) {
      clearTimeout(deadline);
      await releaseIfOwned();
      return undefined;
    }

    setSseHeaders(res);
    attachClientDisconnectAbort(req, res, controller);

    // No `response_started` and no `itinerary_ready` — the client already holds
    // revision 1, and re-emitting them would invite a duplicate checkpoint.
    writeSseEvent(res, { type: 'prose_generation_started', responseId });

    let proseAttemptCount = 0;
    const startedAt = Date.now();
    try {
      const result = await runProseRecovery({
        storedRevision: stored,
        deliverProse: buildDeliverProse({ req, signal: controller.signal, stored }),
        proseConfig: proseConfig(),
        resolvedMetadata: { parkName: stored.parkName, parkCode: stored.parkCode },
        signal: controller.signal,
        onProseAttempt: () => {
          proseAttemptCount += 1;
        },
      });
      clearTimeout(deadline);

      if (result.outcome !== RECOVERY_OUTCOME.PROSE_READY) {
        // No safe terminal revision exists: release the fence so the user may
        // retry, leave stored revision 1 untouched, and emit one bounded error.
        await releaseIfOwned();
        logRecovery({
          recoveryAttempted: true,
          recoveryLeaseOutcome: 'released',
          proseAttemptCount,
          fallbackUsed: false,
          phaseBDurationMs: Date.now() - startedAt,
        });
        if (!res.writableEnded) {
          writeSseEvent(res, {
            type: 'error',
            message: result.outcome === RECOVERY_OUTCOME.ABORTED ? 'prose_aborted' : 'prose_failed',
          });
          res.end();
        }
        return undefined;
      }

      const { revisionTwo } = result;

      // §10 — close the generation→persistence window BEFORE emitting prose.
      // If this transition fails the lease was reclaimed by someone else, so
      // this request must not publish a result against it.
      const transition = await transitionToAwaitingPersistence({
        Model: LeaseModel,
        userId,
        responseId,
        leaseToken,
        expectedContentHash: revisionTwo.response.contentHash,
        itineraryHash: revisionTwo.response.itineraryHash,
        now: now(),
        leaseMs: cfg.leaseMs,
      });
      if (!transition.ok) {
        logRecovery({ recoveryAttempted: true, recoveryLeaseOutcome: 'stale_lease_token', proseAttemptCount });
        if (!res.writableEnded) {
          writeSseEvent(res, { type: 'error', message: 'prose_lease_lost' });
          res.end();
        }
        return undefined;
      }
      released = true; // ownership handed to the awaiting_persistence fence

      writeSseEvent(res, {
        type: 'prose_ready',
        response: revisionTwo.response,
        canonicalPlan: revisionTwo.canonicalPlan,
        expectedPreviousRevision: revisionTwo.expectedPreviousRevision,
      });

      // `done` stays direct-terminal and self-contained: no revision fields, no
      // expectedPreviousRevision, so an old client could still save it.
      writeSseEvent(res, {
        type: 'done',
        contentUnchanged: false,
        content: revisionTwo.response.content,
        responseId: revisionTwo.response.responseId,
        responseVersion: revisionTwo.response.responseVersion,
        contentHash: revisionTwo.response.contentHash,
        itineraryHash: revisionTwo.response.itineraryHash,
        canonicalPlan: revisionTwo.canonicalPlan,
        provider: revisionTwo.response.provider,
        model: revisionTwo.response.model,
      });
      res.end();

      logRecovery({
        recoveryAttempted: true,
        recoveryLeaseOutcome: 'awaiting_persistence',
        proseAttemptCount,
        fallbackUsed: result.meta?.deterministicFallbackUsed === true,
        phaseBDurationMs: Date.now() - startedAt,
      });
      return undefined;
    } catch (err) {
      clearTimeout(deadline);
      await releaseIfOwned();
      // Bounded slug only.
      console.error('[ProseRecovery] failed:', err?.message);
      if (!res.writableEnded) {
        writeSseEvent(res, { type: 'error', message: 'prose_failed' });
        res.end();
      }
      return undefined;
    }
  });

  return router;
}

module.exports = { createProseRecoveryRouter };
