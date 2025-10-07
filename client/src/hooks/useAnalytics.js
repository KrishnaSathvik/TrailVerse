import { useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import analyticsService from '../services/analyticsService';

// Main analytics hook
export const useAnalytics = () => {
  const location = useLocation();
  const previousLocation = useRef();

  // Track page views on route changes
  useEffect(() => {
    if (previousLocation.current !== location.pathname) {
      analyticsService.trackPageView();
      previousLocation.current = location.pathname;
    }
  }, [location]);

  return {
    track: analyticsService.track.bind(analyticsService),
    trackUserAction: analyticsService.trackUserAction.bind(analyticsService),
    trackSearch: analyticsService.trackSearch.bind(analyticsService),
    trackParkView: analyticsService.trackParkView.bind(analyticsService),
    trackParkSave: analyticsService.trackParkSave.bind(analyticsService),
    trackBlogView: analyticsService.trackBlogView.bind(analyticsService),
    trackEventView: analyticsService.trackEventView.bind(analyticsService),
    trackEventRegister: analyticsService.trackEventRegister.bind(analyticsService),
    trackReviewCreate: analyticsService.trackReviewCreate.bind(analyticsService),
    trackAIChat: analyticsService.trackAIChat.bind(analyticsService),
    trackImageUpload: analyticsService.trackImageUpload.bind(analyticsService),
    trackError: analyticsService.trackError.bind(analyticsService),
    trackCustomEvent: analyticsService.trackCustomEvent.bind(analyticsService)
  };
};

// Hook for tracking user interactions
export const useUserActionTracking = (actionType, metadata = {}) => {
  const trackAction = useCallback(() => {
    analyticsService.trackUserAction(actionType, metadata);
  }, [actionType, metadata]);

  return trackAction;
};

// Hook for tracking search events
export const useSearchTracking = () => {
  const trackSearch = useCallback((searchTerm, resultCount = 0, searchType = 'general') => {
    analyticsService.trackSearch(searchTerm, resultCount, searchType);
  }, []);

  return trackSearch;
};

// Hook for tracking content views
export const useContentViewTracking = () => {
  const trackParkView = useCallback((parkCode, parkName) => {
    analyticsService.trackParkView(parkCode, parkName);
  }, []);

  const trackBlogView = useCallback((blogId, blogTitle) => {
    analyticsService.trackBlogView(blogId, blogTitle);
  }, []);

  const trackEventView = useCallback((eventId, eventTitle) => {
    analyticsService.trackEventView(eventId, eventTitle);
  }, []);

  return {
    trackParkView,
    trackBlogView,
    trackEventView
  };
};

// Hook for tracking engagement events
export const useEngagementTracking = () => {
  const trackParkSave = useCallback((parkCode, parkName) => {
    analyticsService.trackParkSave(parkCode, parkName);
  }, []);

  const trackEventRegister = useCallback((eventId, eventTitle) => {
    analyticsService.trackEventRegister(eventId, eventTitle);
  }, []);

  const trackReviewCreate = useCallback((parkCode, reviewId) => {
    analyticsService.trackReviewCreate(parkCode, reviewId);
  }, []);

  return {
    trackParkSave,
    trackEventRegister,
    trackReviewCreate
  };
};

// Hook for tracking AI interactions
export const useAITracking = () => {
  const trackAIChat = useCallback((conversationId, messageCount, provider = 'claude') => {
    analyticsService.trackAIChat(conversationId, messageCount, provider);
  }, []);

  return { trackAIChat };
};

// Hook for tracking file uploads
export const useUploadTracking = () => {
  const trackImageUpload = useCallback((imageCount, category = 'general') => {
    analyticsService.trackImageUpload(imageCount, category);
  }, []);

  return { trackImageUpload };
};

// Hook for tracking errors
export const useErrorTracking = () => {
  const trackError = useCallback((errorMessage, errorCode = 'CLIENT_ERROR', stack = null) => {
    analyticsService.trackError(errorMessage, errorCode, stack);
  }, []);

  return { trackError };
};

// Hook for tracking performance
export const usePerformanceTracking = () => {
  const trackPerformance = useCallback((metric, value, unit = 'ms') => {
    analyticsService.trackPerformance(metric, value, unit);
  }, []);

  const trackPageLoadTime = useCallback(() => {
    analyticsService.trackPageLoadTime();
  }, []);

  const trackApiCall = useCallback((endpoint, method, duration, statusCode) => {
    analyticsService.trackApiCall(endpoint, method, duration, statusCode);
  }, []);

  return {
    trackPerformance,
    trackPageLoadTime,
    trackApiCall
  };
};

// Hook for tracking custom events
export const useCustomEventTracking = () => {
  const trackCustomEvent = useCallback((eventName, metadata = {}) => {
    analyticsService.trackCustomEvent(eventName, metadata);
  }, []);

  return { trackCustomEvent };
};

// Hook for managing analytics state
export const useAnalyticsState = () => {
  const initialize = useCallback(() => {
    analyticsService.initialize();
  }, []);

  const setUserId = useCallback((userId) => {
    analyticsService.setUserId(userId);
  }, []);

  const trackUserSignup = useCallback((userId) => {
    analyticsService.trackUserSignup(userId);
  }, []);

  const trackUserLogin = useCallback((userId) => {
    analyticsService.trackUserLogin(userId);
  }, []);

  const trackUserLogout = useCallback(() => {
    analyticsService.trackUserLogout();
  }, []);

  const optOut = useCallback(() => {
    analyticsService.optOut();
  }, []);

  const optIn = useCallback(() => {
    analyticsService.optIn();
  }, []);

  const isEnabled = analyticsService.isTrackingEnabled();
  const sessionId = analyticsService.getSessionId();
  const userId = analyticsService.getUserId();

  return {
    initialize,
    setUserId,
    trackUserSignup,
    trackUserLogin,
    trackUserLogout,
    optOut,
    optIn,
    isEnabled,
    sessionId,
    userId
  };
};

// Hook for tracking form interactions
export const useFormTracking = (formName) => {
  const trackFormStart = useCallback(() => {
    analyticsService.trackUserAction('form_start', { formName });
  }, [formName]);

  const trackFormComplete = useCallback((success = true, metadata = {}) => {
    analyticsService.trackUserAction('form_complete', {
      formName,
      success,
      ...metadata
    });
  }, [formName]);

  const trackFormError = useCallback((errorMessage, fieldName = null) => {
    analyticsService.trackUserAction('form_error', {
      formName,
      errorMessage,
      fieldName
    });
  }, [formName]);

  const trackFieldInteraction = useCallback((fieldName, action = 'focus') => {
    analyticsService.trackUserAction('form_field_interaction', {
      formName,
      fieldName,
      action
    });
  }, [formName]);

  return {
    trackFormStart,
    trackFormComplete,
    trackFormError,
    trackFieldInteraction
  };
};

// Hook for tracking navigation
export const useNavigationTracking = () => {
  const trackNavigation = useCallback((from, to, method = 'click') => {
    analyticsService.trackUserAction('navigation', {
      from,
      to,
      method
    });
  }, []);

  const trackExternalLink = useCallback((url, linkText = null) => {
    analyticsService.trackUserAction('external_link', {
      url,
      linkText
    });
  }, []);

  return {
    trackNavigation,
    trackExternalLink
  };
};

export default useAnalytics;
