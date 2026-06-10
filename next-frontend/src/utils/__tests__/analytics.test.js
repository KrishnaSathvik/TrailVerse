import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('react-ga4', () => ({
  default: {
    initialize: vi.fn(),
    send: vi.fn(),
    event: vi.fn(),
  },
}));

const mockVercelTrack = vi.fn();
vi.mock('@vercel/analytics', () => ({
  track: (...args) => mockVercelTrack(...args),
}));

const mockFetch = vi.fn(() => Promise.resolve({ ok: true }));
global.fetch = mockFetch;

import {
  initGA,
  trackPageView,
  trackEvent,
  logPageView,
  logEvent,
  logParkView,
  logSearch,
  logShare,
  logAIChat,
  logBlogView,
  logEventView,
  logUserAction,
  logCtaClick,
  logParkEngagement,
  sanitizeVercelEventData,
  trackVercel,
  isAnalyticsAllowed,
} from '../analytics';
import ReactGA from 'react-ga4';

const mockLocation = {
  href: 'http://localhost:3000/test',
  pathname: '/test',
  search: '',
  hash: '',
};
Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true,
});

const mockConsoleLog = vi.fn();
global.console.log = mockConsoleLog;

describe('Analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    localStorage.removeItem('analytics_opt_out');
    localStorage.removeItem('user');
    sessionStorage.removeItem('tv_session_id');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initGA', () => {
    it('should initialize GA when tracking ID is provided', () => {
      vi.stubEnv('NEXT_PUBLIC_GA_TRACKING_ID', 'G-TEST123');
      initGA();
      expect(ReactGA.initialize).toHaveBeenCalledWith('G-TEST123', {
        gaOptions: { siteSpeedSampleRate: 100 },
      });
    });

    it('should not initialize GA when tracking ID is not provided', () => {
      initGA();
      expect(ReactGA.initialize).not.toHaveBeenCalled();
    });
  });

  describe('page views', () => {
    it('trackPageView sends GA pageview', () => {
      trackPageView('/custom-path');
      expect(ReactGA.send).toHaveBeenCalledWith({
        hitType: 'pageview',
        page: '/custom-path',
      });
    });

    it('logPageView uses current location', () => {
      logPageView();
      expect(ReactGA.send).toHaveBeenCalledWith({
        hitType: 'pageview',
        page: '/test',
      });
    });
  });

  describe('emitProductEvent via logEvent', () => {
    it('sends GA, Vercel, and queues backend', () => {
      logEvent('Auth', 'login_success', 'email');
      expect(ReactGA.event).toHaveBeenCalledWith(expect.objectContaining({
        category: 'Auth',
        action: 'login_success',
        label: 'email',
      }));
      expect(mockVercelTrack).toHaveBeenCalledWith('auth_login_success', expect.objectContaining({
        label: 'email',
        user_type: 'anonymous',
      }));
    });
  });

  describe('trackEvent', () => {
    it('delegates to logEvent pipeline', () => {
      trackEvent('button', 'click', 'signup');
      expect(mockVercelTrack).toHaveBeenCalledWith('button_click', expect.any(Object));
    });
  });

  describe('content events', () => {
    it('logParkView hits all channels', () => {
      logParkView('yose', 'Yosemite National Park');
      expect(ReactGA.event).toHaveBeenCalled();
      expect(mockVercelTrack).toHaveBeenCalledWith('park_view', expect.objectContaining({
        park_code: 'yose',
        source: 'unknown',
      }));
    });

    it('logSearch hits Vercel with search metadata', () => {
      logSearch('hiking trails', 5, 'landing');
      expect(mockVercelTrack).toHaveBeenCalledWith('search_query', expect.objectContaining({
        search_type: 'landing',
        result_count: 5,
        has_results: true,
      }));
    });

    it('logShare hits Vercel', () => {
      logShare('facebook', 'park details', 'park');
      expect(mockVercelTrack).toHaveBeenCalledWith('share', expect.objectContaining({
        platform: 'facebook',
        content_type: 'park',
      }));
    });

    it('logAIChat distinguishes success and error', () => {
      logAIChat('hello', 1200, true);
      expect(mockVercelTrack).toHaveBeenCalledWith('ai_chat_success', expect.objectContaining({
        message_length: 5,
        response_time_ms: 1200,
      }));
      logAIChat('hello', 0, false);
      expect(mockVercelTrack).toHaveBeenCalledWith('ai_chat_error', expect.any(Object));
    });

    it('logBlogView hits Vercel', () => {
      logBlogView('Top 10 National Parks', 'blog-1', 'guides');
      expect(mockVercelTrack).toHaveBeenCalledWith('blog_view', expect.objectContaining({
        blog_id: 'blog-1',
        category: 'guides',
      }));
    });

    it('logEventView hits Vercel', () => {
      logEventView('Ranger Talk', 'evt-1', 'yell');
      expect(mockVercelTrack).toHaveBeenCalledWith('event_view', expect.objectContaining({
        event_id: 'evt-1',
        park_code: 'yell',
      }));
    });
  });

  describe('engagement events', () => {
    it('logUserAction hits Vercel', () => {
      logUserAction('review_prompt_shown', 'Yosemite');
      expect(mockVercelTrack).toHaveBeenCalledWith('user_review_prompt_shown', expect.any(Object));
    });

    it('logParkEngagement uses structured park events', () => {
      logParkEngagement({ action: 'favorite_add', parkCode: 'yell', parkName: 'Yellowstone' });
      expect(mockVercelTrack).toHaveBeenCalledWith('park_favorite_add', expect.objectContaining({
        park_code: 'yell',
      }));
    });

    it('logCtaClick includes surface and destination', () => {
      logCtaClick({
        ctaId: 'plan_with_trailie',
        label: 'Plan with Trailie',
        surface: 'park_hero',
        destination: '/plan-ai',
        parkCode: 'yell',
      });
      expect(mockVercelTrack).toHaveBeenCalledWith('cta_click', expect.objectContaining({
        cta_id: 'plan_with_trailie',
        surface: 'park_hero',
        park_code: 'yell',
      }));
    });
  });

  describe('privacy', () => {
    it('sanitizeVercelEventData truncates long strings', () => {
      const long = 'x'.repeat(300);
      expect(sanitizeVercelEventData({ label: long })).toEqual({
        label: 'x'.repeat(255),
      });
    });

    it('trackVercel respects opt-out', () => {
      localStorage.setItem('analytics_opt_out', 'true');
      trackVercel('test_event', { surface: 'hero' });
      expect(mockVercelTrack).not.toHaveBeenCalled();
      expect(isAnalyticsAllowed()).toBe(false);
    });

    it('blocks GA when opted out', () => {
      localStorage.setItem('analytics_opt_out', 'true');
      logEvent('Auth', 'login_success', 'email');
      expect(ReactGA.event).not.toHaveBeenCalled();
      expect(mockVercelTrack).not.toHaveBeenCalled();
    });
  });
});
