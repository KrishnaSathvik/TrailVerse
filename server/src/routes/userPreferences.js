const express = require('express');
const router = express.Router();
const userPreferencesController = require('../controllers/userPreferencesController');
const { protect } = require('../middleware/auth');

// All routes are protected
router.use(protect);

// Get user preferences
router.get('/', userPreferencesController.getPreferences);

// Update user preferences
router.put('/', userPreferencesController.updatePreferences);

// Update map state
router.put('/map-state', userPreferencesController.updateMapState);

// Update navigation state
router.put('/navigation', userPreferencesController.updateNavigation);

// Get active devices
router.get('/devices', userPreferencesController.getActiveDevices);

// Register device
router.post('/devices', userPreferencesController.registerDevice);

// Sync preferences across devices
router.post('/sync', userPreferencesController.syncPreferences);

module.exports = router;
