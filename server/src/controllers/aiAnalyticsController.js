const Feedback = require('../models/Feedback');
const TripPlan = require('../models/TripPlan');
const aiLearningService = require('../services/aiLearningService');

// @desc    Get AI performance analytics
// @route   GET /api/ai/analytics
// @access  Private
exports.getAIAnalytics = async (req, res, next) => {
  try {
    const { timeframe = 'month', parkCode, aiProvider } = req.query;
    
    // Calculate date range
    const now = new Date();
    let dateFilter = {};
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
      case 'year':
        dateFilter = { timestamp: { $gte: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000) } };
        break;
    }

    // Build match criteria
    const matchCriteria = {
      ...dateFilter,
      ...(parkCode && { parkCode }),
      ...(aiProvider && { aiProvider })
    };

    // Get overall analytics
    const overallAnalytics = await Feedback.aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: null,
          totalInteractions: { $sum: 1 },
          positiveFeedback: { $sum: { $cond: [{ $eq: ['$feedback', 'up'] }, 1, 0] } },
          negativeFeedback: { $sum: { $cond: [{ $eq: ['$feedback', 'down'] }, 1, 0] } },
          averageResponseTime: { $avg: '$responseTime' },
          averageMessageLength: { $avg: '$messageLength' },
          satisfactionRate: {
            $avg: { $cond: [{ $eq: ['$feedback', 'up'] }, 1, 0] }
          }
        }
      }
    ]);

    // Get trends over time
    const trends = await Feedback.aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$timestamp' }
          },
          interactions: { $sum: 1 },
          positive: { $sum: { $cond: [{ $eq: ['$feedback', 'up'] }, 1, 0] } },
          negative: { $sum: { $cond: [{ $eq: ['$feedback', 'down'] }, 1, 0] } },
          avgResponseTime: { $avg: '$responseTime' }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    // Get park performance
    const parkPerformance = await Feedback.aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: '$parkCode',
          parkName: { $first: '$parkName' },
          interactions: { $sum: 1 },
          satisfactionRate: {
            $avg: { $cond: [{ $eq: ['$feedback', 'up'] }, 1, 0] }
          },
          avgResponseTime: { $avg: '$responseTime' }
        }
      },
      { $sort: { interactions: -1 } },
      { $limit: 20 }
    ]);

    // Get AI provider performance
    const providerPerformance = await Feedback.aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: '$aiProvider',
          interactions: { $sum: 1 },
          satisfactionRate: {
            $avg: { $cond: [{ $eq: ['$feedback', 'up'] }, 1, 0] }
          },
          avgResponseTime: { $avg: '$responseTime' },
          avgMessageLength: { $avg: '$messageLength' }
        }
      },
      { $sort: { interactions: -1 } }
    ]);

    // Get improvement insights
    const improvementInsights = await aiLearningService.getImprovementInsights(
      req.user._id || req.user.id,
      parkCode,
      aiProvider
    );

    res.status(200).json({
      success: true,
      data: {
        overall: overallAnalytics[0] || {
          totalInteractions: 0,
          positiveFeedback: 0,
          negativeFeedback: 0,
          averageResponseTime: 0,
          averageMessageLength: 0,
          satisfactionRate: 0
        },
        trends,
        parkPerformance,
        providerPerformance,
        improvementInsights,
        timeframe,
        generatedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Error getting AI analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get AI analytics'
    });
  }
};

// @desc    Get user-specific AI learning insights
// @route   GET /api/ai/learning-insights
// @access  Private
exports.getLearningInsights = async (req, res, next) => {
  try {
    const userId = req.user._id || req.user.id;
    
    // Get user's feedback patterns
    const feedbackPatterns = await Feedback.getFeedbackPatterns(userId, 100);
    
    // Get improvement insights
    const improvementInsights = await aiLearningService.getImprovementInsights(userId);
    
    // Get personalized recommendations
    const recommendations = await generatePersonalizedRecommendations(feedbackPatterns);

    res.status(200).json({
      success: true,
      data: {
        feedbackPatterns: feedbackPatterns.slice(0, 20), // Last 20 feedback items
        improvementInsights,
        recommendations,
        totalFeedback: feedbackPatterns.length,
        lastUpdated: new Date()
      }
    });

  } catch (error) {
    console.error('Error getting learning insights:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get learning insights'
    });
  }
};

// Helper function to generate personalized recommendations
async function generatePersonalizedRecommendations(feedbackPatterns) {
  const recommendations = [];
  
  if (feedbackPatterns.length < 5) {
    recommendations.push({
      type: 'data_collection',
      priority: 'high',
      message: 'Continue using the AI chat to help us learn your preferences and provide better responses.',
      action: 'Keep providing feedback on responses to improve personalization.'
    });
    return recommendations;
  }

  // Analyze patterns
  const positiveResponses = feedbackPatterns.filter(f => f.feedback === 'up');
  const negativeResponses = feedbackPatterns.filter(f => f.feedback === 'down');
  
  const satisfactionRate = positiveResponses.length / feedbackPatterns.length;

  if (satisfactionRate < 0.5) {
    recommendations.push({
      type: 'response_quality',
      priority: 'high',
      message: 'We notice you\'ve given negative feedback on several responses. We\'re working to improve.',
      action: 'Try being more specific in your questions to help the AI provide better answers.'
    });
  }

  // Check for specific improvement areas
  const parkFeedback = {};
  feedbackPatterns.forEach(f => {
    if (!parkFeedback[f.parkCode]) {
      parkFeedback[f.parkCode] = { positive: 0, negative: 0 };
    }
    parkFeedback[f.parkCode][f.feedback === 'up' ? 'positive' : 'negative']++;
  });

  Object.entries(parkFeedback).forEach(([parkCode, feedback]) => {
    const parkSatisfactionRate = feedback.positive / (feedback.positive + feedback.negative);
    if (parkSatisfactionRate < 0.3 && feedback.positive + feedback.negative > 3) {
      recommendations.push({
        type: 'park_specific',
        priority: 'medium',
        message: `We\'re working to improve responses for ${parkCode}.`,
        action: 'Consider asking more specific questions about this park.'
      });
    }
  });

  if (satisfactionRate > 0.8) {
    recommendations.push({
      type: 'positive_feedback',
      priority: 'low',
      message: 'Great! The AI responses are meeting your needs well.',
      action: 'Continue providing feedback to maintain high-quality responses.'
    });
  }

  return recommendations;
}

module.exports = {
  getAIAnalytics: exports.getAIAnalytics,
  getLearningInsights: exports.getLearningInsights
};
