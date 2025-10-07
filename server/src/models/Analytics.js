const mongoose = require('mongoose');

const analyticsSchema = new mongoose.Schema({
  eventType: {
    type: String,
    required: true,
    enum: [
      'page_view', 'user_action', 'api_call', 'search', 'download',
      'park_view', 'park_save', 'park_visit', 'review_create', 'review_helpful',
      'blog_view', 'blog_share', 'event_register', 'event_view',
      'ai_chat', 'conversation_create', 'image_upload', 'user_signup',
      'user_login', 'user_logout', 'error', 'performance'
    ]
  },
  eventCategory: {
    type: String,
    required: true,
    enum: ['user', 'content', 'engagement', 'technical', 'business']
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  sessionId: {
    type: String,
    required: true
  },
  userAgent: {
    type: String,
    default: null
  },
  ipAddress: {
    type: String,
    default: null
  },
  referrer: {
    type: String,
    default: null
  },
  pageUrl: {
    type: String,
    default: null
  },
  pageTitle: {
    type: String,
    default: null
  },
  metadata: {
    // Flexible object for event-specific data
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Common fields for different event types
  parkCode: {
    type: String,
    default: null
  },
  blogId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BlogPost',
    default: null
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    default: null
  },
  reviewId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Review',
    default: null
  },
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    default: null
  },
  // Performance metrics
  duration: {
    type: Number, // in milliseconds
    default: null
  },
  responseTime: {
    type: Number, // in milliseconds
    default: null
  },
  // Error tracking
  errorMessage: {
    type: String,
    default: null
  },
  errorStack: {
    type: String,
    default: null
  },
  errorCode: {
    type: String,
    default: null
  },
  // Device and browser info
  device: {
    type: {
      type: String,
      enum: ['desktop', 'mobile', 'tablet'],
      default: null
    },
    brand: String,
    model: String
  },
  browser: {
    name: String,
    version: String
  },
  os: {
    name: String,
    version: String
  },
  // Geographic data
  location: {
    country: String,
    region: String,
    city: String,
    latitude: Number,
    longitude: Number
  },
  // Timestamp
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Add indexes for efficient querying
analyticsSchema.index({ eventType: 1, timestamp: -1 });
analyticsSchema.index({ eventCategory: 1, timestamp: -1 });
analyticsSchema.index({ userId: 1, timestamp: -1 });
analyticsSchema.index({ sessionId: 1, timestamp: -1 });
analyticsSchema.index({ parkCode: 1, timestamp: -1 });
analyticsSchema.index({ blogId: 1, timestamp: -1 });
analyticsSchema.index({ eventId: 1, timestamp: -1 });
analyticsSchema.index({ 'metadata.searchTerm': 1, timestamp: -1 });
analyticsSchema.index({ 'location.country': 1, timestamp: -1 });
analyticsSchema.index({ 'device.type': 1, timestamp: -1 });
analyticsSchema.index({ timestamp: -1 }); // For time-based queries

// Compound indexes for common queries
analyticsSchema.index({ eventType: 1, eventCategory: 1, timestamp: -1 });
analyticsSchema.index({ userId: 1, eventType: 1, timestamp: -1 });

// Text index for searching metadata
analyticsSchema.index({
  'metadata.searchTerm': 'text',
  'metadata.query': 'text',
  'errorMessage': 'text'
});

// Static methods for analytics queries
analyticsSchema.statics.getEventCounts = function(startDate, endDate, filters = {}) {
  const matchStage = {
    timestamp: {
      $gte: startDate,
      $lte: endDate
    },
    ...filters
  };

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$eventType',
        count: { $sum: 1 },
        uniqueUsers: { $addToSet: '$userId' }
      }
    },
    {
      $project: {
        eventType: '$_id',
        count: 1,
        uniqueUsers: { $size: '$uniqueUsers' }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

analyticsSchema.statics.getUserEngagement = function(startDate, endDate, userId = null) {
  const matchStage = {
    timestamp: { $gte: startDate, $lte: endDate }
  };

  if (userId) {
    matchStage.userId = userId;
  }

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$userId',
        totalEvents: { $sum: 1 },
        uniqueSessions: { $addToSet: '$sessionId' },
        eventTypes: { $addToSet: '$eventType' },
        lastActivity: { $max: '$timestamp' },
        firstActivity: { $min: '$timestamp' }
      }
    },
    {
      $project: {
        userId: '$_id',
        totalEvents: 1,
        uniqueSessions: { $size: '$uniqueSessions' },
        eventTypes: { $size: '$eventTypes' },
        lastActivity: 1,
        firstActivity: 1,
        sessionDuration: {
          $divide: [
            { $subtract: ['$lastActivity', '$firstActivity'] },
            1000 * 60 * 60 // Convert to hours
          ]
        }
      }
    },
    { $sort: { totalEvents: -1 } }
  ]);
};

analyticsSchema.statics.getPopularContent = function(startDate, endDate, contentType) {
  const matchStage = {
    timestamp: { $gte: startDate, $lte: endDate },
    eventType: { $in: ['page_view', 'park_view', 'blog_view', 'event_view'] }
  };

  if (contentType === 'parks') {
    matchStage.parkCode = { $exists: true, $ne: null };
  } else if (contentType === 'blogs') {
    matchStage.blogId = { $exists: true, $ne: null };
  } else if (contentType === 'events') {
    matchStage.eventId = { $exists: true, $ne: null };
  }

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: contentType === 'parks' ? '$parkCode' : 
             contentType === 'blogs' ? '$blogId' : '$eventId',
        views: { $sum: 1 },
        uniqueUsers: { $addToSet: '$userId' }
      }
    },
    {
      $project: {
        contentId: '$_id',
        views: 1,
        uniqueUsers: { $size: '$uniqueUsers' }
      }
    },
    { $sort: { views: -1 } },
    { $limit: 50 }
  ]);
};

analyticsSchema.statics.getSearchAnalytics = function(startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        timestamp: { $gte: startDate, $lte: endDate },
        eventType: 'search',
        'metadata.searchTerm': { $exists: true, $ne: null }
      }
    },
    {
      $group: {
        _id: '$metadata.searchTerm',
        count: { $sum: 1 },
        uniqueUsers: { $addToSet: '$userId' },
        avgResults: { $avg: '$metadata.resultCount' }
      }
    },
    {
      $project: {
        searchTerm: '$_id',
        count: 1,
        uniqueUsers: { $size: '$uniqueUsers' },
        avgResults: { $round: ['$avgResults', 0] }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 100 }
  ]);
};

analyticsSchema.statics.getErrorAnalytics = function(startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        timestamp: { $gte: startDate, $lte: endDate },
        eventType: 'error'
      }
    },
    {
      $group: {
        _id: {
          errorCode: '$errorCode',
          errorMessage: '$errorMessage'
        },
        count: { $sum: 1 },
        uniqueUsers: { $addToSet: '$userId' },
        lastOccurrence: { $max: '$timestamp' }
      }
    },
    {
      $project: {
        errorCode: '$_id.errorCode',
        errorMessage: '$_id.errorMessage',
        count: 1,
        uniqueUsers: { $size: '$uniqueUsers' },
        lastOccurrence: 1
      }
    },
    { $sort: { count: -1 } }
  ]);
};

module.exports = mongoose.model('Analytics', analyticsSchema);
