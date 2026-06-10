import ReactGA from 'react-ga4';
import { track as vercelTrack } from '@vercel/analytics';
import { getApiBaseUrl } from '@/lib/apiBase';

const VERCEL_FIELD_MAX = 255;
const getTrackingId = () => process.env.NEXT_PUBLIC_GA_TRACKING_ID;

// ─── Privacy & session ───────────────────────────────────────────────────────

export const isAnalyticsAllowed = () => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('analytics_opt_out') !== 'true';
};

const getUserType = () => (
  typeof window !== 'undefined' && localStorage.getItem('user') ? 'authenticated' : 'anonymous'
);

export const getAnalyticsSessionId = () => {
  if (typeof window === 'undefined') return 'server';
  let sid = sessionStorage.getItem('tv_session_id');
  if (!sid) {
    sid = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem('tv_session_id', sid);
  }
  return sid;
};

const camelToSnake = (key) => key.replace(/([A-Z])/g, '_$1').toLowerCase();

/** Flatten values for Vercel Web Analytics (strings, numbers, booleans, null only). */
export const sanitizeVercelEventData = (data = {}) => {
  const out = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    const safeKey = String(key).slice(0, VERCEL_FIELD_MAX);
    if (value === null || typeof value === 'boolean' || typeof value === 'number') {
      out[safeKey] = value;
      continue;
    }
    out[safeKey] = String(value).slice(0, VERCEL_FIELD_MAX);
  }
  return out;
};

const buildVercelPayload = (metadata = {}) => {
  const snake = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined) continue;
    snake[camelToSnake(key)] = value;
  }
  return sanitizeVercelEventData({ user_type: getUserType(), ...snake });
};

// ─── Transport layers ────────────────────────────────────────────────────────

let backendEventBuffer = [];
let flushTimer = null;

