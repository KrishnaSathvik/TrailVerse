const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TripPlan',
    required: false, // Made optional to support feedback for unsaved conversations
    index: true
  },
  messageId: {
    type: String,
    required: true,
    index: true
  },
  feedback: {
    type: String,
    enum: ['up', 'down'],
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  userMessage: {
    type: String,
    required: true
  },
  aiResponse: {
    type: String,
    required: true
  },
  aiProvider: {
    type: String,
    enum: ['openai', 'claude'],
    required: true
  },
  aiModel: {
    type: String,
    required: false
  },
  parkCode: {
    type: String,
    required: false,
    index: true
  },
  parkName: {
    type: String,
    required: false
  },
  responseTime: {
    type: Number, // in milliseconds
    required: false
  },
  messageLength: {
    type: Number, // AI response length in characters
    required: false
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Compound indexes for efficient querying
feedbackSchema.index({ userId: 1, timestamp: -1 });
feedbackSchema.index({ conversationId: 1, feedback: 1 });
feedbackSchema.index({ parkCode: 1, feedback: 1 });
feedbackSchema.index({ aiProvider: 1, feedback: 1 });

// Virtual for feedback analytics
feedbackSchema.virtual('isPositive').get(function() {
  return this.feedback === 'up';
});

// Static method to get feedback analytics
feedbackSchema.statics.getFeedbackAnalytics = async function(userId = null, parkCode = null, aiProvider = null) {
  const matchStage = {};
  if (userId) matchStage.userId = new mongoose.Types.ObjectId(userId);
  if (parkCode) matchStage.parkCode = parkCode;
  if (aiProvider) matchStage.aiProvider = aiProvider;

  const analytics = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalFeedback: { $sum: 1 },
        positiveFeedback: {
          $sum: { $cond: [{ $eq: ['$feedback', 'up'] }, 1, 0] }
        },
        negativeFeedback: {
          $sum: { $cond: [{ $eq: ['$feedback', 'down'] }, 1, 0] }
        },
        averageResponseTime: { $avg: '$responseTime' },
        averageMessageLength: { $avg: '$messageLength' },
        satisfactionRate: {
          $avg: { $cond: [{ $eq: ['$feedback', 'up'] }, 1, 0] }
        }
      }
    }
  ]);

  return analytics[0] || {
    totalFeedback: 0,
    positiveFeedback: 0,
    negativeFeedback: 0,
    averageResponseTime: 0,
    averageMessageLength: 0,
    satisfactionRate: 0
  };
};

// Static method to get feedback patterns for AI learning
feedbackSchema.statics.getFeedbackPatterns = async function(userId = null, limit = 100) {
  const matchStage = {};
  if (userId) matchStage.userId = new mongoose.Types.ObjectId(userId);

  return await this.find(matchStage)
    .sort({ timestamp: -1 })
    .limit(limit)
    .populate('conversationId', 'parkName parkCode')
    .select('feedback userMessage aiResponse aiProvider parkCode timestamp');
};

// Static method to get poor performing responses
feedbackSchema.statics.getPoorPerformingResponses = async function(threshold = 0.3) {
  const analytics = await this.aggregate([
    {
      $group: {
        _id: {
          aiProvider: '$aiProvider',
          parkCode: '$parkCode'
        },
        totalFeedback: { $sum: 1 },
        negativeFeedback: {
          $sum: { $cond: [{ $eq: ['$feedback', 'down'] }, 1, 0] }
        },
        satisfactionRate: {
          $avg: { $cond: [{ $eq: ['$feedback', 'up'] }, 1, 0] }
        }
      }
    },
    {
      $match: {
        totalFeedback: { $gte: 5 }, // Only consider contexts with at least 5 feedback items
        satisfactionRate: { $lt: threshold }
      }
    },
    {
      $sort: { satisfactionRate: 1 }
    }
  ]);

  return analytics;
};

module.exports = mongoose.model('Feedback', feedbackSchema);
