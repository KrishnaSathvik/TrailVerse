import ReactGA from 'react-ga4';

const TRACKING_ID = import.meta.env.VITE_GA_TRACKING_ID;

export const initGA = () => {
  if (TRACKING_ID) {
    ReactGA.initialize(TRACKING_ID, {
      gaOptions: {
        siteSpeedSampleRate: 100
      }
    });
    console.log('✅ Google Analytics initialized');
  } else {
    console.warn('⚠️ Google Analytics tracking ID not found. Set REACT_APP_GA_TRACKING_ID in your environment variables.');
  }
};

export const logPageView = () => {
  const page = window.location.pathname + window.location.search;
  ReactGA.send({ 
    hitType: 'pageview', 
    page 
  });
  
  // Also send to gtag for GA4 compatibility
  if (window.gtag) {
    window.gtag('event', 'page_view', {
      page_title: document.title,
      page_location: window.location.href,
      page_path: page
    });
  }
};

export const trackPageView = (path) => {
  ReactGA.send({ hitType: 'pageview', page: path });
  
  // Also send to gtag for GA4 compatibility
  if (window.gtag) {
    window.gtag('event', 'page_view', {
      page_title: document.title,
      page_location: window.location.href,
      page_path: path
    });
  }
};

export const logEvent = (category, action, label) => {
  ReactGA.event({
    category,
    action,
    label
  });
  
  // Also send to gtag for GA4 compatibility
  if (window.gtag) {
    window.gtag('event', action, {
      event_category: category,
      event_label: label
    });
  }
};

export const trackEvent = (category, action, label) => {
  ReactGA.event({ category, action, label });
  
  // Also send to gtag for GA4 compatibility
  if (window.gtag) {
    window.gtag('event', action, {
      event_category: category,
      event_label: label
    });
  }
};

// Enhanced custom events with detailed tracking
export const logParkView = (parkCode, parkName, source = 'unknown') => {
  ReactGA.event({
    category: 'Park',
    action: 'View',
    label: parkName,
    custom_parameters: {
      park_code: parkCode,
      source, // 'search', 'map', 'recommendation', 'direct'
      user_type: localStorage.getItem('user') ? 'authenticated' : 'anonymous'
    }
  });
};

export const logSearch = (searchQuery, resultCount = 0, searchType = 'general') => {
  ReactGA.event({
    category: 'Search',
    action: 'Query',
    label: searchQuery,
    value: resultCount,
    custom_parameters: {
      search_type: searchType, // 'parks', 'events', 'blogs'
      query_length: searchQuery.length,
      has_results: resultCount > 0
    }
  });
};

export const logShare = (platform, content, contentType = 'unknown') => {
  ReactGA.event({
    category: 'Share',
    action: platform,
    label: content,
    custom_parameters: {
      content_type: contentType, // 'park', 'blog', 'event'
      platform
    }
  });
};

export const logAIChat = (message, responseTime = 0, success = true) => {
  ReactGA.event({
    category: 'AI',
    action: 'Chat',
    label: message.substring(0, 50), // Truncate for privacy
    value: responseTime,
    custom_parameters: {
      message_length: message.length,
      response_time: responseTime,
      success
    }
  });
};

export const logBlogView = (blogTitle, blogId, category = 'unknown') => {
  ReactGA.event({
    category: 'Blog',
    action: 'View',
    label: blogTitle,
    custom_parameters: {
      blog_id: blogId,
      category,
      user_type: localStorage.getItem('user') ? 'authenticated' : 'anonymous'
    }
  });
};

export const logEventView = (eventTitle, eventId, parkCode = 'unknown') => {
  ReactGA.event({
    category: 'Event',
    action: 'View',
    label: eventTitle,
    custom_parameters: {
      event_id: eventId,
      park_code: parkCode,
      user_type: localStorage.getItem('user') ? 'authenticated' : 'anonymous'
    }
  });
};

export const logUserAction = (action, details, userId = null) => {
  ReactGA.event({
    category: 'User',
    action,
    label: details,
    custom_parameters: {
      user_id: userId,
      timestamp: Date.now(),
      user_type: localStorage.getItem('user') ? 'authenticated' : 'anonymous'
    }
  });
};

// New enhanced tracking functions
export const logWeatherWidgetUsage = (parkCode, weatherLoaded = true, errorType = null) => {
  ReactGA.event({
    category: 'Weather',
    action: 'Widget_Usage',
    label: parkCode,
    custom_parameters: {
      park_code: parkCode,
      weather_loaded: weatherLoaded,
      error_type: errorType,
      user_type: localStorage.getItem('user') ? 'authenticated' : 'anonymous'
    }
  });
};

export const logCachingPerformance = (cacheType, hitRate, responseTime) => {
  ReactGA.event({
    category: 'Performance',
    action: 'Cache_Performance',
    label: cacheType,
    value: responseTime,
    custom_parameters: {
      cache_type: cacheType,
      hit_rate: hitRate,
      response_time: responseTime
    }
  });
};

export const logPagePerformance = (pageName, loadTime, userAgent) => {
  ReactGA.event({
    category: 'Performance',
    action: 'Page_Load',
    label: pageName,
    value: loadTime,
    custom_parameters: {
      page_name: pageName,
      load_time: loadTime,
      device_type: /Mobile/.test(userAgent) ? 'mobile' : 'desktop',
      user_type: localStorage.getItem('user') ? 'authenticated' : 'anonymous'
    }
  });
};

export const logFeatureUsage = (featureName, usageCount = 1, success = true) => {
  ReactGA.event({
    category: 'Feature',
    action: 'Usage',
    label: featureName,
    value: usageCount,
    custom_parameters: {
      feature_name: featureName,
      success,
      user_type: localStorage.getItem('user') ? 'authenticated' : 'anonymous'
    }
  });
};

export const logError = (errorType, errorMessage, pageName, userId = null) => {
  ReactGA.event({
    category: 'Error',
    action: 'Occurred',
    label: errorType,
    custom_parameters: {
      error_type: errorType,
      error_message: errorMessage.substring(0, 100), // Truncate for privacy
      page_name: pageName,
      user_id: userId,
      user_type: localStorage.getItem('user') ? 'authenticated' : 'anonymous',
      timestamp: Date.now()
    }
  });
};
