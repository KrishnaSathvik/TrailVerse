const express = require('express');
const router = express.Router();
const {
  getUserTrips,
  getTrip,
  createTrip,
  updateTrip,
  deleteTrip,
  addMessage
} = require('../controllers/tripController');
const { protect } = require('../middleware/auth');
const TripPlan = require('../models/TripPlan');

// View shared trip (public, no auth) — must be before router.use(protect)
router.get('/shared/:shareId', async (req, res) => {
  const trip = await TripPlan.findOne({ shareId: req.params.shareId });
  if (!trip) {
    return res.status(404).json({ success: false, error: 'Shared trip not found' });
  }

  res.json({
    success: true,
    data: {
      title: trip.title,
      parkName: trip.parkName,
      formData: trip.formData,
      conversation: trip.conversation,
      plan: trip.plan,
      createdAt: trip.createdAt
    }
  });
});

// All routes below are protected
router.use(protect);

router.get('/user/:userId', getUserTrips);
router.get('/:tripId', getTrip);
router.post('/', createTrip);
router.put('/:tripId', updateTrip);
router.delete('/:tripId', deleteTrip);
router.post('/:tripId/messages', addMessage);

// Generate share link
router.post('/:tripId/share', async (req, res) => {
  const trip = await TripPlan.findById(req.params.tripId);
  if (!trip || trip.userId.toString() !== req.user.id) {
    return res.status(404).json({ success: false, error: 'Trip not found' });
  }

  // Generate a unique share ID if not already set
  if (!trip.shareId) {
    trip.shareId = require('crypto').randomUUID().slice(0, 12);
    await trip.save();
  }

  res.json({ success: true, shareId: trip.shareId });
});

module.exports = router;
