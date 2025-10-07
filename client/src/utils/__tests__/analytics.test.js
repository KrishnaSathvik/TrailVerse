import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock react-ga4
vi.mock('react-ga4', () => ({
  default: {
    initialize: vi.fn(),
    send: vi.fn(),
    event: vi.fn()
  }
}));

import { initGA, trackPageView, trackEvent, logPageView, logEvent, logParkView, logSearch, logShare, logAIChat, logBlogView, logEventView, logUserAction } from '../analytics';
import ReactGA from 'react-ga4';

// Mock window.location
const mockLocation = {
  href: 'http://localhost:3000/test',
  pathname: '/test',
  search: '',
  hash: ''
};
Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true
});

// Mock console.log
const mockConsoleLog = vi.fn();
global.console.log = mockConsoleLog;

describe('Analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment
    delete process.env.REACT_APP_GA_TRACKING_ID;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initGA', () => {
    it('should initialize GA when tracking ID is provided', () => {
      vi.stubEnv('REACT_APP_GA_TRACKING_ID', 'G-TEST123');

      initGA();

      expect(ReactGA.initialize).toHaveBeenCalledWith('G-TEST123', {
        gaOptions: {
          siteSpeedSampleRate: 100
        }
      });
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Google Analytics initialized');
    });

    it('should not initialize GA when tracking ID is not provided', () => {
      initGA();

      expect(ReactGA.initialize).not.toHaveBeenCalled();
      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should not initialize GA when tracking ID is empty', () => {
      vi.stubEnv('REACT_APP_GA_TRACKING_ID', '');

      initGA();

      expect(ReactGA.initialize).not.toHaveBeenCalled();
      expect(mockConsoleLog).not.toHaveBeenCalled();
    });
  });

  describe('trackPageView', () => {
    it('should track page view with custom path', () => {
      const customPath = '/custom-path';
      trackPageView(customPath);

      expect(ReactGA.send).toHaveBeenCalledWith({ 
        hitType: 'pageview', 
        page: customPath 
      });
    });

    it('should track page view without path', () => {
      trackPageView();

      expect(ReactGA.send).toHaveBeenCalledWith({ 
        hitType: 'pageview', 
        page: undefined 
      });
    });
  });

  describe('logPageView', () => {
    it('should log page view with current location', () => {
      logPageView();

      expect(ReactGA.send).toHaveBeenCalledWith({ 
        hitType: 'pageview', 
        page: '/test' 
      });
    });
  });

  describe('trackEvent', () => {
    it('should track event with category, action, and label', () => {
      trackEvent('button', 'click', 'signup');

      expect(ReactGA.event).toHaveBeenCalledWith({
        category: 'button',
        action: 'click',
        label: 'signup'
      });
    });
  });

  describe('logEvent', () => {
    it('should log event with category, action, and label', () => {
      logEvent('form', 'submit', 'contact');

      expect(ReactGA.event).toHaveBeenCalledWith({
        category: 'form',
        action: 'submit',
        label: 'contact'
      });
    });
  });

  describe('logParkView', () => {
    it('should log park view event', () => {
      logParkView('Yosemite National Park');

      expect(ReactGA.event).toHaveBeenCalledWith({
        category: 'Park',
        action: 'View',
        label: 'Yosemite National Park'
      });
    });
  });

  describe('logSearch', () => {
    it('should log search event', () => {
      logSearch('hiking trails');

      expect(ReactGA.event).toHaveBeenCalledWith({
        category: 'Search',
        action: 'Query',
        label: 'hiking trails'
      });
    });
  });

  describe('logShare', () => {
    it('should log share event', () => {
      logShare('facebook', 'park details');

      expect(ReactGA.event).toHaveBeenCalledWith({
        category: 'Share',
        action: 'facebook',
        label: 'park details'
      });
    });
  });

  describe('logAIChat', () => {
    it('should log AI chat event', () => {
      logAIChat('best hiking trails');

      expect(ReactGA.event).toHaveBeenCalledWith({
        category: 'AI',
        action: 'Chat',
        label: 'best hiking trails'
      });
    });
  });

  describe('logBlogView', () => {
    it('should log blog view event', () => {
      logBlogView('Top 10 National Parks');

      expect(ReactGA.event).toHaveBeenCalledWith({
        category: 'Blog',
        action: 'View',
        label: 'Top 10 National Parks'
      });
    });
  });

  describe('logEventView', () => {
    it('should log event view', () => {
      logEventView('Ranger Talk');

      expect(ReactGA.event).toHaveBeenCalledWith({
        category: 'Event',
        action: 'View',
        label: 'Ranger Talk'
      });
    });
  });

  describe('logUserAction', () => {
    it('should log user action', () => {
      logUserAction('login', 'success');

      expect(ReactGA.event).toHaveBeenCalledWith({
        category: 'User',
        action: 'login',
        label: 'success'
      });
    });
  });

  describe('Error handling', () => {
    it('should not initialize GA when tracking ID is not provided', () => {
      vi.unstubAllEnvs();
      
      initGA();

      expect(ReactGA.initialize).not.toHaveBeenCalled();
      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should not initialize GA when tracking ID is empty', () => {
      vi.stubEnv('REACT_APP_GA_TRACKING_ID', '');
      
      initGA();

      expect(ReactGA.initialize).not.toHaveBeenCalled();
      expect(mockConsoleLog).not.toHaveBeenCalled();
    });
  });
});
