/**
 * Performance Monitor Service
 * Tracks API usage, cache performance, and provides optimization insights
 */

import globalCacheManager from './globalCacheManager';

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      apiCalls: {
        total: 0,
        cached: 0,
        network: 0,
        failed: 0,
        byType: {}
      },
      cache: {
        hits: 0,
        misses: 0,
        hitRate: 0,
        size: 0,
        types: {}
      },
      performance: {
        averageResponseTime: 0,
        slowestRequests: [],
        fastestRequests: []
      },
      userBehavior: {
        pageViews: 0,
        parkViews: 0,
        searches: 0,
        sessionDuration: 0
      }
    };
    
    this.sessionStart = Date.now();
    this.requestTimes = new Map();
    
    this.initializeMonitoring();
    this.startPeriodicReporting();
  }

  /**
   * Initialize performance monitoring
   */
  initializeMonitoring() {
    // Monitor API calls
    this.monitorApiCalls();
    
    // Monitor cache performance
    this.monitorCachePerformance();
    
    // Monitor user behavior
    this.monitorUserBehavior();
    
    // Monitor page performance
    this.monitorPagePerformance();
  }

  /**
   * Monitor API calls
   */
  monitorApiCalls() {
    // Override fetch to monitor API calls
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const startTime = performance.now();
      const url = args[0];
      
      try {
        const response = await originalFetch(...args);
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        this.recordApiCall(url, duration, response.ok, response.status);
        
        return response;
      } catch (_error) {
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        this.recordApiCall(url, duration, false, 0, _error.message);
        
        throw _error;
      }
    };
  }

  /**
   * Record API call metrics
   */
  recordApiCall(url, duration, success, status, _error = null) {
    this.metrics.apiCalls.total++;
    
    if (success) {
      this.metrics.apiCalls.network++;
    } else {
      this.metrics.apiCalls.failed++;
    }
    
    // Determine API type
    const apiType = this.getApiType(url);
    if (!this.metrics.apiCalls.byType[apiType]) {
      this.metrics.apiCalls.byType[apiType] = {
        total: 0,
        cached: 0,
        network: 0,
        failed: 0,
        averageTime: 0
      };
    }
    
    this.metrics.apiCalls.byType[apiType].total++;
    if (success) {
      this.metrics.apiCalls.byType[apiType].network++;
    } else {
      this.metrics.apiCalls.byType[apiType].failed++;
    }
    
    // Update average response time
    this.updateAverageResponseTime(duration);
    
    // Track slowest/fastest requests
    this.trackRequestPerformance(url, duration, success);
  }

  /**
   * Get API type from URL
   */
  getApiType(url) {
    if (url.includes('openweathermap.org')) return 'weather';
    if (url.includes('developer.nps.gov')) return 'nps';
    if (url.includes('/api/parks')) return 'parks';
    if (url.includes('/api/weather')) return 'weather';
    if (url.includes('/api/events')) return 'events';
    if (url.includes('/api/reviews')) return 'reviews';
    return 'other';
  }

  /**
   * Update average response time
   */
  updateAverageResponseTime(duration) {
    const total = this.metrics.apiCalls.total;
    const current = this.metrics.performance.averageResponseTime;
    this.metrics.performance.averageResponseTime = 
      (current * (total - 1) + duration) / total;
  }

  /**
   * Track request performance
   */
  trackRequestPerformance(url, duration, success) {
    const request = { url, duration, success, timestamp: Date.now() };
    
    // Track slowest requests
    this.metrics.performance.slowestRequests.push(request);
    this.metrics.performance.slowestRequests.sort((a, b) => b.duration - a.duration);
    this.metrics.performance.slowestRequests = this.metrics.performance.slowestRequests.slice(0, 10);
    
    // Track fastest requests
    this.metrics.performance.fastestRequests.push(request);
    this.metrics.performance.fastestRequests.sort((a, b) => a.duration - b.duration);
    this.metrics.performance.fastestRequests = this.metrics.performance.fastestRequests.slice(0, 10);
  }

  /**
   * Monitor cache performance
   */
  monitorCachePerformance() {
    // Get cache stats from global cache manager
    setInterval(() => {
      const cacheStats = globalCacheManager.getStats();
      this.metrics.cache = {
        ...this.metrics.cache,
        ...cacheStats
      };
    }, 5000);
  }

  /**
   * Monitor user behavior
   */
  monitorUserBehavior() {
    // Track page views
    let pageViewCount = 0;
    const trackPageView = () => {
      pageViewCount++;
      this.metrics.userBehavior.pageViews = pageViewCount;
    };
    
    // Track route changes
    window.addEventListener('popstate', trackPageView);
    
    // Track park views (this would be called from park detail pages)
    window.addEventListener('parkView', (_event) => {
      this.metrics.userBehavior.parkViews++;
    });
    
    // Track searches (this would be called from search components)
    window.addEventListener('search', (_event) => {
      this.metrics.userBehavior.searches++;
    });
  }

  /**
   * Monitor page performance
   */
  monitorPagePerformance() {
    // Monitor Core Web Vitals
    if ('PerformanceObserver' in window) {
      // Largest Contentful Paint
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          console.log('LCP:', entry.startTime);
        }
      }).observe({ entryTypes: ['largest-contentful-paint'] });
      
      // First Input Delay
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          console.log('FID:', entry.processingStart - entry.startTime);
        }
      }).observe({ entryTypes: ['first-input'] });
      
      // Cumulative Layout Shift
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            console.log('CLS:', entry.value);
          }
        }
      }).observe({ entryTypes: ['layout-shift'] });
    }
  }

  /**
   * Start periodic reporting
   */
  startPeriodicReporting() {
    // Report metrics every 30 seconds
    setInterval(() => {
      this.reportMetrics();
    }, 30000);
    
    // Report on page unload
    window.addEventListener('beforeunload', () => {
      this.reportMetrics(true);
    });
  }

  /**
   * Report performance metrics
   */
  reportMetrics(isFinal = false) {
    const sessionDuration = Date.now() - this.sessionStart;
    this.metrics.userBehavior.sessionDuration = sessionDuration;
    
    const report = {
      timestamp: new Date().toISOString(),
      sessionDuration,
      isFinal,
      metrics: { ...this.metrics }
    };
    
    // Calculate cache hit rate
    const totalCacheRequests = this.metrics.cache.hits + this.metrics.cache.misses;
    if (totalCacheRequests > 0) {
      this.metrics.cache.hitRate = (this.metrics.cache.hits / totalCacheRequests) * 100;
    }
    
    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.group('🚀 Performance Metrics');
      console.log('API Calls:', this.metrics.apiCalls);
      console.log('Cache Performance:', this.metrics.cache);
      console.log('User Behavior:', this.metrics.userBehavior);
      console.log('Average Response Time:', `${this.metrics.performance.averageResponseTime.toFixed(2)}ms`);
      console.groupEnd();
    }
    
    // Send to analytics (if configured)
    this.sendToAnalytics(report);
  }

  /**
   * Send metrics to analytics
   */
  sendToAnalytics(report) {
    // This would integrate with your analytics service
    // For now, we'll just store in localStorage for debugging
    try {
      const existingReports = JSON.parse(localStorage.getItem('performance_reports') || '[]');
      existingReports.push(report);
      
      // Keep only last 10 reports
      if (existingReports.length > 10) {
        existingReports.shift();
      }
      
      localStorage.setItem('performance_reports', JSON.stringify(existingReports));
    } catch (error) {
      console.warn('Failed to store performance report:', error);
    }
  }

  /**
   * Get performance insights
   */
  getInsights() {
    const insights = [];
    
    // Cache hit rate insights
    if (this.metrics.cache.hitRate < 50) {
      insights.push({
        type: 'warning',
        message: 'Low cache hit rate. Consider increasing cache TTL for static data.',
        metric: 'cache_hit_rate',
        value: this.metrics.cache.hitRate
      });
    }
    
    // API response time insights
    if (this.metrics.performance.averageResponseTime > 1000) {
      insights.push({
        type: 'error',
        message: 'Slow API response times. Consider optimizing backend or using CDN.',
        metric: 'response_time',
        value: this.metrics.performance.averageResponseTime
      });
    }
    
    // Failed requests insights
    const failureRate = (this.metrics.apiCalls.failed / this.metrics.apiCalls.total) * 100;
    if (failureRate > 5) {
      insights.push({
        type: 'error',
        message: 'High API failure rate. Check network connectivity and API endpoints.',
        metric: 'failure_rate',
        value: failureRate
      });
    }
    
    return insights;
  }

  /**
   * Get optimization recommendations
   */
  getOptimizationRecommendations() {
    const recommendations = [];
    
    // Cache optimization
    if (this.metrics.cache.hitRate < 70) {
      recommendations.push({
        category: 'caching',
        priority: 'high',
        title: 'Improve Cache Hit Rate',
        description: 'Increase cache TTL for static data like parks and park details.',
        impact: 'Reduce API calls by 30-50%'
      });
    }
    
    // Prefetching optimization
    if (this.metrics.userBehavior.parkViews > 5) {
      recommendations.push({
        category: 'prefetching',
        priority: 'medium',
        title: 'Enable Smart Prefetching',
        description: 'Prefetch related park data based on user behavior.',
        impact: 'Improve perceived performance by 40%'
      });
    }
    
    // API optimization
    if (this.metrics.performance.averageResponseTime > 500) {
      recommendations.push({
        category: 'api',
        priority: 'high',
        title: 'Optimize API Response Times',
        description: 'Implement request batching and response compression.',
        impact: 'Reduce response time by 50%'
      });
    }
    
    return recommendations;
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      apiCalls: {
        total: 0,
        cached: 0,
        network: 0,
        failed: 0,
        byType: {}
      },
      cache: {
        hits: 0,
        misses: 0,
        hitRate: 0,
        size: 0,
        types: {}
      },
      performance: {
        averageResponseTime: 0,
        slowestRequests: [],
        fastestRequests: []
      },
      userBehavior: {
        pageViews: 0,
        parkViews: 0,
        searches: 0,
        sessionDuration: 0
      }
    };
    
    this.sessionStart = Date.now();
  }
}

// Create singleton instance
const performanceMonitor = new PerformanceMonitor();

export default performanceMonitor;
