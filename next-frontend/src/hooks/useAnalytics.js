import { useCallback } from 'react';
import {
  emitProductEvent,
  getAnalyticsSessionId,
  isAnalyticsAllowed,
  logAIChat,
  logBlogView,
  logError,
  logEventRegister,
  logEventView,
  logParkView,
  logReviewCreate,
  logSearch,
  logUserAction,
  logUserLogin,
  logUserLogout,
  logUserSignup,
  optInAnalytics,
  optOutAnalytics,
  trackCustomEvent,
  trackImageUpload,
  trackParkSave,
} from '@/utils/analytics';

/** Analytics hook — delegates to utils/analytics (GA4 + MongoDB + Vercel). */
export const useAnalytics = () => {
  const track = useCallback((eventType, eventCategory, metadata = {}) => {
    emitProductEvent({
      vercelName: String(eventType).replace(/\s+/g, '_').toLowerCase(),
      eventType,
      eventCategory,
      metadata,
    });
  }, []);

  const trackUserAction = useCallback((actionType, metadata = {}) => {
    logUserAction(actionType, metadata.details || actionType, metadata);
  }, []);

  const trackSearch = useCallback((searchTerm, resultCount = 0, searchType = 'general') => {
    logSearch(searchTerm, resultCount, searchType);
  }, []);

  const trackParkViewCb = useCallback((parkCode, parkName) => {
    logParkView(parkCode, parkName);
  }, []);

  const trackParkSaveCb = useCallback((parkCode, parkName) => {
    trackParkSave(parkCode, parkName);
  }, []);

  const trackBlogViewCb = useCallback((blogId, blogTitle) => {
    logBlogView(blogTitle, blogId);
  }, []);

  const trackEventViewCb = useCallback((eventId, eventTitle) => {
    logEventView(eventTitle, eventId);
  }, []);

  const trackEventRegisterCb = useCallback((eventId, eventTitle) => {
    logEventRegister(eventId, eventTitle);
  }, []);

  const trackReviewCreateCb = useCallback((parkCode, reviewId) => {
    logReviewCreate(parkCode, reviewId);
  }, []);

  const trackAIChatCb = useCallback((message, responseTime = 0, success = true) => {
    logAIChat(message, responseTime, success);
  }, []);

  const trackImageUploadCb = useCallback((imageCount, category = 'general') => {
    trackImageUpload(imageCount, category);
  }, []);

  const trackErrorCb = useCallback((errorMessage, errorCode = 'CLIENT_ERROR') => {
    logError(errorCode, errorMessage, typeof window !== 'undefined' ? window.location.pathname : null);
  }, []);

  const trackCustomEventCb = useCallback((eventName, metadata = {}) => {
    trackCustomEvent(eventName, metadata);
  }, []);

  return {
    track,
    trackUserAction,
    trackSearch,
    trackParkView: trackParkViewCb,
    trackParkSave: trackParkSaveCb,
    trackBlogView: trackBlogViewCb,
    trackEventView: trackEventViewCb,
    trackEventRegister: trackEventRegisterCb,
    trackReviewCreate: trackReviewCreateCb,
    trackAIChat: trackAIChatCb,
    trackImageUpload: trackImageUploadCb,
    trackError: trackErrorCb,
    trackCustomEvent: trackCustomEventCb,
  };
};

export const useUserActionTracking = (actionType, metadata = {}) => {
  const trackAction = useCallback(() => {
    logUserAction(actionType, metadata.details || actionType, metadata);
  }, [actionType, metadata]);
  return trackAction;
};

export const useSearchTracking = () => {
  return useCallback((searchTerm, resultCount = 0, searchType = 'general') => {
    logSearch(searchTerm, resultCount, searchType);
  }, []);
};

export const useContentViewTracking = () => {
  const trackParkViewCb = useCallback((parkCode, parkName) => logParkView(parkCode, parkName), []);
  const trackBlogViewCb = useCallback((blogId, blogTitle) => logBlogView(blogTitle, blogId), []);
  const trackEventViewCb = useCallback((eventId, eventTitle) => logEventView(eventTitle, eventId), []);
  return { trackParkView: trackParkViewCb, trackBlogView: trackBlogViewCb, trackEventView: trackEventViewCb };
};

