const mongoose = require('mongoose');
const {
  ANALYTICS_RETENTION_SECONDS,
  API_CALL_RETENTION_SECONDS,
  NON_API_CALL_EVENT_TYPES,
} = require('../config/analyticsRetention');
const { humanTrafficFilter } = require('../utils/botClassifier');

const analyticsSchema = new mongoose.Schema({
  eventType: {
    type: String,
    required: true,
    enum: [
      'page_view', 'user_action', 'api_call', 'search', 'download',
      'park_view', 'park_save', 'park_visit', 'review_create', 'review_helpful',
      'blog_view', 'blog_share', 'event_register', 'event_view',
      'ai_chat', 'conversation_create', 'image_upload', 'user_signup',
      'user_login', 'user_logout', 'error', 'performance', 'mcp_tool_call',
      'crowd_calendar_view',
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
  browserId: {
    type: String,
    default: null
  },
  userType: {
    type: String,
    enum: ['anonymous', 'authenticated'],
    default: 'anonymous'
  },
  isBot: {
    type: Boolean,
    default: false
  },
  source: {
    type: String,
    default: null
  },
  ctaId: {
    type: String,
    default: null
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
  }
}, {
  timestamps: true,
  // Index changes are an explicit migration, never an application-start side effect.
  autoIndex: false
});

// Keep a small index set — admin/dashboard queries almost always filter by
// eventType + timestamp (or timestamp alone). Extra single-field indexes were
// bloating Atlas Free storage (~160MB) without being used in $match stages.
analyticsSchema.index({ eventType: 1, timestamp: -1 });
analyticsSchema.index({ timestamp: -1 });
// api_call rows expire after 7 days; other event types use ANALYTICS_RETENTION_DAYS.
analyticsSchema.index(
  { timestamp: 1 },
  {
    expireAfterSeconds: API_CALL_RETENTION_SECONDS,
    name: 'analytics_api_call_ttl',
    partialFilterExpression: { eventType: 'api_call' },
  }
);
analyticsSchema.index(
  { timestamp: 1 },
  {
    expireAfterSeconds: ANALYTICS_RETENTION_SECONDS,
    name: 'analytics_general_ttl',
    partialFilterExpression: { eventType: { $in: NON_API_CALL_EVENT_TYPES } },
  }
);

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
    timestamp: { $gte: startDate, $lte: endDate },
    ...humanTrafficFilter(),
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
    eventType: { $in: ['page_view', 'park_view', 'blog_view', 'event_view'] },
    ...humanTrafficFilter(),
  };

  if (contentType === 'parks') {
    matchStage.$or = [
      { parkCode: { $exists: true, $ne: null } },
      { 'metadata.parkCode': { $exists: true, $ne: null } },
    ];
  } else if (contentType === 'blogs') {
    matchStage.blogId = { $exists: true, $ne: null };
  } else if (contentType === 'events') {
    matchStage.eventId = { $exists: true, $ne: null };
  }

  return this.aggregate([
    { $match: matchStage },
    {
      $addFields: {
        contentKey: contentType === 'parks'
          ? { $ifNull: ['$parkCode', '$metadata.parkCode'] }
          : contentType === 'blogs'
            ? { $ifNull: ['$blogId', '$metadata.blogId'] }
            : { $ifNull: ['$eventId', '$metadata.eventId'] },
      },
    },
    { $match: { contentKey: { $ne: null } } },
    {
      $group: {
        _id: '$contentKey',
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
        'metadata.searchTerm': { $exists: true, $ne: null },
        ...humanTrafficFilter(),
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
      $addFields: {
        resolvedErrorCode: { $ifNull: ['$errorCode', '$metadata.errorCode'] },
        resolvedErrorMessage: { $ifNull: ['$errorMessage', '$metadata.errorMessage'] },
      },
    },
    {
      $match: {
        resolvedErrorCode: { $ne: null },
      },
    },
    {
      $group: {
        _id: {
          errorCode: '$resolvedErrorCode',
          errorMessage: '$resolvedErrorMessage'
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
