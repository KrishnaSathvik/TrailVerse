import { beforeEach, describe, expect, it, vi } from 'vitest';

const capture = vi.fn();
const identify = vi.fn();
const reset = vi.fn();
const optOut = vi.fn();
const optIn = vi.fn();

vi.mock('@/lib/posthogClient', () => ({
  initPostHog: vi.fn(),
  capturePostHog: (...args) => capture(...args),
  identifyPostHog: (...args) => identify(...args),
  resetPostHog: (...args) => reset(...args),
  optOutPostHog: (...args) => optOut(...args),
  optInPostHog: (...args) => optIn(...args),
}));

import {
  captureSearch,
  isAnalyticsAllowed,
  logAIChat,
  logPageView,
  logSearch,
  logUserLogin,
  logUserLogout,
  optOutAnalytics,
  pageCategory,
  trackPageView,
} from '../analytics';

describe('analytics', () => {
  beforeEach(() => {
    capture.mockClear();
    identify.mockClear();
    reset.mockClear();
    window.localStorage.clear();
    window.gtag = vi.fn();
    window.history.pushState({}, '', '/explore?q=yellowstone');
  });

  it('sends one GA pageview and one PostHog page_viewed without the query string', () => {
    logPageView();
    expect(window.gtag).toHaveBeenCalledTimes(1);
    expect(window.gtag).toHaveBeenCalledWith('event', 'page_view', expect.objectContaining({
      page_path: '/explore',
      page_location: expect.stringMatching(/\/explore$/),
    }));
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith('page_viewed', expect.objectContaining({
      page_category: 'explore',
      signed_in: false,
    }));
    const payload = JSON.stringify(capture.mock.calls);
    expect(payload).not.toContain('yellowstone');
  });

  it('does not send a second pageview for the same explicit path helper beyond one call', () => {
    trackPageView('/parks/yellowstone-national-park?tab=alerts');
    expect(window.gtag).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith('page_viewed', expect.objectContaining({
      page_category: 'park',
      content_key: 'yellowstone-national-park',
    }));
  });

  it('classifies the main site sections', () => {
    expect(pageCategory('/')).toBe('home');
    expect(pageCategory('/map')).toBe('map');
    expect(pageCategory('/plan-ai/abc')).toBe('trailie');
    expect(pageCategory('/blog/best-hikes')).toBe('blog');
    expect(pageCategory('/trailie-demo')).toBe('demo');
    expect(pageCategory('/itineraries/zion-weekend')).toBe('itineraries');
    expect(pageCategory('/discover/activity/hiking')).toBe('discover');
    expect(pageCategory('/compare')).toBe('compare');
    expect(pageCategory('/events')).toBe('events');
    expect(pageCategory('/where-next')).toBe('where_next');
    expect(pageCategory('/privacy')).toBe('info');
  });

  it('records search outcome without the query text', () => {
    logSearch('hidden canyon query', 4, 'parks');
    captureSearch({ surface: 'map', resultCount: 2, hasQuery: true });
    expect(capture).toHaveBeenNthCalledWith(1, 'search_performed', {
      surface: 'explore',
      result_count: 4,
      has_query: true,
    });
    expect(JSON.stringify(capture.mock.calls)).not.toContain('hidden canyon');
  });

  it('records Trailie outcome without message text and identifies only the user id', () => {
    logAIChat('Meet me at the secret trailhead', 1200, true, { hasItinerary: true });
    expect(capture).toHaveBeenCalledWith('trailie_response_completed', expect.objectContaining({
      outcome: 'success',
      message_length: 'Meet me at the secret trailhead'.length,
      has_itinerary: true,
      duration_ms: 1200,
    }));
    expect(JSON.stringify(capture.mock.calls)).not.toContain('secret trailhead');

    logUserLogin('507f1f77bcf86cd799439011');
    expect(identify).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
    logUserLogout();
    expect(reset).toHaveBeenCalled();
  });

  it('opt-out blocks GA and PostHog', () => {
    optOutAnalytics();
    expect(isAnalyticsAllowed()).toBe(false);
    logPageView();
    logAIChat('hello', 10, false);
    expect(window.gtag).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    expect(optOut).toHaveBeenCalled();
  });
});
