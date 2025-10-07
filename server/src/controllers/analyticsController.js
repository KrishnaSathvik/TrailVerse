const Analytics = require('../models/Analytics');
const User = require('../models/User');
const BlogPost = require('../models/BlogPost');
const Event = require('../models/Event');
const { protect, admin } = require('../middleware/auth');

// @desc    Get analytics dashboard data
// @route   GET /api/analytics/dashboard
// @access  Admin
exports.getDashboard = async (req, res, next) => {
  try {
    const { period = '7d' } = req.query;
    
    // Calculate date range
    const now = new Date();
    const startDate = new Date();
    
    switch (period) {
      case '24h':
        startDate.setDate(now.getDate() - 1);
        break;
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      default:
        startDate.setDate(now.getDate() - 7);
    }

    // Get various analytics in parallel
    const [
      eventCounts,
      userEngagement,
      popularParks,
      popularBlogs,
      popularEvents,
      searchAnalytics,
      errorAnalytics,
      deviceStats,
      locationStats
    ] = await Promise.all([
      Analytics.getEventCounts(startDate, now),
      Analytics.getUserEngagement(startDate, now),
      Analytics.getPopularContent(startDate, now, 'parks'),
      Analytics.getPopularContent(startDate, now, 'blogs'),
      Analytics.getPopularContent(startDate, now, 'events'),
      Analytics.getSearchAnalytics(startDate, now),
      Analytics.getErrorAnalytics(startDate, now),
      getDeviceStats(startDate, now),
      getLocationStats(startDate, now)
    ]);

    // Calculate growth metrics
    const previousStartDate = new Date(startDate.getTime() - (now.getTime() - startDate.getTime()));
    const [previousEventCounts, currentTotalEvents] = await Promise.all([
      Analytics.countDocuments({
        timestamp: { $gte: previousStartDate, $lt: startDate }
      }),
      Analytics.countDocuments({
        timestamp: { $gte: startDate, $lte: now }
      })
    ]);

    const growthRate = previousEventCounts > 0 
      ? ((currentTotalEvents - previousTotalEvents) / previousTotalEvents * 100).toFixed(2)
      : 0;

    res.status(200).json({
      success: true,
      data: {
        period,
        dateRange: { startDate, endDate: now },
        overview: {
          totalEvents: currentTotalEvents,
          growthRate: parseFloat(growthRate),
          uniqueUsers: userEngagement.length,
          averageEventsPerUser: userEngagement.length > 0 
            ? (currentTotalEvents / userEngagement.length).toFixed(2)
            : 0
        },
        eventCounts,
        userEngagement: userEngagement.slice(0, 20), // Top 20 users
        popularContent: {
          parks: popularParks.slice(0, 10),
          blogs: popularBlogs.slice(0, 10),
          events: popularEvents.slice(0, 10)
        },
        searchAnalytics: searchAnalytics.slice(0, 20),
        errorAnalytics: errorAnalytics.slice(0, 10),
        deviceStats,
        locationStats
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user analytics
// @route   GET /api/analytics/users
// @access  Admin
exports.getUserAnalytics = async (req, res, next) => {
  try {
    const { period = '30d', page = 1, limit = 50 } = req.query;
    
    // Calculate date range
    const now = new Date();
    const startDate = new Date();
    startDate.setDate(now.getDate() - parseInt(period.replace('d', '')));

    const skip = (page - 1) * limit;

    // Get user engagement data
    const userEngagement = await Analytics.getUserEngagement(startDate, now);
    
    // Get user details for top users
    const topUsers = userEngagement.slice(skip, skip + parseInt(limit));
    const userIds = topUsers.map(user => user.userId).filter(id => id);
    
    const users = await User.find({ _id: { $in: userIds } })
      .select('name email createdAt role')
      .lean();

    // Map user details to engagement data
    const enrichedData = topUsers.map(engagement => {
      const user = users.find(u => u._id.toString() === engagement.userId?.toString());
      return {
        ...engagement,
        user: user || null
      };
    });

    // Get user registration trends
    const registrationTrends = await Analytics.aggregate([
      {
        $match: {
          eventType: 'user_signup',
          timestamp: { $gte: startDate, $lte: now }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$timestamp' },
            month: { $month: '$timestamp' },
            day: { $dayOfMonth: '$timestamp' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        period,
        users: enrichedData,
        totalUsers: userEngagement.length,
        page: parseInt(page),
        pages: Math.ceil(userEngagement.length / limit),
        registrationTrends
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get content analytics
// @route   GET /api/analytics/content
// @access  Admin
exports.getContentAnalytics = async (req, res, next) => {
  try {
    const { period = '30d', contentType = 'all' } = req.query;
    
    // Calculate date range
    const now = new Date();
    const startDate = new Date();
    startDate.setDate(now.getDate() - parseInt(period.replace('d', '')));

    const contentData = {};

    if (contentType === 'all' || contentType === 'parks') {
      const popularParks = await Analytics.getPopularContent(startDate, now, 'parks');
      contentData.parks = popularParks;
    }

    if (contentType === 'all' || contentType === 'blogs') {
      const popularBlogs = await Analytics.getPopularContent(startDate, now, 'blogs');
      // Enrich with blog details
      const blogIds = popularBlogs.map(blog => blog.contentId).filter(id => id);
      const blogs = await BlogPost.find({ _id: { $in: blogIds } })
        .select('title slug views category publishedAt')
        .lean();
      
      contentData.blogs = popularBlogs.map(blog => {
        const blogDetails = blogs.find(b => b._id.toString() === blog.contentId?.toString());
        return {
          ...blog,
          details: blogDetails || null
        };
      });
    }

    if (contentType === 'all' || contentType === 'events') {
      const popularEvents = await Analytics.getPopularContent(startDate, now, 'events');
      contentData.events = popularEvents;
    }

    // Get content creation trends
    const creationTrends = await Analytics.aggregate([
      {
        $match: {
          eventType: { $in: ['blog_create', 'event_create', 'review_create'] },
          timestamp: { $gte: startDate, $lte: now }
        }
      },
      {
        $group: {
          _id: {
            eventType: '$eventType',
            date: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$timestamp'
              }
            }
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.date',
          events: {
            $push: {
              type: '$_id.eventType',
              count: '$count'
            }
          }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        period,
        contentType,
        content: contentData,
        creationTrends
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get search analytics
// @route   GET /api/analytics/search
// @access  Admin
exports.getSearchAnalytics = async (req, res, next) => {
  try {
    const { period = '30d', limit = 50 } = req.query;
    
    // Calculate date range
    const now = new Date();
    const startDate = new Date();
    startDate.setDate(now.getDate() - parseInt(period.replace('d', '')));

    const searchAnalytics = await Analytics.getSearchAnalytics(startDate, now);
    
    // Get search trends over time
    const searchTrends = await Analytics.aggregate([
      {
        $match: {
          eventType: 'search',
          timestamp: { $gte: startDate, $lte: now },
          'metadata.searchTerm': { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$timestamp'
              }
            }
          },
          count: { $sum: 1 },
          uniqueTerms: { $addToSet: '$metadata.searchTerm' }
        }
      },
      {
        $project: {
          date: '$_id.date',
          totalSearches: '$count',
          uniqueTerms: { $size: '$uniqueTerms' }
        }
      },
      { $sort: { date: 1 } }
    ]);

    // Get no-result searches
    const noResultSearches = await Analytics.aggregate([
      {
        $match: {
          eventType: 'search',
          timestamp: { $gte: startDate, $lte: now },
          'metadata.resultCount': 0
        }
      },
      {
        $group: {
          _id: '$metadata.searchTerm',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);

    res.status(200).json({
      success: true,
      data: {
        period,
        topSearches: searchAnalytics.slice(0, parseInt(limit)),
        searchTrends,
        noResultSearches
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get error analytics
// @route   GET /api/analytics/errors
// @access  Admin
exports.getErrorAnalytics = async (req, res, next) => {
  try {
    const { period = '7d' } = req.query;
    
    // Calculate date range
    const now = new Date();
    const startDate = new Date();
    startDate.setDate(now.getDate() - parseInt(period.replace('d', '')));

    const errorAnalytics = await Analytics.getErrorAnalytics(startDate, now);
    
    // Get error trends over time
    const errorTrends = await Analytics.aggregate([
      {
        $match: {
          eventType: 'error',
          timestamp: { $gte: startDate, $lte: now }
        }
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$timestamp'
              }
            }
          },
          count: { $sum: 1 },
          uniqueErrors: { $addToSet: '$errorCode' }
        }
      },
      {
        $project: {
          date: '$_id.date',
          totalErrors: '$count',
          uniqueErrorTypes: { $size: '$uniqueErrors' }
        }
      },
      { $sort: { date: 1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        period,
        errors: errorAnalytics,
        errorTrends
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get performance analytics
// @route   GET /api/analytics/performance
// @access  Admin
exports.getPerformanceAnalytics = async (req, res, next) => {
  try {
    const { period = '24h' } = req.query;
    
    // Calculate date range
    const now = new Date();
    const startDate = new Date();
    startDate.setDate(now.getDate() - parseInt(period.replace('h', '')));

    // Get API performance metrics
    const apiPerformance = await Analytics.aggregate([
      {
        $match: {
          eventType: 'api_call',
          timestamp: { $gte: startDate, $lte: now },
          responseTime: { $exists: true }
        }
      },
      {
        $group: {
          _id: '$metadata.endpoint',
          count: { $sum: 1 },
          avgResponseTime: { $avg: '$responseTime' },
          minResponseTime: { $min: '$responseTime' },
          maxResponseTime: { $max: '$responseTime' },
          p95ResponseTime: {
            $percentile: {
              input: '$responseTime',
              p: [0.95],
              method: 'approximate'
            }
          }
        }
      },
      { $sort: { avgResponseTime: -1 } }
    ]);

    // Get page load performance
    const pagePerformance = await Analytics.aggregate([
      {
        $match: {
          eventType: 'page_view',
          timestamp: { $gte: startDate, $lte: now },
          duration: { $exists: true }
        }
      },
      {
        $group: {
          _id: '$pageUrl',
          count: { $sum: 1 },
          avgLoadTime: { $avg: '$duration' },
          slowPages: {
            $sum: {
              $cond: [{ $gt: ['$duration', 3000] }, 1, 0]
            }
          }
        }
      },
      {
        $project: {
          page: '$_id',
          views: '$count',
          avgLoadTime: { $round: ['$avgLoadTime', 2] },
          slowPages: 1,
          slowPagePercentage: {
            $round: [
              { $multiply: [{ $divide: ['$slowPages', '$count'] }, 100] },
              2
            ]
          }
        }
      },
      { $sort: { avgLoadTime: -1 } },
      { $limit: 20 }
    ]);

    res.status(200).json({
      success: true,
      data: {
        period,
        apiPerformance,
        pagePerformance
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Track analytics events from client
// @route   POST /api/analytics/track
// @access  Public
exports.trackEvents = async (req, res, next) => {
  try {
    const { events, sessionId, userId } = req.body;

    if (!events || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Events array is required'
      });
    }

    // Process events in batch
    const analyticsData = events.map(event => ({
      ...event,
      sessionId: event.sessionId || sessionId,
      userId: event.userId || userId,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      timestamp: new Date(event.timestamp || Date.now())
    }));

    // Save to database
    await Analytics.insertMany(analyticsData, { ordered: false });

    res.status(200).json({
      success: true,
      message: 'Events tracked successfully'
    });
  } catch (error) {
    // Don't fail the request if analytics tracking fails
    console.error('Analytics tracking error:', error);
    res.status(200).json({
      success: true,
      message: 'Events processed'
    });
  }
};

// Helper functions
async function getDeviceStats(startDate, endDate) {
  return Analytics.aggregate([
    {
      $match: {
        timestamp: { $gte: startDate, $lte: endDate },
        'device.type': { $exists: true }
      }
    },
    {
      $group: {
        _id: '$device.type',
        count: { $sum: 1 },
        browsers: { $addToSet: '$browser.name' }
      }
    },
    {
      $project: {
        deviceType: '$_id',
        count: 1,
        browsers: { $size: '$browsers' }
      }
    },
    { $sort: { count: -1 } }
  ]);
}

async function getLocationStats(startDate, endDate) {
  return Analytics.aggregate([
    {
      $match: {
        timestamp: { $gte: startDate, $lte: endDate },
        'location.country': { $exists: true }
      }
    },
    {
      $group: {
        _id: '$location.country',
        count: { $sum: 1 },
        regions: { $addToSet: '$location.region' }
      }
    },
    {
      $project: {
        country: '$_id',
        count: 1,
        regions: { $size: '$regions' }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 20 }
  ]);
}
