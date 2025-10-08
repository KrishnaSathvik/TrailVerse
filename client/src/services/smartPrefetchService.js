/**
 * Smart Prefetch Service
 * Intelligently prefetches data based on user behavior and navigation patterns
 */

import globalCacheManager from './globalCacheManager';
import npsApi from './npsApi';
import weatherService from './weatherService.ts';

class SmartPrefetchService {
  constructor() {
    this.userBehavior = {
      viewedParks: new Set(),
      searchHistory: [],
      navigationPattern: [],
      lastActivity: Date.now()
    };
    
    this.prefetchQueue = new Set();
    this.isPrefetching = false;
    
    this.initializeBehaviorTracking();
    this.startSmartPrefetching();
  }

  /**
   * Initialize user behavior tracking
   */
  initializeBehaviorTracking() {
    // Track page views
    this.trackPageView();
    
    // Track search queries
    this.trackSearchQueries();
    
    // Track park views
    this.trackParkViews();
    
    // Track navigation patterns
    this.trackNavigation();
  }

  /**
   * Track page views for prefetching
   */
  trackPageView() {
    const currentPath = window.location.pathname;
    this.userBehavior.navigationPattern.push({
      path: currentPath,
      timestamp: Date.now()
    });
    
    // Keep only last 10 navigation events
    if (this.userBehavior.navigationPattern.length > 10) {
      this.userBehavior.navigationPattern.shift();
    }
  }

  /**
   * Track search queries
   */
  trackSearchQueries() {
    // This would be called from search components
    // For now, we'll set up the infrastructure
  }

  /**
   * Track park views
   */
  trackParkViews() {
    // This would be called when users view park details
    // For now, we'll set up the infrastructure
  }

  /**
   * Track navigation patterns
   */
  trackNavigation() {
    // Listen for route changes
    window.addEventListener('popstate', () => {
      this.trackPageView();
    });
  }

  /**
   * Start smart prefetching based on user behavior
   */
  startSmartPrefetching() {
    // Prefetch on idle
    this.prefetchOnIdle();
    
    // Prefetch on user interaction
    this.prefetchOnInteraction();
    
    // Prefetch popular content
    this.prefetchPopularContent();
  }

  /**
   * Prefetch when browser is idle
   */
  prefetchOnIdle() {
    if ('requestIdleCallback' in window) {
      const prefetchWhenIdle = () => {
        if (!this.isPrefetching) {
          this.executeSmartPrefetch();
        }
        requestIdleCallback(prefetchWhenIdle, { timeout: 5000 });
      };
      requestIdleCallback(prefetchWhenIdle);
    } else {
      // Fallback for browsers without requestIdleCallback
      setTimeout(() => {
        if (!this.isPrefetching) {
          this.executeSmartPrefetch();
        }
      }, 2000);
    }
  }

  /**
   * Prefetch on user interaction
   */
  prefetchOnInteraction() {
    let interactionTimeout;
    
    const handleInteraction = () => {
      clearTimeout(interactionTimeout);
      interactionTimeout = setTimeout(() => {
        if (!this.isPrefetching) {
          this.executeSmartPrefetch();
        }
      }, 1000);
    };
    
    // Listen for user interactions
    ['mousemove', 'scroll', 'keydown', 'touchstart'].forEach(event => {
      document.addEventListener(event, handleInteraction, { passive: true });
    });
  }

  /**
   * Prefetch popular content
   */
  async prefetchPopularContent() {
    // Popular national parks that users frequently visit
    const popularParks = [
      'acad', 'arch', 'badl', 'bisc', 'blca', 'brca', 'cany', 'care', 'carl', 'cave',
      'chis', 'cong', 'crla', 'cuva', 'dena', 'drto', 'ever', 'foth', 'gaar', 'jeff',
      'glac', 'glba', 'grca', 'grte', 'grsa', 'grsm', 'gumo', 'hale', 'havo', 'hosp',
      'indu', 'isro', 'jotr', 'katm', 'kefj', 'kica', 'kowa', 'lacl', 'lavo', 'maca',
      'meve', 'mora', 'npnh', 'npsa', 'olym', 'pefo', 'pinn', 'redw', 'romo', 'sagu',
      'seki', 'shen', 'thro', 'viis', 'voya', 'whsa', 'wica', 'wrst', 'yell', 'yose',
      'zion'
    ];
    
    // Prefetch data for top 10 most popular parks
    const topParks = popularParks.slice(0, 10);
    
    for (const parkCode of topParks) {
      this.prefetchParkData(parkCode);
    }
  }

  /**
   * Execute smart prefetch based on user behavior
   */
  async executeSmartPrefetch() {
    if (this.isPrefetching) return;
    
    this.isPrefetching = true;
    
    try {
      // Prefetch based on navigation patterns
      await this.prefetchBasedOnNavigation();
      
      // Prefetch based on viewed parks
      await this.prefetchRelatedParks();
      
      // Prefetch weather for viewed parks
      await this.prefetchWeatherForViewedParks();
      
    } catch (error) {
      console.warn('Smart prefetch error:', error);
    } finally {
      this.isPrefetching = false;
    }
  }