const flushBackendEvents = () => {
  if (backendEventBuffer.length === 0) return;
  const events = [...backendEventBuffer];
  backendEventBuffer = [];
  fetch(`${getApiBaseUrl()}/analytics/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: getAnalyticsSessionId(), events }),
  }).catch((error) => {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[analytics] backend track failed:', error?.message || error);
    }
  });
};

const trackBackend = (eventType, eventCategory, metadata = {}) => {
  if (!isAnalyticsAllowed()) return;
  backendEventBuffer.push({
    eventType,
    eventCategory,
    pageUrl: window.location.pathname,
    pageTitle: document.title,
    metadata,
    timestamp: new Date().toISOString(),
  });
  if (backendEventBuffer.length >= 10) {
    clearTimeout(flushTimer);
    flushBackendEvents();
  } else if (!flushTimer) {
    flushTimer = setTimeout(() => { flushTimer = null; flushBackendEvents(); }, 2000);
  }
};

const trackGA = ({ category, action, label, value, params = {} }) => {
  if (!isAnalyticsAllowed()) return;
  const custom_parameters = {
    user_type: getUserType(),
    ...params,
  };
  ReactGA.event({
    category,
    action,
    label,
    ...(value != null ? { value } : {}),
    custom_parameters,
  });
  if (window.gtag) {
    window.gtag('event', action, {
      event_category: category,
      event_label: label,
      ...custom_parameters,
    });
  }
};

/** Vercel Web Analytics custom events (Pro/Enterprise). */
export const trackVercel = (eventName, data = {}) => {
  if (!isAnalyticsAllowed()) return;
  const name = String(eventName).slice(0, VERCEL_FIELD_MAX);
  try {
    vercelTrack(name, buildVercelPayload(data));
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[analytics] vercel track failed:', error?.message || error);
    }
  }
};

/**
 * Unified product event — GA4 + MongoDB + Vercel.
 * @param {string} vercelName snake_case event name for Vercel dashboard
 * @param {string} eventType backend Analytics.eventType
 * @param {string} eventCategory backend category
 * @param {object} [metadata] shared payload (also sent to Vercel, sanitized)
 * @param {object} [ga] { category, action, label?, value?, params? }
 */
export const emitProductEvent = ({
  vercelName,
  eventType,
  eventCategory,
  metadata = {},
  ga = null,
}) => {
  if (!isAnalyticsAllowed()) return;

  if (ga?.category && ga?.action) {
    trackGA({
      category: ga.category,
      action: ga.action,
      label: ga.label,
      value: ga.value,
      params: { ...metadata, ...(ga.params || {}) },
    });
  }

  trackBackend(eventType, eventCategory, metadata);
  trackVercel(vercelName, metadata);
};

// ─── GA bootstrap ────────────────────────────────────────────────────────────

export const initGA = () => {
  const trackingId = getTrackingId();
  if (trackingId) {
    ReactGA.initialize(trackingId, {
      gaOptions: { siteSpeedSampleRate: 100 },
    });
    if (process.env.NODE_ENV === 'development') {
      console.log('✅ Google Analytics initialized');
    }
  } else if (process.env.NODE_ENV === 'development') {
    console.warn('Google Analytics tracking ID not found. Set NEXT_PUBLIC_GA_TRACKING_ID.');
  }
};

// ─── Page views ──────────────────────────────────────────────────────────────

const sendPageView = (page) => {
  if (!isAnalyticsAllowed()) return;
  ReactGA.send({ hitType: 'pageview', page });
  if (window.gtag) {
    window.gtag('event', 'page_view', {
      page_title: document.title,
      page_location: window.location.href,
      page_path: page,
    });
  }
  trackBackend('page_view', 'content', { page });
};

export const logPageView = () => {
  const page = window.location.pathname + window.location.search;
  sendPageView(page);
};

export const trackPageView = (path) => {
  sendPageView(path);
};

// ─── Generic helpers ─────────────────────────────────────────────────────────

/** Legacy GA category/action/label — now full pipeline. */
export const logEvent = (category, action, label) => {
  const vercelName = `${category}_${action}`.replace(/\s+/g, '_').toLowerCase();
  emitProductEvent({
    vercelName,
    eventType: 'user_action',
    eventCategory: 'engagement',
    metadata: { action: vercelName, label: label != null ? String(label) : null },
    ga: { category, action, label },
  });
};

export const trackEvent = (category, action, label) => {
  logEvent(category, action, label);
};

// ─── Discovery & search ──────────────────────────────────────────────────────

export const logSearch = (searchQuery, resultCount = 0, searchType = 'general', extra = {}) => {
  emitProductEvent({
    vercelName: 'search_query',
    eventType: 'search',
    eventCategory: 'engagement',
    metadata: {
      searchTerm: searchQuery,
      resultCount,
      searchType,
      queryLength: searchQuery.length,
      hasResults: resultCount > 0,
      ...extra,
    },
    ga: {
      category: 'Search',
      action: 'Query',
      label: searchQuery,
      value: resultCount,
      params: {
        search_type: searchType,
        query_length: searchQuery.length,
        has_results: resultCount > 0,
        ...extra,
      },
    },
  });
};

export const logSearchResultClick = ({
  searchTerm,
  searchId,
  parkCode,
  parkName,
  surface = 'unknown',
  position,
}) => {
  logParkCardClick({
    parkCode,
    parkName,
    surface,
    position,
    searchTerm,
    searchId,
  });
};

export const logParkCardClick = ({
  parkCode,
  parkName = null,
  surface = 'unknown',
  position = null,
  searchTerm = null,
  searchId = null,
  intentSlug = null,
}) => {
  emitProductEvent({
    vercelName: 'park_card_click',
    eventType: 'user_action',
    eventCategory: 'engagement',
    metadata: {
      action: 'park_card_click',
      parkCode,
      parkName,
      surface,
      position,
      searchTerm,
      searchId: searchId || null,
      intentSlug,
    },
    ga: {
      category: 'Park',
      action: 'Card_Click',
      label: parkCode,
      params: { surface, position, intent_slug: intentSlug },
    },
  });
};

export const logDiscoverClick = ({ dimension, slug, label }) => {
  emitProductEvent({
    vercelName: 'discover_card_click',
    eventType: 'user_action',
    eventCategory: 'engagement',
    metadata: { action: 'discover_card_click', dimension, slug, label },
    ga: { category: 'Discover', action: 'Card_Click', label: `${dimension}/${slug}` },
  });
};

export const logExploreFilterChange = ({ filterType, value }) => {
  emitProductEvent({
    vercelName: 'explore_filter_change',
    eventType: 'user_action',
    eventCategory: 'engagement',
    metadata: { action: 'explore_filter_change', filterType, value },
    ga: { category: 'Explore', action: 'Filter', label: `${filterType}:${value}` },
  });
};

// ─── Parks ───────────────────────────────────────────────────────────────────

export const logParkView = (parkCode, parkName, source = 'unknown', extra = {}) => {
  emitProductEvent({
    vercelName: 'park_view',
    eventType: 'park_view',
    eventCategory: 'content',
    metadata: { parkCode, parkName, source, ...extra },
    ga: {
      category: 'Park',
      action: 'View',
      label: parkName,
      params: { park_code: parkCode, source, ...extra },
    },
  });
};

export const logParkTabView = (parkCode, tab) => {
  emitProductEvent({
    vercelName: 'park_tab_view',
    eventType: 'user_action',
    eventCategory: 'engagement',
    metadata: { action: 'park_tab_view', parkCode, tab },
    ga: { category: 'Park', action: 'Tab_View', label: tab, params: { park_code: parkCode } },
  });
};

export const logParkEngagement = ({ action, parkCode, parkName = null, extra = {} }) => {
  emitProductEvent({
    vercelName: `park_${action}`,
    eventType: 'user_action',
    eventCategory: 'engagement',
    metadata: { action, parkCode, parkName, ...extra },
    ga: {
      category: 'Park',
      action,
      label: parkName || parkCode,
      params: { park_code: parkCode, ...extra },
    },
  });
};

// ─── CTAs & auth gates ───────────────────────────────────────────────────────

/** Outbound / install CTAs on /chatgpt and /mcp distribution landings. */
export const logDistributionCta = ({
  channel,
  ctaId,
  label,
  destination = null,
}) => {
  emitProductEvent({
    vercelName: 'distribution_cta',
    eventType: 'user_action',
    eventCategory: 'engagement',
    metadata: {
      action: 'distribution_cta',
      channel,
      ctaId,
      label: label || ctaId,
      destination,
    },
    ga: {
      category: 'Distribution',
      action: ctaId,
      label: channel,
      params: { channel, destination },
    },
  });
};

export const logCtaClick = ({
  ctaId,
  label,
  surface,
  destination = null,
  parkCode = null,
}) => {
  emitProductEvent({
    vercelName: 'cta_click',
    eventType: 'user_action',
    eventCategory: 'engagement',
    metadata: {
      action: 'cta_click',
      ctaId,
      label: label || ctaId,
      surface,
      destination,
      parkCode,
    },
    ga: {
      category: 'CTA',
      action: 'Click',
      label: label || ctaId,
      params: { cta_id: ctaId, surface, destination, park_code: parkCode },
    },
  });
};

export const logLoginPromptShown = (reason, surface = null) => {
  emitProductEvent({
    vercelName: 'login_prompt_shown',
    eventType: 'user_action',
    eventCategory: 'engagement',
    metadata: {
      action: 'login_prompt_shown',
      reason: String(reason).slice(0, 120),
      surface,
    },
    ga: { category: 'Auth', action: 'Login_Prompt', label: String(reason).slice(0, 80) },
  });
};

// ─── Trailie / AI ────────────────────────────────────────────────────────────

export const logAIChat = (message, responseTime = 0, success = true) => {
  emitProductEvent({
    vercelName: success ? 'ai_chat_success' : 'ai_chat_error',
    eventType: 'ai_chat',
    eventCategory: 'engagement',
    metadata: {
      messageLength: message.length,
      responseTimeMs: responseTime,
      success,
    },
    ga: {
      category: 'AI',
      action: success ? 'Chat_Success' : 'Chat_Error',
      label: message.substring(0, 50),
      value: responseTime,
      params: { message_length: message.length, response_time: responseTime, success },
    },
  });
};

export const logPlanAiSessionStart = ({ userType = null, parkCode = null } = {}) => {
  emitProductEvent({
    vercelName: 'plan_ai_session_start',
    eventType: 'user_action',
    eventCategory: 'engagement',
    metadata: {
      action: 'plan_ai_session_start',
      sessionUserType: userType || getUserType(),
      parkCode,
    },
    ga: { category: 'AI', action: 'Session_Start', label: parkCode || 'general' },
  });
};

export const logAIFeedback = ({ feedback, conversationId = null }) => {
  emitProductEvent({
    vercelName: 'ai_feedback',
    eventType: 'user_action',
    eventCategory: 'engagement',
    metadata: { action: 'ai_feedback', feedback, conversationId },
    ga: { category: 'AI', action: 'Feedback', label: feedback },
  });
};

export const logTripShareCreated = ({ tripId = null, parkCode = null } = {}) => {
  emitProductEvent({
    vercelName: 'trip_share_created',
    eventType: 'user_action',
    eventCategory: 'engagement',
    metadata: { action: 'trip_share_created', tripId, parkCode },
    ga: { category: 'AI', action: 'Trip_Share', label: parkCode || tripId || 'trip' },
  });
};

export const logAnonymousChatMigrated = () => {
  emitProductEvent({
    vercelName: 'anonymous_chat_migrated',
    eventType: 'user_signup',
    eventCategory: 'business',
    metadata: { action: 'anonymous_chat_migrated' },
    ga: { category: 'Auth', action: 'Chat_Migrated', label: 'anonymous_to_user' },
  });
};

export const logVoiceSessionStart = ({ parkCode = null } = {}) => {
  emitProductEvent({
    vercelName: 'voice_session_start',
    eventType: 'user_action',
    eventCategory: 'engagement',
    metadata: { action: 'voice_session_start', parkCode },
    ga: { category: 'Voice', action: 'Session_Start', label: parkCode || 'global' },
  });
};

// ─── Content ─────────────────────────────────────────────────────────────────

export const logBlogView = (blogTitle, blogId, category = 'unknown') => {
  emitProductEvent({
    vercelName: 'blog_view',
    eventType: 'blog_view',
    eventCategory: 'content',
    metadata: { blogTitle, blogId, category },
    ga: {
      category: 'Blog',
      action: 'View',
      label: blogTitle,
      params: { blog_id: blogId, category },
    },
  });
};

export const logEventView = (eventTitle, eventId, parkCode = 'unknown') => {
  emitProductEvent({
    vercelName: 'event_view',
    eventType: 'event_view',
    eventCategory: 'content',
    metadata: { eventTitle, eventId, parkCode },
    ga: {
      category: 'Event',
      action: 'View',
      label: eventTitle,
      params: { event_id: eventId, park_code: parkCode },
    },
  });
};

export const logEventRegister = (eventId, eventTitle, parkCode = null) => {
  emitProductEvent({
    vercelName: 'event_register',
    eventType: 'event_register',
    eventCategory: 'engagement',
    metadata: { eventId, eventTitle, parkCode },
    ga: { category: 'Event', action: 'Register', label: eventTitle },
  });
};

export const logReviewCreate = (parkCode, reviewId = null, hasImages = false) => {
  emitProductEvent({
    vercelName: 'review_create',
    eventType: 'review_create',
    eventCategory: 'engagement',
    metadata: { parkCode, reviewId, hasImages },
    ga: {
      category: 'Review',
      action: 'Create',
      label: parkCode,
      params: { has_images: hasImages },
    },
  });
};

export const logShare = (platform, content, contentType = 'unknown') => {
  emitProductEvent({
    vercelName: 'share',
    eventType: 'user_action',
    eventCategory: 'engagement',
    metadata: { action: 'share', platform, contentType },
    ga: {
      category: 'Share',
      action: platform,
      label: content,
      params: { content_type: contentType, platform },
    },
  });
};

// ─── User lifecycle (structured) ─────────────────────────────────────────────

export const logUserSignup = (userId = null) => {
  emitProductEvent({
    vercelName: 'user_signup',
    eventType: 'user_signup',
    eventCategory: 'business',
    metadata: { userId },
    ga: { category: 'Auth', action: 'Signup', label: 'success' },
  });
};

export const logUserLogin = (userId = null) => {
  emitProductEvent({
    vercelName: 'user_login',
    eventType: 'user_login',
    eventCategory: 'business',
    metadata: { userId },
    ga: { category: 'Auth', action: 'Login', label: 'success' },
  });
};

export const logUserLogout = () => {
  emitProductEvent({
    vercelName: 'user_logout',
    eventType: 'user_logout',
    eventCategory: 'business',
    metadata: {},
    ga: { category: 'Auth', action: 'Logout', label: 'manual' },
  });
};

/** @deprecated Prefer logParkEngagement or structured emitProductEvent metadata. */
export const logUserAction = (action, details, userIdOrMeta = null) => {
  let userId = null;
  let extra = {};
  if (typeof userIdOrMeta === 'object' && userIdOrMeta !== null) {
    extra = userIdOrMeta;
  } else if (userIdOrMeta) {
    userId = userIdOrMeta;
  }
  emitProductEvent({
    vercelName: `user_${action}`,
    eventType: 'user_action',
    eventCategory: 'engagement',
    metadata: { action, details, userId, ...extra },
    ga: { category: 'User', action, label: details, params: extra },
  });
};

// ─── Technical / performance ─────────────────────────────────────────────────

export const logWeatherWidgetUsage = (parkCode, weatherLoaded = true, errorType = null) => {
  emitProductEvent({
    vercelName: 'weather_widget',
    eventType: 'user_action',
    eventCategory: 'technical',
    metadata: { action: 'weather_widget', parkCode, weatherLoaded, errorType },
    ga: {
      category: 'Weather',
      action: 'Widget_Usage',
      label: parkCode,
      params: { weather_loaded: weatherLoaded, error_type: errorType },
    },
  });
};

export const logFeatureUsage = (featureName, usageCount = 1, success = true) => {
  emitProductEvent({
    vercelName: 'feature_usage',
    eventType: 'user_action',
    eventCategory: 'engagement',
    metadata: { action: 'feature_usage', featureName, usageCount, success },
    ga: {
      category: 'Feature',
      action: 'Usage',
      label: featureName,
      value: usageCount,
      params: { success },
    },
  });
};

export const logPagePerformance = (pageName, loadTime, userAgent) => {
  emitProductEvent({
    vercelName: 'page_performance',
    eventType: 'performance',
    eventCategory: 'technical',
    metadata: {
      pageName,
      loadTime,
      deviceType: /Mobile/.test(userAgent) ? 'mobile' : 'desktop',
    },
    ga: {
      category: 'Performance',
      action: 'Page_Load',
      label: pageName,
      value: loadTime,
    },
  });
};

export const logCachingPerformance = (cacheType, hitRate, responseTime) => {
  emitProductEvent({
    vercelName: 'cache_performance',
    eventType: 'performance',
    eventCategory: 'technical',
    metadata: { cacheType, hitRate, responseTime },
    ga: {
      category: 'Performance',
      action: 'Cache_Performance',
      label: cacheType,
      value: responseTime,
    },
  });
};

export const logError = (errorType, errorMessage, pageName, userId = null) => {
  emitProductEvent({
    vercelName: 'client_error',
    eventType: 'error',
    eventCategory: 'technical',
    metadata: {
      errorCode: errorType,
      errorMessage: errorMessage.substring(0, 100),
      pageName,
      userId,
    },
    ga: {
      category: 'Error',
      action: 'Occurred',
      label: errorType,
      params: { error_message: errorMessage.substring(0, 100), page_name: pageName },
    },
  });
};

// ─── Facade aliases for analyticsService / hooks ─────────────────────────────

export const trackCustomEvent = (eventName, metadata = {}) => {
  emitProductEvent({
    vercelName: eventName.replace(/\s+/g, '_').toLowerCase(),
    eventType: 'custom_event',
    eventCategory: 'user',
    metadata: { eventName, ...metadata },
    ga: { category: 'Custom', action: eventName, label: metadata.surface || null },
  });
};

export const trackParkSave = (parkCode, parkName) => {
  logParkEngagement({ action: 'favorite_add', parkCode, parkName });
};

export const trackImageUpload = (imageCount, category = 'general') => {
  emitProductEvent({
    vercelName: 'image_upload',
    eventType: 'user_action',
    eventCategory: 'engagement',
    metadata: { action: 'image_upload', imageCount, category },
    ga: { category: 'Upload', action: 'Image', label: category, value: imageCount },
  });
};

export const optOutAnalytics = () => {
  localStorage.setItem('analytics_opt_out', 'true');
};

export const optInAnalytics = () => {
  localStorage.removeItem('analytics_opt_out');
};
