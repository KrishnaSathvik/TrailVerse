const express = require('express');
const router = express.Router();
const {
  getDashboard,
  getUserAnalytics,
  getContentAnalytics,
  getSearchAnalytics,
  getErrorAnalytics,
  getPerformanceAnalytics,
  trackEvents
} = require('../controllers/analyticsController');
const { protect, admin } = require('../middleware/auth');

// Analytics tracking endpoint (no auth required for client-side tracking)
router.post('/track', trackEvents);

// All other routes are admin only
router.use(protect, admin);

// Analytics routes
router.get('/dashboard', getDashboard);
router.get('/users', getUserAnalytics);
router.get('/content', getContentAnalytics);
router.get('/search', getSearchAnalytics);
router.get('/errors', getErrorAnalytics);
router.get('/performance', getPerformanceAnalytics);

module.exports = router;
