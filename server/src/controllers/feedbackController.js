const Feedback = require('../models/Feedback');
const TripPlan = require('../models/TripPlan');
const mongoose = require('mongoose');

// @desc    Submit feedback for AI response
// @route   POST /api/ai/feedback
// @access  Private
exports.submitFeedback = async (req, res, next) => {
  try {
    const {
      conversationId,
      messageId,
      feedback,
      userMessage,
      aiResponse,
      aiProvider,
      aiModel,
      parkCode,
      parkName,
      responseTime
    } = req.body;

    // Validation
    if (!messageId || !feedback || !userMessage || !aiResponse || !aiProvider) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: messageId, feedback, userMessage, aiResponse, aiProvider'
      });
    }

    if (!['up', 'down'].includes(feedback)) {
      return res.status(400).json({
        success: false,
        error: 'Feedback must be either "up" or "down"'
      });
    }

    // Verify conversation exists and belongs to user (only if conversationId is provided)
    let conversation = null;
    if (conversationId) {
      conversation = await TripPlan.findOne({
        _id: conversationId,
        userId: req.user._id || req.user.id
      });

      if (!conversation) {
        return res.status(404).json({
          success: false,
          error: 'Conversation not found or access denied'
        });
      }
    }

    // Check if feedback already exists for this message
    const existingFeedback = await Feedback.findOne({
      conversationId,
      messageId,
      userId: req.user._id || req.user.id
    });

    let feedbackRecord;
    if (existingFeedback) {
      // Update existing feedback
      existingFeedback.feedback = feedback;
      existingFeedback.responseTime = responseTime;
      existingFeedback.messageLength = aiResponse.length;
      feedbackRecord = await existingFeedback.save();
    } else {
      // Create new feedback
      feedbackRecord = await Feedback.create({
        conversationId,
        messageId,
        feedback,
        userId: req.user._id || req.user.id,
        userMessage,
        aiResponse,
        aiProvider,
        aiModel,
        parkCode,
        parkName,
        responseTime,
        messageLength: aiResponse.length
      });
    }

    // Update conversation with feedback info
    await TripPlan.findByIdAndUpdate(conversationId, {
      $set: {
        [`messages.${messageId}.feedback`]: feedback,
        [`messages.${messageId}.feedbackTimestamp`]: new Date()
      }
    });

    res.status(200).json({
      success: true,
      data: {
        feedback: feedbackRecord,
        message: existingFeedback ? 'Feedback updated successfully' : 'Feedback submitted successfully'
      }
    });

  } catch (error) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit feedback'
    });
  }
};

// @desc    Get feedback analytics for user
// @route   GET /api/ai/feedback/analytics
// @access  Private
exports.getFeedbackAnalytics = async (req, res, next) => {
  try {
    const { parkCode, aiProvider, timeframe } = req.query;
    
    let dateFilter = {};
    if (timeframe) {
      const now = new Date();
      switch (timeframe) {
        case 'day':
          dateFilter = { timestamp: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } };
          break;
        case 'week':
          dateFilter = { timestamp: { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } };
          break;
        case 'month':
          dateFilter = { timestamp: { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } };
          break;
      }
    }

    const analytics = await Feedback.getFeedbackAnalytics(
      req.user._id || req.user.id,
      parkCode,
      aiProvider
    );

    // Get feedback trends over time
    const trends = await Feedback.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(req.user._id || req.user.id),
          ...dateFilter,
          ...(parkCode && { parkCode }),
          ...(aiProvider && { aiProvider })
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$timestamp' }
          },
          positive: { $sum: { $cond: [{ $eq: ['$feedback', 'up'] }, 1, 0] } },
          negative: { $sum: { $cond: [{ $eq: ['$feedback', 'down'] }, 1, 0] } }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    // Get top performing parks
    const parkPerformance = await Feedback.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(req.user._id || req.user.id),
          ...dateFilter
        }
      },
      {
        $group: {
          _id: '$parkCode',
          parkName: { $first: '$parkName' },
          totalFeedback: { $sum: 1 },
          satisfactionRate: {
            $avg: { $cond: [{ $eq: ['$feedback', 'up'] }, 1, 0] }
          }
        }
      },
      { $sort: { satisfactionRate: -1 } },
      { $limit: 10 }
    ]);

    res.status(200).json({
      success: true,
      data: {
        analytics,
        trends,
        parkPerformance
      }
    });

  } catch (error) {
    console.error('Error getting feedback analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get feedback analytics'
    });
  }
};

// @desc    Get feedback patterns for AI learning
// @route   GET /api/ai/feedback/patterns
// @access  Private
exports.getFeedbackPatterns = async (req, res, next) => {
  try {
    const { limit = 50 } = req.query;
    
    const patterns = await Feedback.getFeedbackPatterns(
      req.user._id || req.user.id,
      parseInt(limit)
    );

    res.status(200).json({
      success: true,
      data: patterns
    });

  } catch (error) {
    console.error('Error getting feedback patterns:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get feedback patterns'
    });
  }
};

// @desc    Get poor performing responses for improvement
// @route   GET /api/ai/feedback/poor-performance
// @access  Private (Admin only)
exports.getPoorPerformingResponses = async (req, res, next) => {
  try {
    const { threshold = 0.3 } = req.query;
    
    const poorPerformance = await Feedback.getPoorPerformingResponses(
      parseFloat(threshold)
    );

    res.status(200).json({
      success: true,
      data: poorPerformance
    });

  } catch (error) {
    console.error('Error getting poor performing responses:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get poor performing responses'
    });
  }
};

// @desc    Delete feedback
// @route   DELETE /api/ai/feedback/:feedbackId
// @access  Private
exports.deleteFeedback = async (req, res, next) => {
  try {
    const { feedbackId } = req.params;

    const feedback = await Feedback.findOneAndDelete({
      _id: feedbackId,
      userId: req.user._id || req.user.id
    });

    if (!feedback) {
      return res.status(404).json({
        success: false,
        error: 'Feedback not found or access denied'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Feedback deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete feedback'
    });
  }
};
