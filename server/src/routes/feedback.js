const express = require('express');
const router = express.Router();
const {
  submitFeedback,
  getFeedbackAnalytics,
  getFeedbackPatterns,
  getPoorPerformingResponses,
  deleteFeedback
} = require('../controllers/feedbackController');
const { protect } = require('../middleware/auth');

// All feedback routes require authentication
router.use(protect);

// @route   POST /api/ai/feedback
// @desc    Submit feedback for AI response
// @access  Private
router.post('/', submitFeedback);

// @route   GET /api/ai/feedback/analytics
// @desc    Get feedback analytics for user
// @access  Private
router.get('/analytics', getFeedbackAnalytics);

// @route   GET /api/ai/feedback/patterns
// @desc    Get feedback patterns for AI learning
// @access  Private
router.get('/patterns', getFeedbackPatterns);

// @route   GET /api/ai/feedback/poor-performance
// @desc    Get poor performing responses for improvement
// @access  Private (Admin only)
router.get('/poor-performance', getPoorPerformingResponses);

// @route   DELETE /api/ai/feedback/:feedbackId
// @desc    Delete feedback
// @access  Private
router.delete('/:feedbackId', deleteFeedback);

module.exports = router;