export const useEngagementTracking = () => {
  const trackParkSaveCb = useCallback((parkCode, parkName) => trackParkSave(parkCode, parkName), []);
  const trackEventRegisterCb = useCallback((eventId, eventTitle) => logEventRegister(eventId, eventTitle), []);
  const trackReviewCreateCb = useCallback((parkCode, reviewId) => logReviewCreate(parkCode, reviewId), []);
  return {
    trackParkSave: trackParkSaveCb,
    trackEventRegister: trackEventRegisterCb,
    trackReviewCreate: trackReviewCreateCb,
  };
};

export const useAITracking = () => {
  return useCallback((message, responseTime = 0, success = true) => {
    logAIChat(message, responseTime, success);
  }, []);
};

export const useUploadTracking = () => {
  return useCallback((imageCount, category = 'general') => {
    trackImageUpload(imageCount, category);
  }, []);
};

export const useErrorTracking = () => {
  return useCallback((errorMessage, errorCode = 'CLIENT_ERROR') => {
    logError(errorCode, errorMessage, typeof window !== 'undefined' ? window.location.pathname : null);
  }, []);
};

export const usePerformanceTracking = () => {
  const trackPerformance = useCallback((metric, value, unit = 'ms') => {
    emitProductEvent({
      vercelName: 'performance_metric',
      eventType: 'performance',
      eventCategory: 'technical',
      metadata: { metric, value, unit },
    });
  }, []);

  const trackPageLoadTime = useCallback(() => {
    if (typeof window === 'undefined' || !window.performance?.timing) return;
    const loadTime = window.performance.timing.loadEventEnd - window.performance.timing.navigationStart;
    if (loadTime > 0) {
      emitProductEvent({
        vercelName: 'page_load_time',
        eventType: 'performance',
        eventCategory: 'technical',
        metadata: { loadTime },
      });
    }
  }, []);

  const trackApiCall = useCallback((endpoint, method, duration, statusCode) => {
    emitProductEvent({
      vercelName: 'api_call',
      eventType: 'api_call',
      eventCategory: 'technical',
      metadata: { endpoint, method, duration, statusCode },
    });
  }, []);

  return { trackPerformance, trackPageLoadTime, trackApiCall };
};

export const useCustomEventTracking = () => {
  return useCallback((eventName, metadata = {}) => {
    trackCustomEvent(eventName, metadata);
  }, []);
};

export const useAnalyticsState = () => {
  const initialize = useCallback(() => {}, []);
  const setUserId = useCallback(() => {}, []);
  const trackUserSignupCb = useCallback((userId) => logUserSignup(userId), []);
  const trackUserLoginCb = useCallback((userId) => logUserLogin(userId), []);
  const trackUserLogoutCb = useCallback(() => logUserLogout(), []);
  const optOut = useCallback(() => optOutAnalytics(), []);
  const optIn = useCallback(() => optInAnalytics(), []);

  return {
    initialize,
    setUserId,
    trackUserSignup: trackUserSignupCb,
    trackUserLogin: trackUserLoginCb,
    trackUserLogout: trackUserLogoutCb,
    optOut,
    optIn,
    isEnabled: isAnalyticsAllowed(),
    sessionId: getAnalyticsSessionId(),
    userId: null,
  };
};

export const useFormTracking = (formName) => {
  const trackFormStart = useCallback(() => {
    logUserAction('form_start', formName, { formName });
  }, [formName]);

  const trackFormComplete = useCallback((success = true, metadata = {}) => {
    logUserAction('form_complete', formName, { formName, success, ...metadata });
  }, [formName]);

  const trackFormError = useCallback((errorMessage, fieldName = null) => {
    logUserAction('form_error', formName, { formName, errorMessage, fieldName });
  }, [formName]);

  const trackFieldInteraction = useCallback((fieldName, action = 'focus') => {
    logUserAction('form_field_interaction', fieldName, { formName, fieldName, action });
  }, [formName]);

  return { trackFormStart, trackFormComplete, trackFormError, trackFieldInteraction };
};

export const useNavigationTracking = () => {
  const trackNavigation = useCallback((from, to, method = 'click') => {
    logUserAction('navigation', `${from}→${to}`, { from, to, method });
  }, []);

  const trackExternalLink = useCallback((url, linkText = null) => {
    logUserAction('external_link', url, { url, linkText });
  }, []);

  return { trackNavigation, trackExternalLink };
};

export default useAnalytics;
