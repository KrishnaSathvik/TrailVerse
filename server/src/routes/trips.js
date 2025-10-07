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

// All routes are protected
router.use(protect);

router.get('/user/:userId', getUserTrips);
router.get('/:tripId', getTrip);
router.post('/', createTrip);
router.put('/:tripId', updateTrip);
router.delete('/:tripId', deleteTrip);
router.post('/:tripId/messages', addMessage);

module.exports = router;
