import {
  capturePostHog,
  identifyPostHog,
  initPostHog,
  optInPostHog,
  optOutPostHog,
  resetPostHog,
} from '@/lib/posthogClient';

const INFO_PATHS = new Set([
  '/about',
  '/privacy',
  '/terms',
  '/faq',
  '/features',
  '/testimonials',
  '/newsletter',
  '/contact',
]);

const ACCOUNT_PREFIXES = ['/login', '/signup', '/forgot-password', '/reset-password', '/verify-email', '/profile', '/unsubscribe'];

const ALLOWED_PROPERTIES = new Set([
  'page_category',
  'content_key',
  'signed_in',
  'placement',
  'destination',
  'surface',
  'result_count',
  'has_query',
  'filter_type',
  'park_code',
  'source',
  'dimension',
  'slug',
  'action',
  'park_count',
  'host',
  'event_id',
  'scenario_id',
  'message_length',
  'turn_index',
  'outcome',
  'has_itinerary',
  'duration_ms',
  'matched',
]);

export const isAnalyticsAllowed = () => {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem('analytics_opt_out') !== 'true';
};

const isSignedIn = () => {
  if (typeof window === 'undefined') return false;
  return Boolean(window.localStorage.getItem('user'));
};

const gaId = () => process.env.NEXT_PUBLIC_GA_TRACKING_ID || '';

function sanitizeProperties(properties = {}) {
  const safe = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!ALLOWED_PROPERTIES.has(key) || value == null) continue;
    if (typeof value === 'boolean') {
      safe[key] = value;
      continue;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      safe[key] = value;
      continue;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed || trimmed.includes('@') || trimmed.length > 80) continue;
      safe[key] = trimmed;
    }
  }
  return safe;
}

function capture(eventName, properties = {}) {
  if (!isAnalyticsAllowed()) return;
  try {
    capturePostHog(eventName, sanitizeProperties(properties));
  } catch {
    // ignore
  }
}

export function pageCategory(pathname = '/') {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/explore')) return 'explore';
  if (pathname.startsWith('/parks/')) return 'park';
  if (pathname.startsWith('/map')) return 'map';
  if (pathname.startsWith('/plan-ai')) return 'trailie';
  if (pathname.startsWith('/events')) return 'events';
  if (pathname.startsWith('/blog')) return 'blog';
  if (pathname.startsWith('/trailie-demo')) return 'demo';
  if (pathname.startsWith('/itineraries')) return 'itineraries';
  if (pathname.startsWith('/discover')) return 'discover';
  if (pathname.startsWith('/compare')) return 'compare';
  if (pathname.startsWith('/guides') || pathname.startsWith('/parks-for-') || pathname.endsWith('-national-parks') || pathname.endsWith('-parks')) return 'guides';
  if (pathname.startsWith('/where-next')) return 'where_next';
  if (ACCOUNT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return 'account';
  if (INFO_PATHS.has(pathname)) return 'info';
  return 'other';
}

function contentKey(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] === 'parks' && parts[1] && parts[1] !== 'state') return parts[1];
  if (parts[0] === 'blog' && parts[1] && parts[1] !== 'category') return parts[1];
  if (parts[0] === 'blog' && parts[1] === 'category' && parts[2]) return parts[2];
  if (parts[0] === 'itineraries' && parts[1]) return parts[1];
  if (parts[0] === 'discover' && parts[2]) return parts[2];
  return null;
}

