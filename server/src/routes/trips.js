const express = require('express');
const router = express.Router();
const {
  getUserTrips,
  getTrip,
  createTrip,
  updateTrip,
  deleteTrip,
  addMessage,
  updateMessageFeedback,
  updateTripMetadata
} = require('../controllers/tripController');
const { applyManualTripMutation } = require('../controllers/manualTripMutationController');
const { protect } = require('../middleware/auth');
const { createProseRecoveryRouter } = require('./proseRecovery');
const TripPlan = require('../models/TripPlan');
const User = require('../models/User');
const { buildSharedTripPayload, normalizeShareScope } = require('../utils/sharedTripPayload');

/**
 * Stage 14.7F7 §1 — NO-STORE for the public share route.
 *
 * A share link is fetched at revision 1 (itinerary only, `notesStatus:
 * not_available`) and again after revision 2 lands. The application previously
 * set no `Cache-Control` at all, so an intermediary that caches a 200
 * heuristically could keep serving the note-less revision-1 body indefinitely.
 * The ETag does change per revision, which protects a REVALIDATING cache — but
 * not a heuristic one.
 *
 * Applied as middleware BEFORE the handler so the header is present on the
 * success path and on bounded errors (404 / thrown) alike. Deliberately narrow:
 * ETags are not disabled globally, and no other route's caching changes.
 */
router.use('/shared/:shareId', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// View shared trip (public, no auth) — must be before router.use(protect)
router.get('/shared/:shareId', async (req, res) => {
  const trip = await TripPlan.findOne({ shareId: req.params.shareId });
  if (!trip) {
    return res.status(404).json({ success: false, error: 'Shared trip not found' });
  }

  let sharedBy = null;
  if (trip.userId) {
    const owner = await User.findById(trip.userId).select('name firstName avatar');
    if (owner) {
      sharedBy = {
        name: owner.name,
        firstName: owner.firstName || owner.name?.split(/\s+/)[0] || null,
        avatar: owner.avatar || null,
      };
    }
  }

  // Stage 8 — the public payload honors the owner-selected scope (default:
  // plan_only). User chat messages and private formData are never exposed unless
  // the owner explicitly opted into full-conversation sharing.
  res.json({
    success: true,
    data: buildSharedTripPayload(trip, { scope: trip.shareScope, sharedBy }),
  });
});

// All routes below are protected
router.use(protect);

router.get('/user/:userId', getUserTrips);
router.get('/:tripId', getTrip);
router.post('/', createTrip);
router.put('/:tripId', updateTrip);
router.post('/:tripId/manual-mutations', applyManualTripMutation);
router.delete('/:tripId', deleteTrip);
router.post('/:tripId/messages', addMessage);
router.patch('/:tripId/messages/:messageId/feedback', updateMessageFeedback);
router.patch('/:tripId/metadata', updateTripMetadata);

// Generate share link
// Stage 14.4 — explicit prose recovery. Mounted HERE so it inherits the same
// `protect` guard and lives beside the ownership checks it depends on. The
// handler still writes no trip content: it reads the owned trip, fences spend
// with its own lease, and streams the successor for the CLIENT to persist.
// Flag-gated (TRAILIE_PROSE_RECOVERY), default off ⇒ 404.
router.use('/', createProseRecoveryRouter());

router.post('/:tripId/share', async (req, res) => {
  const trip = await TripPlan.findById(req.params.tripId);
  if (!trip || trip.userId.toString() !== req.user.id) {
    return res.status(404).json({ success: false, error: 'Trip not found' });
  }

  // Generate a unique share ID if not already set
  if (!trip.shareId) {
    trip.shareId = require('crypto').randomUUID().slice(0, 12);
  }

  // Stage 8 — the owner chooses how much to expose. Defaults to plan_only.
  if (req.body?.scope !== undefined) {
    trip.shareScope = normalizeShareScope(req.body.scope);
  }
  await trip.save();

  res.json({ success: true, shareId: trip.shareId, shareScope: trip.shareScope });
});

module.exports = router;
