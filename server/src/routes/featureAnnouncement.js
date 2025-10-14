const express = require('express');
const router = express.Router();
const featureAnnouncementController = require('../controllers/featureAnnouncementController');
const { protect, admin } = require('../middleware/auth');

// Preview feature announcement email (public)
router.get('/preview/:userId?', featureAnnouncementController.previewEmail);

// Get user statistics for feature announcement (admin only)
router.get('/stats', protect, admin, featureAnnouncementController.getUserStats);

// Send feature announcement to a single user (admin only)
router.post('/send/user/:userId', protect, admin, featureAnnouncementController.sendToUser);

// Send feature announcement to all users (admin only)
router.post('/send/all', protect, admin, featureAnnouncementController.sendToAllUsers);

// Send feature announcement to users by criteria (admin only)
router.post('/send/criteria', protect, admin, featureAnnouncementController.sendToUsersByCriteria);

module.exports = router;