function sendGaPageView(pathname) {
  if (!isAnalyticsAllowed() || typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  if (gaId() && window[`ga-disable-${gaId()}`]) return;
  window.gtag('event', 'page_view', {
    page_path: pathname,
    page_location: `${window.location.origin}${pathname}`,
    page_title: document.title,
  });
}

export const initGA = () => {
  initAnalytics();
};

export function initAnalytics() {
  if (typeof window === 'undefined') return;
  const id = gaId();
  if (id && window.localStorage.getItem('analytics_opt_out') === 'true') {
    window[`ga-disable-${id}`] = true;
  }
  initPostHog();
}

export const logPageView = () => {
  if (typeof window === 'undefined') return;
  const pathname = window.location.pathname || '/';
  sendGaPageView(pathname);
  capture('$pageview', {
    page_category: pageCategory(pathname),
    content_key: contentKey(pathname),
    signed_in: isSignedIn(),
  });
};

export const trackPageView = (path) => {
  if (typeof window === 'undefined') return;
  const pathname = String(path || '/').split('?')[0];
  sendGaPageView(pathname);
  capture('$pageview', {
    page_category: pageCategory(pathname),
    content_key: contentKey(pathname),
    signed_in: isSignedIn(),
  });
};

export function captureNavigation(placement, destination) {
  const path = String(destination || '').split('?')[0];
  if (!path.startsWith('/')) return;
  capture('navigation_clicked', { placement, destination: path });
}

export function captureSearch({ surface, resultCount = 0, hasQuery = false }) {
  capture('search_performed', {
    surface,
    result_count: Number(resultCount) || 0,
    has_query: Boolean(hasQuery),
  });
}

export function captureFilter(filterType) {
  capture('filter_changed', { filter_type: filterType, surface: 'explore' });
}

export function captureParkSelected(parkCode, source) {
  if (!parkCode) return;
  capture('park_selected', { park_code: String(parkCode).toLowerCase(), source });
}

export function captureCompare(action, parkCount) {
  capture('compare_changed', {
    action,
    park_count: Number.isFinite(parkCount) ? parkCount : undefined,
  });
}

export function captureEventLink(url, eventId) {
  let host = null;
  try {
    host = new URL(url, 'https://www.nps.gov').host;
  } catch {
    host = null;
  }
  capture('event_link_clicked', { host, event_id: eventId ? String(eventId).slice(0, 80) : null });
}

export const logSearch = (searchQuery, resultCount = 0, searchType = 'general') => {
  const surface = searchType === 'parks' ? 'explore' : searchType === 'landing' ? 'home' : searchType;
  captureSearch({
    surface,
    resultCount,
    hasQuery: Boolean(searchQuery && String(searchQuery).trim()),
  });
};

export const logSearchResultClick = ({ parkCode, surface } = {}) => {
  captureParkSelected(parkCode, surface || 'search');
};

export const logParkCardClick = ({ parkCode, surface } = {}) => {
  captureParkSelected(parkCode, surface || 'explore');
};

export const logParkView = (parkCode, _parkName, source = 'direct') => {
  captureParkSelected(parkCode, source || 'direct');
};

export const logDiscoverClick = ({ dimension, slug } = {}) => {
  capture('discover_opened', { dimension, slug });
};

export const logExploreFilterChange = ({ filterType } = {}) => {
  captureFilter(filterType || 'unknown');
};

export const logEvent = (category, action, label) => {
  if (category === 'Compare' && action === 'add_park') {
    captureCompare('park_added');
    return;
  }
  if (category === 'Compare' && action === 'remove_park') {
    captureCompare('park_removed');
    return;
  }
  if (category === 'Compare' && action === 'copy_link') {
    const count = typeof label === 'string' ? label.split(',').filter(Boolean).length : undefined;
    captureCompare('link_copied', count);
  }
};

export const trackEvent = logEvent;

export const logCtaClick = ({ surface, destination, parkCode } = {}) => {
  if (parkCode) {
    captureParkSelected(parkCode, surface || 'park');
    return;
  }
  if (destination) captureNavigation(surface || 'cta', destination);
};

export const logDistributionCta = ({ destination } = {}) => {
  if (destination) captureNavigation('distribution', destination);
};

export const logPlanAiSessionStart = () => {
  capture('trailie_chat_started', { signed_in: isSignedIn() });
};

export const logTrailieMessageSubmitted = ({ messageLength = 0, turnIndex = null } = {}) => {
  capture('trailie_message_submitted', {
    signed_in: isSignedIn(),
    message_length: Number(messageLength) || 0,
    turn_index: Number.isFinite(turnIndex) ? turnIndex : undefined,
  });
};

export const logAIChat = (message, responseTime = 0, success = true, extra = {}) => {
  capture('trailie_response_completed', {
    outcome: success ? 'success' : 'failed',
    duration_ms: Math.max(0, Number(responseTime) || 0),
    message_length: typeof message === 'string' ? message.length : 0,
    has_itinerary: Boolean(extra?.hasItinerary),
    signed_in: isSignedIn(),
  });
};

export const logItineraryOpened = () => {
  capture('itinerary_opened', { signed_in: isSignedIn() });
};

export const logItineraryRevised = (surface = 'workspace') => {
  capture('itinerary_revised', { surface, signed_in: isSignedIn() });
};

export const logGuestLimitReached = () => {
  capture('guest_limit_reached', { signed_in: false });
};

export const logSampleItineraryOpened = (slug) => {
  capture('itinerary_sample_opened', { slug });
};

export const logDemoStarted = (scenarioId) => {
  capture('demo_started', { scenario_id: scenarioId });
};

export const logSavedTripOpened = (hasItinerary = false) => {
  capture('saved_trip_opened', { has_itinerary: Boolean(hasItinerary), signed_in: true });
};

export const logTripArchiveChanged = (action) => {
  capture('trip_archive_changed', { action, signed_in: true });
};

export const logUserSignup = (userId = null) => {
  capture('signup_completed', { signed_in: true });
  identifyPostHog(userId);
};

export const logUserLogin = (userId = null) => {
  capture('login_completed', { signed_in: true });
  identifyPostHog(userId);
};

export const logUserLogout = () => {
  resetPostHog();
};

export const logAnonymousChatMigrated = () => {
  capture('guest_trip_transferred', { signed_in: true });
};

export const logLoginPromptShown = () => {};

export const logVoiceSessionStart = () => {
  capture('voice_started', { signed_in: isSignedIn() });
};

export const logWhereNext = (action, metadata = {}) => {
  if (action === 'where_next_search_query') {
    captureSearch({ surface: 'where_next', resultCount: 0, hasQuery: true });
    return;
  }
  if (action === 'where_next_destination_selected' || action === 'where_next_park_click') {
    capture('where_next_selected', {
      park_code: metadata.parkCode || null,
      matched: Boolean(metadata.parkCode || metadata.matched),
      source: 'where_next',
    });
    return;
  }
  if (action === 'where_next_trailie_click') {
    captureNavigation('where_next', '/plan-ai');
  }
};

export const logNewsletterSignup = (action) => {
  if (action === 'newsletter_signup_success') {
    capture('newsletter_signup_completed', { surface: 'newsletter' });
  }
};

export const logBlogView = () => {};
export const logParkTabView = () => {};
export const logParkEngagement = () => {};
export const logUserAction = () => {};
export const logShare = () => {};
export const logWeatherWidgetUsage = () => {};
export const logAIFeedback = () => {};
export const logTripShareCreated = () => {};
export const logEventView = () => {};
export const logEventRegister = () => {};
export const logReviewCreate = () => {};
export const logError = () => {};
export const trackCustomEvent = () => {};
export const trackParkSave = () => {};
export const trackImageUpload = () => {};
export const emitProductEvent = () => {};
export const getAnalyticsSessionId = () => 'local';

export const optOutAnalytics = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('analytics_opt_out', 'true');
  const id = gaId();
  if (id) window[`ga-disable-${id}`] = true;
  optOutPostHog();
};

export const optInAnalytics = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem('analytics_opt_out');
  const id = gaId();
  if (id) window[`ga-disable-${id}`] = false;
  optInPostHog();
};