  /**
   * Prefetch based on navigation patterns
   */
  async prefetchBasedOnNavigation() {
    const currentPath = window.location.pathname;
    
    // If user is on explore page, prefetch park details for visible parks
    if (currentPath === '/explore') {
      await this.prefetchVisibleParks();
    }
    
    // If user is on park detail page, prefetch related parks
    if (currentPath.startsWith('/parks/')) {
      const parkCode = currentPath.split('/')[2];
      if (parkCode) {
        await this.prefetchRelatedParksForPark(parkCode);
      }
    }
  }

  /**
   * Prefetch visible parks on explore page
   */
  async prefetchVisibleParks() {
    // This would integrate with the explore page to prefetch
    // parks that are currently visible in the viewport
    // For now, we'll prefetch a few popular parks
    const visibleParks = ['acad', 'arch', 'badl', 'crla', 'dena'];
    
    for (const parkCode of visibleParks) {
      this.prefetchParkData(parkCode);
    }
  }

  /**
   * Prefetch related parks for a specific park
   */
  async prefetchRelatedParksForPark(parkCode) {
    // Parks in the same state or region
    const relatedParks = this.getRelatedParks(parkCode);
    
    for (const relatedParkCode of relatedParks) {
      this.prefetchParkData(relatedParkCode);
    }
  }

  /**
   * Get related parks based on location or type
   */
  getRelatedParks(parkCode) {
    // This would be more sophisticated in a real implementation
    // For now, return some related parks
    const relatedMap = {
      'acad': ['kata', 'bisc'],
      'arch': ['cany', 'zion'],
      'badl': ['wind', 'jeca'],
      'crla': ['olym', 'mora'],
      'dena': ['wrst', 'kefj']
    };
    
    return relatedMap[parkCode] || [];
  }

  /**
   * Prefetch park data
   */
  async prefetchParkData(parkCode) {
    if (this.prefetchQueue.has(parkCode)) return;
    
    this.prefetchQueue.add(parkCode);
    
    try {
      // Prefetch park details
      await globalCacheManager.prefetch(
        `park-details-${parkCode}`,
        'parkDetails',
        () => npsApi.getParkDetails(parkCode)
      );
      
      // Prefetch park alerts
      await globalCacheManager.prefetch(
        `park-alerts-${parkCode}`,
        'parkAlerts',
        () => npsApi.getParkAlerts(parkCode)
      );
      
    } catch (error) {
      console.warn(`Failed to prefetch data for park ${parkCode}:`, error);
    } finally {
      this.prefetchQueue.delete(parkCode);
    }
  }

  /**
   * Prefetch weather for viewed parks
   */
  async prefetchWeatherForViewedParks() {
    // This would need park coordinates
    // For now, we'll prefetch weather for popular parks
    const parksWithWeather = [
      { code: 'acad', lat: 44.3386, lon: -68.2733 },
      { code: 'arch', lat: 38.7331, lon: -109.5925 },
      { code: 'badl', lat: 43.8554, lon: -102.3397 },
      { code: 'crla', lat: 42.8684, lon: -122.1685 },
      { code: 'dena', lat: 63.1148, lon: -151.1926 }
    ];
    
    for (const park of parksWithWeather) {
      if (this.userBehavior.viewedParks.has(park.code)) {
        await weatherService.prefetchWeatherData(park.lat, park.lon);
      }
    }
  }

  /**
   * Prefetch related parks based on viewed parks
   */
  async prefetchRelatedParks() {
    for (const viewedPark of this.userBehavior.viewedParks) {
      const relatedParks = this.getRelatedParks(viewedPark);
      for (const relatedPark of relatedParks) {
        this.prefetchParkData(relatedPark);
      }
    }
  }

  /**
   * Record user viewing a park
   */
  recordParkView(parkCode) {
    this.userBehavior.viewedParks.add(parkCode);
    this.userBehavior.lastActivity = Date.now();
    
    // Keep only last 20 viewed parks
    if (this.userBehavior.viewedParks.size > 20) {
      const firstPark = this.userBehavior.viewedParks.values().next().value;
      this.userBehavior.viewedParks.delete(firstPark);
    }
    
    // Trigger smart prefetch
    setTimeout(() => {
      if (!this.isPrefetching) {
        this.executeSmartPrefetch();
      }
    }, 1000);
  }

  /**
   * Record search query
   */
  recordSearchQuery(query) {
    this.userBehavior.searchHistory.push({
      query,
      timestamp: Date.now()
    });
    
    // Keep only last 10 searches
    if (this.userBehavior.searchHistory.length > 10) {
      this.userBehavior.searchHistory.shift();
    }
  }

  /**
   * Get prefetch statistics
   */
  getStats() {
    return {
      viewedParks: this.userBehavior.viewedParks.size,
      searchHistory: this.userBehavior.searchHistory.length,
      navigationPattern: this.userBehavior.navigationPattern.length,
      prefetchQueue: this.prefetchQueue.size,
      isPrefetching: this.isPrefetching
    };
  }
}

// Create singleton instance
const smartPrefetchService = new SmartPrefetchService();

export default smartPrefetchService;
