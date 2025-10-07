const express = require('express');
const router = express.Router();
const {
  getProfile,
  updateProfile,
  savePark,
  removeSavedPark,
  getSavedParks,
  checkParkSaved,
  getUserStats,
  markParkVisited,
  markFavoriteAsVisited,
  checkParkVisited,
  markParkAsVisited,
  getVisitedParks,
  removeVisitedPark,
  updateVisitedPark
} = require('../controllers/userController');
const { protect } = require('../middleware/auth');

// All routes are protected
router.use(protect);

router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.get('/stats', getUserStats);

router.get('/saved-parks', getSavedParks);
router.post('/saved-parks', savePark);
router.post('/saved-parks/visited', markParkVisited);
router.delete('/saved-parks/:parkCode', removeSavedPark);
router.get('/saved-parks/:parkCode/check', checkParkSaved);

// Visited parks routes (separate from favorites)
router.get('/visited-parks', getVisitedParks);
router.post('/visited-parks/:parkCode', markParkAsVisited);
router.get('/visited-parks/:parkCode', checkParkVisited);
router.put('/visited-parks/:parkCode', updateVisitedPark);
router.delete('/visited-parks/:parkCode', removeVisitedPark);

// Favorite-related routes (deprecated for visited functionality)
router.post('/favorites/:parkCode/visited', markFavoriteAsVisited);
router.get('/favorites/:parkCode/visited', checkParkVisited);

module.exports = router;
