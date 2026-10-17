'use strict';

const TripPlan = require('../models/TripPlan');
const { applyManualMutation } = require('../services/manualTripMutation');
const { validateManualPlanIntegrity } = require('../services/manualPlanIntegrity');
const { prepareManualPlanCommit } = require('../services/trailieManualCommit');
const {
  rejectForgeAttempt,
  resolveManualPlace,
} = require('../services/manualPlaceResolution');
const { projectOwnerTrip } = require('../utils/planProjection');

/**
 * @desc    Apply a typed owner manual TripPlan mutation
 * @route   POST /api/trips/:tripId/manual-mutations
 * @access  Private
 */
async function applyManualTripMutation(req, res, next) {
  try {
    const trip = await TripPlan.findById(req.params.tripId);
    if (!trip) {
      return res.status(404).json({ success: false, error: 'Trip not found' });
    }
    if (trip.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    if (!trip.plan || !Array.isArray(trip.plan.days) || trip.plan.days.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Trip has no plan to edit',
        code: 'manual_mutation_invalid',
      });
    }

    const body = req.body || {};
    if (rejectForgeAttempt(body)) {
      return res.status(400).json({
        success: false,
        error: 'Client-authored place identity is not accepted',
        code: 'place_forge_rejected',
      });
    }

    const snapshot = trip.toObject ? trip.toObject() : trip;
    let mutationBody = body;

    if (body.op === 'add_place') {
      const resolution = await resolveManualPlace({
        query: body.query,
        trip: snapshot,
        candidateId: typeof body.candidateId === 'string' ? body.candidateId : null,
        signal: req.signal,
      });
      if (resolution.status === 'ambiguous') {
        return res.status(400).json({
          success: false,
          error: 'Which place did you mean?',
          code: 'place_ambiguous',
          query: resolution.query,
          choices: resolution.choices,
        });
      }
      if (resolution.status !== 'resolved') {
        return res.status(400).json({
          success: false,
          error: 'Could not resolve that place',
          code: 'place_unresolved',
          query: resolution.query || body.query,
        });
      }
      mutationBody = {
        op: 'add_place',
        dayId: body.dayId,
        index: body.index,
        stop: resolution.stopSeed,
      };
    }

    const applied = applyManualMutation(snapshot.plan, mutationBody);
    if (!applied.ok) {
      return res.status(400).json({
        success: false,
        error: 'Invalid manual mutation',
        code: applied.code,
      });
    }

    const integrity = validateManualPlanIntegrity(applied.plan, {
      touchedDayNumbers: applied.touchedDayNumbers,
    });
    if (!integrity.ok) {
      return res.status(400).json({
        success: false,
        error: 'Manual plan failed integrity checks',
        code: integrity.code,
        issues: integrity.issues || undefined,
      });
    }

    const prepared = prepareManualPlanCommit({
      snapshot,
      plan: applied.plan,
      targetTripId: req.params.tripId,
    });
    if (!prepared.ok) {
      return res.status(prepared.status || 400).json({
        success: false,
        error: 'Manual plan commit rejected',
        code: prepared.code,
      });
    }

    const updated = await TripPlan.findOneAndUpdate(
      {
        _id: req.params.tripId,
        userId: req.user._id,
        updatedAt: trip.updatedAt || null,
        ...(trip.__v == null || trip.__v === 0
          ? { $or: [{ __v: 0 }, { __v: { $exists: false } }] }
          : { __v: trip.__v }),
      },
      {
        $set: {
          plan: prepared.plan,
          conversation: prepared.conversation,
        },
        $inc: { __v: 1 },
      },
      { new: true },
    );

    if (!updated) {
      return res.status(409).json({
        success: false,
        error: 'Trip changed while saving. Reload the trip before saving again.',
        code: 'canonical_write_conflict',
      });
    }

    const wsService = req.app.get('wsService');
    if (wsService) {
      wsService.notifyTripUpdated(req.user._id, updated);
    }

    const plain = updated.toObject ? updated.toObject() : updated;
    return res.status(200).json({
      success: true,
      data: projectOwnerTrip(plain),
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { applyManualTripMutation };
