const express = require('express');
const router = express.Router();
const { protect, optionalAuth } = require('../middleware/auth');
const { cacheMiddleware } = require('../middleware/cache');
const {
  getDailyFeed,
  getParkOfDay,
  getNatureFact,
  testAuth,
  testAIInsights,
  debugDailyFeed
} = require('../controllers/dailyFeedController');

// @route   GET /api/feed/daily
// @desc    Get personalized daily feed
// @access  Private (requires auth for personalization)
router.get('/daily', protect, getDailyFeed);

// @route   GET /api/feed/park-of-day
// @desc    Get park of the day (generic for anonymous, personalized for authenticated)
// @access  Public (optionalAuth)
router.get('/park-of-day', optionalAuth, cacheMiddleware(1440), getParkOfDay);

// @route   GET /api/feed/nature-fact
// @desc    Get daily nature fact
// @access  Public (optionalAuth)
router.get('/nature-fact', optionalAuth, cacheMiddleware(3600), getNatureFact);

// @route   GET /api/feed/test-auth
// @desc    Test authentication
// @access  Private
router.get('/test-auth', protect, testAuth);

// @route   GET /api/feed/test-ai
// @desc    Test AI insights generation
// @access  Private
router.get('/test-ai', protect, testAIInsights);

// @route   GET /api/feed/debug
// @desc    Debug daily feed data
// @access  Private
router.get('/debug', protect, debugDailyFeed);

module.exports = router;

