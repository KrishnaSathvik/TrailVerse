const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { cacheMiddleware } = require('../middleware/cache');
const {
  getDailyFeed,
  getParkOfDay,
  getNatureFact,
  testAuth,
  testAIInsights
} = require('../controllers/dailyFeedController');

// All routes are protected (require authentication)
router.use(protect);

// @route   GET /api/feed/daily
// @desc    Get personalized daily feed
// @access  Private
router.get('/daily', cacheMiddleware(300), getDailyFeed); // 5 minutes cache

// @route   GET /api/feed/park-of-day
// @desc    Get park of the day
// @access  Private
router.get('/park-of-day', cacheMiddleware(1440), getParkOfDay); // 24 hours cache

// @route   GET /api/feed/nature-fact
// @desc    Get daily nature fact
// @access  Private
router.get('/nature-fact', cacheMiddleware(3600), getNatureFact); // 1 hour cache


// @route   GET /api/feed/test-auth
// @desc    Test authentication
// @access  Private
router.get('/test-auth', testAuth);


// @route   GET /api/feed/test-ai
// @desc    Test AI insights generation
// @access  Private
router.get('/test-ai', testAIInsights);

module.exports = router;
