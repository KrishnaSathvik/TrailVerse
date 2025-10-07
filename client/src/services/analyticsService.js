class AnalyticsService {
  constructor() {
    this.sessionId = this.getOrCreateSessionId();
    this.userId = null;
    this.isEnabled = true;
    this.queue = [];
    this.batchSize = 10;
    this.flushInterval = 30000; // 30 seconds
    this.endpoint = `${process.env.REACT_APP_API_URL || 'http://localhost:5001/api'}/analytics/track`;
    
    // Start periodic flush
    setInterval(() => this.flush(), this.flushInterval);
    
    // Flush on page unload
    window.addEventListener('beforeunload', () => this.flush(true));
  }

  // Session management
  getOrCreateSessionId() {
    let sessionId = localStorage.getItem('analytics_session_id');
    if (!sessionId) {
      sessionId = this.generateUUID();
      localStorage.setItem('analytics_session_id', sessionId);
    }
    return sessionId;
  }

  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  setUserId(userId) {
    this.userId = userId;
  }

  setEnabled(enabled) {
    this.isEnabled = enabled;
  }

  // Device and browser detection
  getDeviceInfo() {
    const userAgent = navigator.userAgent;
    
    // Device type detection
    const isMobile = /Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    const isTablet = /iPad|Android(?=.*\bMobile\b)/i.test(userAgent);
    
    let deviceType = 'desktop';
    if (isTablet) deviceType = 'tablet';
    else if (isMobile) deviceType = 'mobile';

    // Browser detection
    let browserName = 'Unknown';
    let browserVersion = 'Unknown';
    
    if (userAgent.includes('Chrome')) {
      browserName = 'Chrome';
      const match = userAgent.match(/Chrome\/(\d+)/);
      browserVersion = match ? match[1] : 'Unknown';
    } else if (userAgent.includes('Firefox')) {
      browserName = 'Firefox';
      const match = userAgent.match(/Firefox\/(\d+)/);
      browserVersion = match ? match[1] : 'Unknown';
    } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
      browserName = 'Safari';
      const match = userAgent.match(/Version\/(\d+)/);
      browserVersion = match ? match[1] : 'Unknown';
    } else if (userAgent.includes('Edge')) {
      browserName = 'Edge';
      const match = userAgent.match(/Edge\/(\d+)/);
      browserVersion = match ? match[1] : 'Unknown';
    }

    // OS detection
    let osName = 'Unknown';
    let osVersion = 'Unknown';
    
    if (userAgent.includes('Windows')) {
      osName = 'Windows';
      const match = userAgent.match(/Windows NT (\d+\.\d+)/);
      osVersion = match ? match[1] : 'Unknown';
    } else if (userAgent.includes('Mac OS')) {
      osName = 'macOS';
      const match = userAgent.match(/Mac OS X (\d+[._]\d+)/);
      osVersion = match ? match[1].replace('_', '.') : 'Unknown';
    } else if (userAgent.includes('Linux')) {
      osName = 'Linux';
    } else if (userAgent.includes('Android')) {
      osName = 'Android';
      const match = userAgent.match(/Android (\d+\.\d+)/);
      osVersion = match ? match[1] : 'Unknown';
    } else if (userAgent.includes('iOS') || userAgent.includes('iPhone') || userAgent.includes('iPad')) {
      osName = 'iOS';
      const match = userAgent.match(/OS (\d+[._]\d+)/);
      osVersion = match ? match[1].replace('_', '.') : 'Unknown';
    }

    return {
      device: {
        type: deviceType,
        userAgent
      },
      browser: {
        name: browserName,
        version: browserVersion
      },
      os: {
        name: osName,
        version: osVersion
      }
    };
  }

  // Get page information
  getPageInfo() {
    return {
      url: window.location.href,
      path: window.location.pathname,
      title: document.title,
      referrer: document.referrer,
      timestamp: new Date().toISOString()
    };
  }

  // Track event
  track(eventType, eventCategory, metadata = {}) {
    if (!this.isEnabled) return;

    const event = {
      eventType,
      eventCategory,
      userId: this.userId,
      sessionId: this.sessionId,
      ...this.getDeviceInfo(),
      ...this.getPageInfo(),
      metadata,
      timestamp: new Date().toISOString()
    };

    this.queue.push(event);

    // Flush if queue is full
    if (this.queue.length >= this.batchSize) {
      this.flush();
    }
  }

  // Flush events to server
  async flush(sync = false) {
    if (this.queue.length === 0) return;

    const events = [...this.queue];
    this.queue = [];

    const payload = {
      events,
      sessionId: this.sessionId,
      userId: this.userId
    };

    try {
      const token = localStorage.getItem('token');
      const headers = {
        'Content-Type': 'application/json'
      };

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      if (sync) {
        // Synchronous request for page unload
        navigator.sendBeacon(this.endpoint, JSON.stringify(payload));
      } else {
        // Asynchronous request
        await fetch(this.endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
      }
    } catch (error) {
      console.error('Analytics tracking error:', error);
      // Re-queue events on error
      this.queue.unshift(...events);
    }
  }

  // Specific tracking methods
  trackPageView(pageTitle = null) {
    this.track('page_view', 'user', {
      pageTitle: pageTitle || document.title
    });
  }

  trackUserAction(actionType, metadata = {}) {
    this.track('user_action', 'user', {
      actionType,
      ...metadata
    });
  }

  trackSearch(searchTerm, resultCount = 0, searchType = 'general') {
    this.track('search', 'user', {
      searchTerm,
      resultCount,
      searchType
    });
  }

  trackParkView(parkCode, parkName) {
    this.track('park_view', 'content', {
      parkCode,
      parkName
    });
  }

  trackParkSave(parkCode, parkName) {
    this.track('park_save', 'engagement', {
      parkCode,
      parkName
    });
  }

  trackBlogView(blogId, blogTitle) {
    this.track('blog_view', 'content', {
      blogId,
      blogTitle
    });
  }

  trackEventView(eventId, eventTitle) {
    this.track('event_view', 'content', {
      eventId,
      eventTitle
    });
  }

  trackEventRegister(eventId, eventTitle) {
    this.track('event_register', 'engagement', {
      eventId,
      eventTitle
    });
  }

  trackReviewCreate(parkCode, reviewId) {
    this.track('review_create', 'engagement', {
      parkCode,
      reviewId
    });
  }

  trackAIChat(conversationId, messageCount, provider = 'claude') {
    this.track('ai_chat', 'user', {
      conversationId,
      messageCount,
      provider
    });
  }

  trackImageUpload(imageCount, category = 'general') {
    this.track('image_upload', 'user', {
      imageCount,
      category
    });
  }

  trackError(errorMessage, errorCode = 'CLIENT_ERROR', stack = null) {
    this.track('error', 'technical', {
      errorMessage,
      errorCode,
      stack
    });
  }

  trackPerformance(metric, value, unit = 'ms') {
    this.track('performance', 'technical', {
      metric,
      value,
      unit
    });
  }

  // User lifecycle tracking
  trackUserSignup(userId) {
    this.setUserId(userId);
    this.track('user_signup', 'business', {
      userId
    });
  }

  trackUserLogin(userId) {
    this.setUserId(userId);
    this.track('user_login', 'business', {
      userId
    });
  }

  trackUserLogout() {
    this.track('user_logout', 'business', {
      userId: this.userId
    });
    this.userId = null;
  }

  // Performance monitoring
  trackPageLoadTime() {
    if (window.performance && window.performance.timing) {
      const timing = window.performance.timing;
      const loadTime = timing.loadEventEnd - timing.navigationStart;
      
      this.trackPerformance('page_load_time', loadTime);
    }
  }

  trackApiCall(endpoint, method, duration, statusCode) {
    this.track('api_call', 'technical', {
      endpoint,
      method,
      duration,
      statusCode
    });
  }

  // Custom event tracking
  trackCustomEvent(eventName, metadata = {}) {
    this.track('custom_event', 'user', {
      eventName,
      ...metadata
    });
  }

  // Utility methods
  getSessionId() {
    return this.sessionId;
  }

  getUserId() {
    return this.userId;
  }

  isTrackingEnabled() {
    return this.isEnabled;
  }

  // Privacy controls
  clearSession() {
    localStorage.removeItem('analytics_session_id');
    this.sessionId = this.getOrCreateSessionId();
    this.queue = [];
  }

  optOut() {
    this.setEnabled(false);
    localStorage.setItem('analytics_opt_out', 'true');
  }

  optIn() {
    this.setEnabled(true);
    localStorage.removeItem('analytics_opt_out');
  }

  // Initialize with privacy preferences
  initialize() {
    const optOut = localStorage.getItem('analytics_opt_out') === 'true';
    this.setEnabled(!optOut);
    
    // Track initial page view
    if (!optOut) {
      this.trackPageView();
    }
  }
}

// Create singleton instance
const analyticsService = new AnalyticsService();

export default analyticsService;
