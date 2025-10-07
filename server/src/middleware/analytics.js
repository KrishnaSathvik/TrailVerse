const Analytics = require('../models/Analytics');
const { v4: uuidv4 } = require('uuid');

// Generate session ID if not exists
const generateSessionId = (req) => {
  if (!req.session?.sessionId) {
    req.session.sessionId = uuidv4();
  }
  return req.session.sessionId;
};

// Extract device info from user agent
const parseUserAgent = (userAgent) => {
  if (!userAgent) return {};

  // Simple device detection
  const isMobile = /Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  const isTablet = /iPad|Android(?=.*\bMobile\b)/i.test(userAgent);
  
  let deviceType = 'desktop';
  if (isTablet) deviceType = 'tablet';
  else if (isMobile) deviceType = 'mobile';

  // Browser detection
  let browserName = 'Unknown';
  if (userAgent.includes('Chrome')) browserName = 'Chrome';
  else if (userAgent.includes('Firefox')) browserName = 'Firefox';
  else if (userAgent.includes('Safari')) browserName = 'Safari';
  else if (userAgent.includes('Edge')) browserName = 'Edge';

  return {
    device: { type: deviceType },
    browser: { name: browserName },
    userAgent
  };
};

// Track analytics event
const trackEvent = async (req, eventType, eventCategory, metadata = {}) => {
  try {
    const sessionId = generateSessionId(req);
    const deviceInfo = parseUserAgent(req.get('User-Agent'));
    
    const analyticsData = {
      eventType,
      eventCategory,
      userId: req.user?.id || null,
      sessionId,
      userAgent: deviceInfo.userAgent,
      ipAddress: req.ip || req.connection.remoteAddress,
      referrer: req.get('Referer'),
      pageUrl: req.originalUrl,
      pageTitle: req.get('X-Page-Title') || null,
      metadata,
      ...deviceInfo,
      timestamp: new Date()
    };

    // Add specific fields based on event type
    if (req.params.parkCode) analyticsData.parkCode = req.params.parkCode;
    if (req.params.blogId) analyticsData.blogId = req.params.blogId;
    if (req.params.eventId) analyticsData.eventId = req.params.eventId;
    if (req.params.reviewId) analyticsData.reviewId = req.params.reviewId;

    // Save to database (async, don't wait)
    Analytics.create(analyticsData).catch(error => {
      console.error('Analytics tracking error:', error);
    });

  } catch (error) {
    console.error('Analytics middleware error:', error);
  }
};

// Middleware to track API calls
exports.trackApiCall = (req, res, next) => {
  const startTime = Date.now();
  
  // Track the API call
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    const eventCategory = req.user ? 'user' : 'anonymous';
    
    trackEvent(req, 'api_call', eventCategory, {
      method: req.method,
      endpoint: req.route?.path || req.originalUrl,
      statusCode: res.statusCode,
      responseTime,
      userAgent: req.get('User-Agent')
    });
  });
  
  next();
};

// Middleware to track page views
exports.trackPageView = (req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const eventCategory = req.user ? 'user' : 'anonymous';
    
    trackEvent(req, 'page_view', eventCategory, {
      duration,
      statusCode: res.statusCode
    });
  });
  
  next();
};

// Middleware to track user actions
exports.trackUserAction = (actionType, additionalMetadata = {}) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(); // Skip tracking for non-authenticated users
    }

    res.on('finish', () => {
      trackEvent(req, 'user_action', 'user', {
        actionType,
        ...additionalMetadata
      });
    });
    
    next();
  };
};

// Middleware to track errors
exports.trackError = (error, req, res, next) => {
  trackEvent(req, 'error', 'technical', {
    errorMessage: error.message,
    errorStack: error.stack,
    errorCode: error.code || 'UNKNOWN',
    statusCode: res.statusCode || 500
  });
  
  next(error);
};

// Middleware to track search events
exports.trackSearch = (req, res, next) => {
  if (req.query.search || req.body.search) {
    res.on('finish', () => {
      const searchTerm = req.query.search || req.body.search;
      const resultCount = res.locals.searchResults?.length || 0;
      
      trackEvent(req, 'search', req.user ? 'user' : 'anonymous', {
        searchTerm,
        resultCount,
        searchType: req.query.type || 'general'
      });
    });
  }
  
  next();
};

// Middleware to track content interactions
exports.trackContentInteraction = (contentType, interactionType) => {
  return (req, res, next) => {
    if (!req.user) {
      return next();
    }

    res.on('finish', () => {
      const metadata = {
        contentType,
        interactionType
      };

      // Add content-specific IDs
      if (req.params.parkCode) metadata.parkCode = req.params.parkCode;
      if (req.params.blogId) metadata.blogId = req.params.blogId;
      if (req.params.eventId) metadata.eventId = req.params.eventId;
      if (req.params.reviewId) metadata.reviewId = req.params.reviewId;

      trackEvent(req, 'user_action', 'engagement', metadata);
    });
    
    next();
  };
};

// Utility function to track custom events
exports.trackCustomEvent = (eventType, eventCategory, metadata = {}) => {
  return (req, res, next) => {
    res.on('finish', () => {
      trackEvent(req, eventType, eventCategory, metadata);
    });
    
    next();
  };
};

// Export the main tracking function for use in controllers
exports.trackEvent = trackEvent;
