/**
 * Thin facade over utils/analytics.js — single pipeline (GA4 + MongoDB + Vercel).
 * Kept for backward compatibility with hooks and review components.
 */
import {
  emitProductEvent,
  getAnalyticsSessionId,
  isAnalyticsAllowed,
  logAIChat,
  logBlogView,
  logError,
  logEventRegister,
  logEventView,
  logPageView,
  logParkView,
  logReviewCreate,
  logSearch,
  logUserAction,
  logUserLogin,
  logUserLogout,
  logUserSignup,
  optInAnalytics,
  optOutAnalytics,
  trackCustomEvent as trackCustomEventUtil,
  trackImageUpload as trackImageUploadUtil,
  trackPageView as trackPageViewUtil,
  trackParkSave as trackParkSaveUtil,
} from '@/utils/analytics';

class AnalyticsService {
  constructor() {
    this.userId = null;
  }

  setUserId(userId) {
    this.userId = userId;
  }

  setEnabled(enabled) {
    if (!enabled) optOutAnalytics();
    else optInAnalytics();
  }

  getSessionId() {
    return getAnalyticsSessionId();
  }

  getUserId() {
    return this.userId;
  }

  isTrackingEnabled() {
    return isAnalyticsAllowed();
  }

  track(eventType, eventCategory, metadata = {}) {
    emitProductEvent({
      vercelName: String(eventType).replace(/\s+/g, '_').toLowerCase(),
      eventType,
      eventCategory,
      metadata,
      ga: metadata.gaCategory
        ? {
            category: metadata.gaCategory,
            action: metadata.gaAction || eventType,
            label: metadata.gaLabel,
          }
        : null,
    });
  }

  trackPageView(pageTitle = null) {
    if (pageTitle) trackPageViewUtil(pageTitle);
    else logPageView();
  }

  trackUserAction(actionType, metadata = {}) {
    logUserAction(actionType, metadata.details || actionType, metadata);
  }

  trackSearch(searchTerm, resultCount = 0, searchType = 'general') {
    logSearch(searchTerm, resultCount, searchType);
  }

  trackParkView(parkCode, parkName) {
    logParkView(parkCode, parkName);
  }

  trackParkSave(parkCode, parkName) {
    trackParkSaveUtil(parkCode, parkName);
  }

  trackBlogView(blogId, blogTitle) {
    logBlogView(blogTitle, blogId);
  }

  trackEventView(eventId, eventTitle) {
    logEventView(eventTitle, eventId);
  }

  trackEventRegister(eventId, eventTitle) {
    logEventRegister(eventId, eventTitle);
  }

  trackReviewCreate(parkCode, reviewId) {
    logReviewCreate(parkCode, reviewId);
  }

  trackAIChat(conversationId, messageCount, provider = 'claude') {
    emitProductEvent({
      vercelName: 'ai_chat_batch',
      eventType: 'ai_chat',
      eventCategory: 'engagement',
      metadata: { conversationId, messageCount, provider },
      ga: { category: 'AI', action: 'Chat_Batch', label: provider, value: messageCount },
    });
  }

  trackImageUpload(imageCount, category = 'general') {
    trackImageUploadUtil(imageCount, category);
  }

  trackError(errorMessage, errorCode = 'CLIENT_ERROR', stack = null) {
    logError(errorCode, errorMessage, typeof window !== 'undefined' ? window.location.pathname : null);
    if (stack && process.env.NODE_ENV === 'development') {
      console.error(stack);
    }
  }

  trackPerformance(metric, value, unit = 'ms') {
    emitProductEvent({
      vercelName: 'performance_metric',
      eventType: 'performance',
      eventCategory: 'technical',
      metadata: { metric, value, unit },
      ga: { category: 'Performance', action: metric, label: unit, value },
    });
  }

  trackUserSignup(userId) {
    this.setUserId(userId);
    logUserSignup(userId);
  }

  trackUserLogin(userId) {
    this.setUserId(userId);
    logUserLogin(userId);
  }

  trackUserLogout() {
    logUserLogout();
    this.userId = null;
  }

  trackPageLoadTime() {
    if (typeof window === 'undefined' || !window.performance?.timing) return;
    const timing = window.performance.timing;
    const loadTime = timing.loadEventEnd - timing.navigationStart;
    if (loadTime > 0) this.trackPerformance('page_load_time', loadTime);
  }

  trackApiCall(endpoint, method, duration, statusCode) {
    emitProductEvent({
      vercelName: 'api_call',
      eventType: 'api_call',
      eventCategory: 'technical',
      metadata: { endpoint, method, duration, statusCode },
      ga: { category: 'API', action: method, label: endpoint, value: duration },
    });
  }

  trackCustomEvent(eventName, metadata = {}) {
    trackCustomEventUtil(eventName, metadata);
  }

  clearSession() {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('tv_session_id');
    }
  }

  optOut() {
    optOutAnalytics();
  }

  optIn() {
    optInAnalytics();
  }

  initialize() {
    if (isAnalyticsAllowed()) logPageView();
  }
}

const analyticsService = new AnalyticsService();

export default analyticsService;
