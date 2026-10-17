const TripPlan = require('../models/TripPlan');
const {
  resolveCanonicalResponsePersistence,
  mergeTerminalRevisionIntoConversation,
  preserveHistoricalAssistantTurns,
} = require('../utils/canonicalPersistence');
const { buildFeedbackUpdate } = require('../utils/feedbackCommand');
const { resolveCreateIdempotency, CREATE_ACTION } = require('../utils/canonicalPersistence');
const { hashPayload } = require('../utils/canonicalResponse');
const { randomUUID } = require('crypto');
const { validateTripWriteCandidate } = require('../validation/tripWriteContract');
const { buildFrozenSuccessionPlan } = require('../utils/frozenSuccessionPlan');
const { projectOwnerTrip } = require('../utils/planProjection');
const { markTurnPersistence } = require('../services/trailieTurnLedger');
const { resolvePlanningStateForWrite } = require('../utils/planningState');

function observeTurnPersistence(details) {
  Promise.resolve(markTurnPersistence(details)).catch(() => {
    console.warn('[TripController] turn persistence telemetry write failed');
  });
}

// @desc    Get user's trips
// @route   GET /api/trips/user/:userId
// @access  Private
exports.getUserTrips = async (req, res, next) => {
  try {
    // Users can only view their own trips
    if (req.user._id.toString() !== req.params.userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const trips = await TripPlan.find({ 
      userId: req.params.userId,
      status: { $ne: 'deleted' }
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: trips.length,
      data: trips
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single trip
// @route   GET /api/trips/:tripId
// @access  Private
exports.getTrip = async (req, res, next) => {
  try {
    const trip = await TripPlan.findById(req.params.tripId);

    if (!trip) {
      return res.status(404).json({
        success: false,
        error: 'Trip not found'
      });
    }

    // Users can only view their own trips
    if (trip.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    // Stage 14.7F5 §7 — the owner needs canonical identity and lifecycle state to
    // restore their own trip, so this stays subtractive rather than allowlisted.
    // What it removes is the class of things that are never client data at all:
    // leases and fencing tokens, evaluation metadata, reviewer prompts and
    // rejected drafts, provider payloads, and persistence/reducer machinery.
    res.status(200).json({
      success: true,
      data: projectOwnerTrip(trip.toObject ? trip.toObject() : trip)
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create trip
// @route   POST /api/trips
// @access  Private
exports.createTrip = async (req, res, next) => {
  try {
    // Stage 14.7F4 §6 — every submitted value on create is new, so the whole
    // candidate is validated through the same shared contract the update path
    // uses. Mongoose schema validation still runs on save as defence in depth.
    const createVerdict = validateTripWriteCandidate({
      operation: 'create',
      existingTrip: null,
      incomingConversation: req.body.conversation,
      incomingPlan: req.body.plan,
    });
    if (!createVerdict.ok) {
      return res.status(400).json({
        success: false,
        error: 'Invalid trip write',
        code: createVerdict.code,
        category: createVerdict.category,
        field: createVerdict.field,
      });
    }
    // Stage 8.1 §5 — new-trip idempotency. A duplicate `done`/retry must not
    // create a second trip for the same canonical response.
    const incomingResponseId = req.body.plan?.responseId;
    if (incomingResponseId) {
      const existing = await TripPlan.findOne({
        userId: req.user._id,
        'plan.responseId': incomingResponseId,
      });
      if (existing) {
        const { action, reason } = resolveCreateIdempotency({
          incomingPlan: req.body.plan,
          existingPlan: existing.plan,
          expectedPreviousRevision: req.body.expectedPreviousRevision,
        });
        if (action === CREATE_ACTION.RETURN_EXISTING) {
          observeTurnPersistence({
            responseId: incomingResponseId,
            attempted: true,
            status: 'idempotent',
            responseRevision: req.body.plan?.responseRevision ?? null,
            hashMatch: true,
          });
          return res.status(200).json({ success: true, data: existing, idempotent: true });
        }
        // Stage 14.1 §8 — the terminal revision of a turn whose revision 1 already
        // created this trip. It is an UPDATE, never a second trip. Point the client
        // at the existing trip rather than silently creating a duplicate.
        if (action === CREATE_ACTION.UPDATE_EXISTING) {
          return res.status(409).json({
            success: false,
            error: 'This response already has a trip; send the terminal revision as an update',
            action,
            reason,
            tripId: existing._id,
            storedIdentity: {
              responseId: existing.plan.responseId,
              responseVersion: existing.plan.responseVersion,
              responseRevision: existing.plan.responseRevision ?? null,
              contentHash: existing.plan.contentHash,
              itineraryHash: existing.plan.itineraryHash,
            },
          });
        }
        if (action === CREATE_ACTION.CONFLICT) {
          return res.status(409).json({
            success: false,
            error: 'A different response already exists for this id',
            reason,
            storedIdentity: {
              responseId: existing.plan.responseId,
              responseVersion: existing.plan.responseVersion,
              responseRevision: existing.plan.responseRevision ?? null,
              contentHash: existing.plan.contentHash,
              itineraryHash: existing.plan.itineraryHash,
            },
          });
        }
      } else if (req.body.expectedPreviousRevision != null) {
        // §8 — a terminal revision naming a base revision that does not exist must
        // NOT construct a partial trip (terminal prose with no itinerary checkpoint).
        return res.status(409).json({
          success: false,
          error: 'Cannot create a trip for a revision that expects an earlier revision',
          reason: 'expected_revision_but_none_stored',
        });
      }
    }

    const tripData = {
      ...req.body,
      userId: req.user._id
    };

    // Pass #5 — freeze normalized planningState on accepted create (rev-1 / first save).
    const resolvedPlanningState = resolvePlanningStateForWrite({
      incomingPlanningState: req.body.planningState,
      formData: req.body.formData,
      parkCode: req.body.parkCode,
      parkName: req.body.parkName,
      conversation: req.body.conversation,
    });
    if (resolvedPlanningState) {
      tripData.planningState = resolvedPlanningState;
    }

    const trip = await TripPlan.create(tripData);
    try {
      const Analytics = require('../models/Analytics');
      const { classifyBot } = require('../utils/botClassifier');
      const { persistAnalytics } = require('../services/analyticsWriter');
      if (!classifyBot(req.get('User-Agent')).isBot) void persistAnalytics(() => Analytics.create({
        eventType: 'conversation_create',
        userAgent: req.get('User-Agent'),
        eventCategory: 'engagement',
        userId: req.user._id,
        sessionId: req.get('x-session-id') || `trip-${trip._id}`,
        userType: 'authenticated',
        pageUrl: '/plan-ai',
        parkCode: trip.parkCode || null,
        metadata: { action: 'trip_created', tripId: String(trip._id) },
        timestamp: new Date(),
      }));
    } catch {
      // Analytics must never block trip persistence.
    }
    observeTurnPersistence({
      responseId: incomingResponseId,
      attempted: true,
      status: 'created',
      responseRevision: req.body.plan?.responseRevision ?? null,
      hashMatch: true,
    });

    // Notify via WebSocket
    const wsService = req.app.get('wsService');
    if (wsService) {
      wsService.notifyTripCreated(req.user._id, trip);
    }

    res.status(201).json({
      success: true,
      data: trip
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update trip
// @route   PUT /api/trips/:tripId
/**
 * Stage 14.4 §11 — retire a prose-recovery lease once terminal revision 2 is
 * durable. Deliberately best-effort: a failure here is logged with a bounded
 * code and left to the TTL index rather than disturbing a successful trip write.
 */
async function retireProseRecoveryLease({ req, resolution, plan }) {
  try {
    if (!resolution || !plan) return;
    const identity = resolution.incomingIdentity;
    if (!identity?.responseId) return;

    const { clearLeaseAfterPersistence } = require('../services/proseRecoveryLease');
    const LeaseModel = require('../models/TrailieProseRecoveryLease');

    const result = await clearLeaseAfterPersistence({
      Model: LeaseModel,
      userId: req.user?._id?.toString() || req.user?.id,
      responseId: identity.responseId,
      outcome: resolution.outcome,
      responseRevision: resolution.incomingRevision,
      contentHash: plan.contentHash ?? identity.contentHash,
      itineraryHash: plan.itineraryHash ?? identity.itineraryHash,
    });
    if (!result.cleared && result.reason === 'lease_cleanup_failed') {
      console.warn('[TripController] prose recovery lease cleanup failed; leaving for TTL');
    }
  } catch {
    console.warn('[TripController] prose recovery lease cleanup failed; leaving for TTL');
  }
}

// @access  Private
exports.updateTrip = async (req, res, next) => {
  try {
    const trip = await TripPlan.findById(req.params.tripId);

    if (!trip) {
      return res.status(404).json({
        success: false,
        error: 'Trip not found'
      });
    }

    // Users can only update their own trips
    if (trip.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    // Deployment compatibility: the old frontend archives/restores with an
    // exact status-only PUT. Never let a response save enter this metadata path.
    if (Object.keys(req.body).length === 1 && Object.hasOwn(req.body, 'status')) {
      if (!['active', 'archived'].includes(req.body.status)) {
        return res.status(400).json({ success: false, error: 'Status must be active or archived' });
      }
      if (!['active', 'archived'].includes(trip.status)) {
        return res.status(409).json({ success: false, error: 'Trip cannot be archived or restored from its current status' });
      }
      const updatedTrip = await TripPlan.findOneAndUpdate(
        { _id: trip._id, userId: req.user._id, status: trip.status },
        { $set: { status: req.body.status } },
        { new: true, runValidators: true }
      );
      if (!updatedTrip) {
        return res.status(409).json({ success: false, error: 'Trip changed; reload before retrying' });
      }
      return res.status(200).json({ success: true, data: updatedTrip });
    }

    // Stage 8.3 — this route persists ONLY the canonical response unit. Independent
    // trip-management fields (title, status, shareScope, …) are NOT accepted here;
    // they have narrow commands (PATCH /trips/:id/metadata), so a stale or routine
    // response auto-save can never rename a trip or reactivate an archived one.
    const RESPONSE_COUPLED_FIELDS = ['plan', 'conversation', 'formData', 'summary', 'provider', 'planningState', 'entryContext'];

    const updateData = {};
    RESPONSE_COUPLED_FIELDS.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    // Owner structural edits must use POST …/manual-mutations. Plan-only PUTs
    // previously could return success while resolveCanonicalResponsePersistence
    // stripped the plan as IDEMPOTENT (stale itineraryHash). Conversation+plan
    // chat/AI saves remain allowed on this route.
    if (updateData.plan !== undefined && updateData.conversation === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Plan-only updates require the manual mutation endpoint',
        code: 'manual_mutation_required',
      });
    }

    // Pass #5 — on accepted response-coupled writes, freeze normalized planningState.
    // Rebuild from conversation last-user patch + previous even when the client
    // does not echo planningState/formData (current responseSavePayload shape).
    if (
      req.body.planningState !== undefined
      || req.body.formData !== undefined
      || req.body.conversation !== undefined
    ) {
      const resolvedPlanningState = resolvePlanningStateForWrite({
        incomingPlanningState: req.body.planningState,
        formData: req.body.formData !== undefined ? req.body.formData : trip.formData,
        previousPlanningState: trip.planningState,
        parkCode: req.body.parkCode || trip.parkCode,
        parkName: req.body.parkName || trip.parkName,
        conversation: req.body.conversation !== undefined ? req.body.conversation : trip.conversation,
      });
      if (resolvedPlanningState) {
        updateData.planningState = resolvedPlanningState;
      }
    }

    // WP-TU Phase 4 Task 10E — cross-plan mutation provenance. Populated
    // ONLY when the write claims to originate from another trip's turn
    // (`sourceTripId`/`sourceResponseId` — new, optional fields; every
    // ordinary same-trip write sends neither, so this is inert for them).
    // The source trip is loaded and OWNERSHIP-CHECKED here, server-side —
    // never trusting the client's claim about ITS content, only its id.
    // `validateTripWriteCandidate`/`resolveCanonicalWriteTarget` stay pure
    // (no database access); they receive this already-fetched, already
    // ownership-verified data as a plain object.
    let sourceProvenance = null;
    if (req.body.sourceTripId && req.body.sourceResponseId) {
      const sourceTrip = await TripPlan.findById(req.body.sourceTripId);
      if (sourceTrip && sourceTrip.userId.toString() === req.user._id.toString()) {
        sourceProvenance = {
          sourceResponseId: req.body.sourceResponseId,
          sourceConversation: sourceTrip.conversation || [],
        };
      }
      // Else: sourceProvenance stays null. A missing source trip or a
      // source trip owned by a different user must fail closed exactly
      // like an unowned identity — never fall back to trusting the claim.
    }

    // Stage 14.7F4 §6 — WRITE-CONTRACT VALIDATION, before any persistence
    // decision and before any mutation.
    //
    // `findByIdAndUpdate` does not run schema validators, and enabling
    // `runValidators` globally would validate unchanged historical messages and
    // make older trips permanently unupdatable. So new-or-modified records are
    // validated here; byte-equivalent historical records pass through.
    const writeVerdict = validateTripWriteCandidate({
      operation: 'update',
      existingTrip: trip,
      incomingConversation: 'conversation' in updateData ? updateData.conversation : undefined,
      incomingPlan: 'plan' in updateData ? updateData.plan : undefined,
      sourceProvenance,
      targetTripId: req.params.tripId,
    });
    if (!writeVerdict.ok) {
      return res.status(400).json({
        success: false,
        error: 'Invalid trip write',
        code: writeVerdict.code,
        category: writeVerdict.category,
        field: writeVerdict.field,
      });
    }

    // Stage 8.1/8.2/8.3 — atomic canonical-response guard. Conversation, plan, and
    // all response-coupled metadata are accepted or rejected together.
    const resolution = resolveCanonicalResponsePersistence({
      incomingPlan: 'plan' in updateData ? updateData.plan : undefined,
      incomingConversation: 'conversation' in updateData ? updateData.conversation : undefined,
      expectedPreviousVersion: req.body.expectedPreviousVersion,
      // Stage 14.1 §5 — intra-turn compare-and-swap for revision succession.
      expectedPreviousRevision: req.body.expectedPreviousRevision,
      existingPlan: trip.plan,
      existingConversation: trip.conversation,
    });
    const planPersistence = {
      outcome: resolution.outcome,
      reason: resolution.reason,
      success: resolution.success,
      storedIdentity: resolution.storedIdentity || null,
      // Stage 14.1 — so the client can tell a terminal succession from a new turn.
      revisionSuccession: resolution.revisionSuccession === true,
      storedRevision: resolution.storedRevision ?? null,
      incomingRevision: resolution.incomingRevision ?? null,
    };
    if (!resolution.writeResponseCoupled) {
      RESPONSE_COUPLED_FIELDS.forEach(field => delete updateData[field]);
    }

    // Stage 14.1 §7 — REVISION SUCCESSION (rev 1 → rev 2 of the SAME turn). The
    // terminal write must UPDATE the existing assistant turn in place; appending
    // would leave two assistant messages and two plans for one logical response.
    //
    // Stage 14.7F4B §2 — the plan is rebuilt from the STORED revision-1 plan, not
    // from the incoming one. Only whitelisted lifecycle progression metadata
    // advances, so no itinerary-derived field a revision-2 write mutates can
    // survive, whether or not this code knows the field exists.
    //
    // Reachable ONLY through `resolution.revisionSuccession`, i.e. after identity
    // and version validity have been established. Normalization can never rescue
    // an unknown or wrong-version target.
    if (resolution.revisionSuccession && updateData.conversation) {
      updateData.conversation = mergeTerminalRevisionIntoConversation({
        storedConversation: trip.conversation,
        incomingConversation: updateData.conversation,
        responseId: resolution.incomingIdentity.responseId,
      });
      if (updateData.plan && trip.plan) {
        updateData.plan = buildFrozenSuccessionPlan({
          storedPlan: trip.plan,
          incomingPlan: updateData.plan,
          resolvedIdentity: resolution.incomingIdentity,
        });
        // Bounded normalization metadata: the client learns the stored canonical
        // plan won, without any rejected plan content being echoed back.
        planPersistence.frozenPlanRetained = true;
      }
    }

    // A new responseVersion appends a new assistant turn while every older turn
    // remains immutable history. Restore any sparse historical client
    // projections from the stored trip after the target guard approves them.
    if (
      resolution.writeResponseCoupled &&
      !resolution.revisionSuccession &&
      updateData.conversation &&
      resolution.incomingIdentity?.responseId
    ) {
      updateData.conversation = preserveHistoricalAssistantTurns({
        storedConversation: trip.conversation,
        incomingConversation: updateData.conversation,
        targetResponseId: resolution.incomingIdentity.responseId,
      });
    }

    // Stage 8.3 — one-time migration: stamp canonical identity onto a legacy plan
    // so all future writes must be versioned (closes the legacy bypass).
    if (resolution.needsMigrationStamp && updateData.plan && typeof updateData.plan === 'object') {
      const assistantContent = [...(updateData.conversation || [])]
        .reverse()
        .find(m => m && m.role === 'assistant')?.content || '';
      updateData.plan = {
        ...updateData.plan,
        responseId: randomUUID(),
        responseVersion: 1,
        contentHash: hashPayload(assistantContent),
        itineraryHash: updateData.plan.days ? hashPayload(updateData.plan) : null,
      };
    }

    // Stage 8.3 — a rejected canonical write (and any empty update) issues no DB
    // write at all, so idempotent/stale/conflict retries are truly side-effect free.
    if (Object.keys(updateData).length === 0) {
      // An IDEMPOTENT terminal revision still retires the recovery fence: the
      // durable state the lease was waiting for is present.
      await retireProseRecoveryLease({ req, resolution, plan: req.body.plan });
      observeTurnPersistence({
        responseId: resolution.incomingIdentity?.responseId,
        attempted: true,
        status: resolution.outcome,
        responseRevision: resolution.incomingRevision ?? null,
        hashMatch: resolution.success === true,
      });
      return res.status(200).json({ success: resolution.success, data: trip, planPersistence });
    }

    // Enforce the snapshot used by the canonical decision at the write boundary.
    // Mongoose update queries do not increment __v automatically. Including
    // updatedAt also detects intervening field-scoped writes (e.g. feedback).
    const updatedTrip = await TripPlan.findOneAndUpdate(
      {
        _id: req.params.tripId,
        userId: req.user._id,
        updatedAt: trip.updatedAt || null,
        ...(trip.__v == null || trip.__v === 0
          ? { $or: [{ __v: 0 }, { __v: { $exists: false } }] }
          : { __v: trip.__v }),
      },
      { $set: updateData, $inc: { __v: 1 } },
      { new: true }
    );
    if (!updatedTrip) {
      observeTurnPersistence({
        responseId: resolution.incomingIdentity?.responseId,
        attempted: true,
        status: 'conflict',
        hashMatch: false,
      });
      return res.status(409).json({
        success: false,
        error: 'Trip changed while saving. Reload the trip before saving again.',
        code: 'canonical_write_conflict',
        planPersistence: { ...planPersistence, outcome: 'conflict', reason: 'concurrent_write', success: false },
      });
    }
    Object.assign(trip, updatedTrip.toObject());

    // Stage 14.4 §11 — LEASE CLEANUP, not response persistence. It runs only
    // after the canonical write above was already accepted, is conditioned on the
    // response identity and the recorded hashes, and can never roll that write
    // back. This route remains the sole trip-content writer; the recovery route
    // still writes nothing but its own lease.
    await retireProseRecoveryLease({ req, resolution, plan: updateData.plan });
    observeTurnPersistence({
      responseId: resolution.incomingIdentity?.responseId,
      attempted: true,
      status: 'accepted',
      responseRevision: resolution.incomingRevision ?? null,
      hashMatch: true,
    });

    // Notify via WebSocket
    const wsService = req.app.get('wsService');
    if (wsService) {
      wsService.notifyTripUpdated(req.user._id, trip);
    }

    res.status(200).json({
      success: true,
      data: trip,
      planPersistence
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update independent trip-management metadata (narrow, allowlisted)
// @route   PATCH /api/trips/:tripId/metadata
// @access  Private
exports.updateTripMetadata = async (req, res, next) => {
  try {
    // Strict allowlist — NEVER touches response-coupled fields (plan,
    // conversation, formData, summary, provider) or response identity.
    const ALLOWED = ['title', 'status', 'shareScope'];
    const setDoc = {};
    ALLOWED.forEach(field => {
      if (req.body[field] !== undefined) setDoc[field] = req.body[field];
    });

    if (Object.keys(setDoc).length === 0) {
      return res.status(400).json({ success: false, error: 'No allowed metadata fields provided' });
    }

    const trip = await TripPlan.findById(req.params.tripId);
    if (!trip) {
      return res.status(404).json({ success: false, error: 'Trip not found' });
    }
    if (trip.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const updatedTrip = await TripPlan.findByIdAndUpdate(
      req.params.tripId,
      { $set: setDoc },
      { new: true }
    );

    res.status(200).json({ success: true, data: updatedTrip });
  } catch (error) {
    next(error);
  }
};

// @desc    Set thumbs up/down on a single message (narrow, field-scoped)
// @route   PATCH /api/trips/:tripId/messages/:messageId/feedback
// @access  Private
exports.updateMessageFeedback = async (req, res, next) => {
  try {
    const messageId = Number(req.params.messageId);
    const update = buildFeedbackUpdate(req.body.feedback, messageId);
    if (!update.valid) {
      return res.status(400).json({ success: false, error: 'feedback must be "up", "down", or null' });
    }

    const trip = await TripPlan.findById(req.params.tripId);
    if (!trip) {
      return res.status(404).json({ success: false, error: 'Trip not found' });
    }
    if (trip.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    // Field-scoped write: ONLY userFeedback + feedbackAt on the matched message.
    // Never touches content, response identity, hashes, version, or the plan.
    const result = await TripPlan.updateOne(
      { _id: req.params.tripId },
      { $set: update.setDoc, $inc: { __v: 1 } },
      { arrayFilters: update.arrayFilters }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete trip (soft delete)
// @route   DELETE /api/trips/:tripId
// @access  Private
exports.deleteTrip = async (req, res, next) => {
  try {
    const trip = await TripPlan.findById(req.params.tripId);

    if (!trip) {
      return res.status(404).json({
        success: false,
        error: 'Trip not found'
      });
    }

    // Users can only delete their own trips
    if (trip.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    trip.status = 'deleted';
    await trip.save();

    // Notify via WebSocket
    const wsService = req.app.get('wsService');
    if (wsService) {
      wsService.notifyTripDeleted(req.user._id, trip._id);
    }

    res.status(200).json({
      success: true,
      message: 'Trip deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add message to trip
// @route   POST /api/trips/:tripId/messages
// @access  Private
exports.addMessage = async (req, res, next) => {
  try {
    const { role, content, provider, model } = req.body;

    const trip = await TripPlan.findById(req.params.tripId);

    if (!trip) {
      return res.status(404).json({
        success: false,
        error: 'Trip not found'
      });
    }

    // Users can only add messages to their own trips
    if (trip.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    await trip.addMessage({
      role,
      content,
      provider,
      model
    });

    res.status(200).json({
      success: true,
      data: trip
    });
  } catch (error) {
    next(error);
  }
};
