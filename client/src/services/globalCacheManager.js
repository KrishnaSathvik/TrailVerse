/**
 * Global Cache Manager - Advanced API Response Caching
 * Provides intelligent caching with background refresh, prefetching, and smart invalidation
 */

import cacheService from './cacheService';

class GlobalCacheManager {
  constructor() {
    this.prefetchQueue = new Set();
    this.backgroundRefreshQueue = new Map();
    this.cacheStats = {
      hits: 0,
      misses: 0,
      prefetches: 0,
      backgroundRefreshes: 0
    };
    
    // Enhanced cache configuration with smarter TTLs
    this.cacheConfig = {
      // NPS API - Static data with longer cache
      parks: { 
        ttl: 24 * 60 * 60 * 1000, // 24 hours
        storage: 'localStorage',
        backgroundRefresh: true,
        prefetch: true
      },
      parkDetails: { 
        ttl: 12 * 60 * 60 * 1000, // 12 hours
        storage: 'localStorage',
        backgroundRefresh: true,
        prefetch: false
      },
      parkAlerts: { 
        ttl: 5 * 60 * 1000, // 5 minutes
        storage: 'memory',
        backgroundRefresh: false,
        prefetch: false
      },
      
      // Weather API - Dynamic data with longer cache to reduce API calls
      weather: { 
        ttl: 60 * 60 * 1000, // 60 minutes (increased to reduce API calls)
        storage: 'localStorage', // Use localStorage for persistence
        backgroundRefresh: false, // Disable background refresh to avoid rate limits
        prefetch: false // Disable prefetch to avoid unnecessary calls
      },
      forecast: { 
        ttl: 120 * 60 * 1000, // 120 minutes (2 hours - forecast changes less frequently)
        storage: 'localStorage', // Use localStorage for persistence
        backgroundRefresh: false, // Disable background refresh to avoid rate limits
        prefetch: false // Disable prefetch to avoid unnecessary calls
      },
      
      // User-specific data
      userProfile: { 
        ttl: 10 * 60 * 1000, // 10 minutes
        storage: 'memory',
        backgroundRefresh: false,
        prefetch: false
      },
      favorites: { 
        ttl: 5 * 60 * 1000, // 5 minutes
        storage: 'memory',
        backgroundRefresh: false,
        prefetch: false
      },
      
      // Search and dynamic content
      search: { 
        ttl: 2 * 60 * 1000, // 2 minutes
        storage: 'memory',
        backgroundRefresh: false,
        prefetch: false
      },
      events: { 
        ttl: 10 * 60 * 1000, // 10 minutes
        storage: 'memory',
        backgroundRefresh: true,
        prefetch: false
      }
    };
    
    this.initializeBackgroundRefresh();
  }

  /**
   * Get cached data with intelligent fallback and background refresh
   */
  async get(key, type, fetchFunction, _options = {}) {
    const config = this.cacheConfig[type] || this.cacheConfig.default;
    const cacheKey = this.generateKey(key, type);
    
    // Try to get from cache first
    const cachedData = cacheService.get(cacheKey, type);
    
    if (cachedData) {
      this.cacheStats.hits++;
      
      // Check if we should background refresh
      if (config.backgroundRefresh && this.shouldBackgroundRefresh(cachedData, config)) {
        this.scheduleBackgroundRefresh(cacheKey, type, fetchFunction, _options);
      }
      
      return {
        data: cachedData,
        fromCache: true,
        stale: this.isStale(cachedData, config)
      };
    }
    
    // Cache miss - fetch fresh data
    this.cacheStats.misses++;
    return this.fetchAndCache(cacheKey, type, fetchFunction, _options);
  }

  /**
   * Fetch data and cache it
   */
  async fetchAndCache(cacheKey, type, fetchFunction, _options = {}) {
    try {
      const data = await fetchFunction();
      
      // Cache the response
      cacheService.set(cacheKey, data, type);
      
      return {
        data,
        fromCache: false,
        stale: false
      };
    } catch (error) {
      // Try to return stale data if available
      const staleData = cacheService.get(cacheKey, type);
      if (staleData) {
        return {
          data: staleData,
          fromCache: true,
          stale: true,
          error: error.message
        };
      }
      throw error;
    }
  }

  /**
   * Prefetch data for better UX
   */
  async prefetch(key, type, fetchFunction, _options = {}) {
    const config = this.cacheConfig[type];
    if (!config?.prefetch) return;
    
    const cacheKey = this.generateKey(key, type);
    
    // Don't prefetch if already cached and fresh
    const cachedData = cacheService.get(cacheKey, type);
    if (cachedData && !this.isStale(cachedData, config)) {
      return;
    }
    
    // Add to prefetch queue to avoid duplicate requests
    if (this.prefetchQueue.has(cacheKey)) {
      return;
    }
    
    this.prefetchQueue.add(cacheKey);
    
    try {
      const data = await fetchFunction();
      cacheService.set(cacheKey, data, type);
      this.cacheStats.prefetches++;
    } catch (error) {
      console.warn(`Prefetch failed for ${cacheKey}:`, error.message);
    } finally {
      this.prefetchQueue.delete(cacheKey);
    }
  }

  /**
   * Schedule background refresh for stale data
   */
  scheduleBackgroundRefresh(cacheKey, type, fetchFunction, options = {}) {
    // Avoid duplicate background refreshes
    if (this.backgroundRefreshQueue.has(cacheKey)) {
      return;
    }
    
    this.backgroundRefreshQueue.set(cacheKey, {
      type,
      fetchFunction,
      options,
      scheduledAt: Date.now()
    });
  }

  /**
   * Initialize background refresh system
   */
  initializeBackgroundRefresh() {
    // Process background refresh queue every 30 seconds
    setInterval(() => {
      this.processBackgroundRefreshQueue();
    }, 30000);
    
    // Process queue when page becomes visible
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.processBackgroundRefreshQueue();
      }
    });
  }

  /**
   * Process background refresh queue
   */
  async processBackgroundRefreshQueue() {
    const refreshPromises = [];
    
    for (const [cacheKey, refreshData] of this.backgroundRefreshQueue.entries()) {
      const { type, fetchFunction, options, scheduledAt } = refreshData;
      
      // Only refresh if scheduled more than 5 seconds ago (avoid immediate refreshes)
      if (Date.now() - scheduledAt > 5000) {
        refreshPromises.push(
          this.fetchAndCache(cacheKey, type, fetchFunction, options)
            .then(() => {
              this.backgroundRefreshQueue.delete(cacheKey);
              this.cacheStats.backgroundRefreshes++;
            })
            .catch(error => {
              console.warn(`Background refresh failed for ${cacheKey}:`, error.message);
              this.backgroundRefreshQueue.delete(cacheKey);
            })
        );
      }
    }
    
    // Process up to 3 background refreshes at a time
    const batchSize = 3;
    for (let i = 0; i < refreshPromises.length; i += batchSize) {
      const batch = refreshPromises.slice(i, i + batchSize);
      await Promise.allSettled(batch);
    }
  }

  /**
   * Check if data should be background refreshed
   */
  shouldBackgroundRefresh(cachedData, config) {
    if (!cachedData.timestamp) return false;
    
    const age = Date.now() - cachedData.timestamp;
    const refreshThreshold = config.ttl * 0.8; // Refresh when 80% of TTL has passed
    
    return age > refreshThreshold;
  }

  /**
   * Check if cached data is stale
   */
  isStale(cachedData, config) {
    if (!cachedData.timestamp) return true;
    
    const age = Date.now() - cachedData.timestamp;
    return age > config.ttl;
  }

  /**
   * Generate cache key
   */
  generateKey(key, type) {
    return `${type}:${key}`;
  }

  /**
   * Invalidate cache entries
   */
  invalidate(pattern) {
    if (typeof pattern === 'string') {
      // Invalidate by type
      cacheService.clearByType(pattern);
    } else if (pattern.key && pattern.type) {
      // Invalidate specific key
      const cacheKey = this.generateKey(pattern.key, pattern.type);
      cacheService.delete(cacheKey);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const cacheServiceStats = cacheService.getStats();
    const hitRate = this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses) * 100;
    
    return {
      ...cacheServiceStats,
      hitRate: Math.round(hitRate * 100) / 100,
      prefetches: this.cacheStats.prefetches,
      backgroundRefreshes: this.cacheStats.backgroundRefreshes,
      pendingPrefetches: this.prefetchQueue.size,
      pendingBackgroundRefreshes: this.backgroundRefreshQueue.size
    };
  }

  /**
   * Clear all cache
   */
  clear() {
    cacheService.clear();
    this.prefetchQueue.clear();
    this.backgroundRefreshQueue.clear();
    this.cacheStats = {
      hits: 0,
      misses: 0,
      prefetches: 0,
      backgroundRefreshes: 0
    };
  }

  /**
   * Smart prefetching for related data
   */
  async smartPrefetch(parkCode) {
    const prefetchPromises = [];
    
    // Prefetch related park data
    if (parkCode) {
      // Prefetch park details if not already cached
      const parkDetailsKey = `parkDetails:${parkCode}`;
      const parkDetailsCached = cacheService.get(parkDetailsKey, 'parkDetails');
      if (!parkDetailsCached) {
        prefetchPromises.push(
          this.prefetch(
            parkCode,
            'parkDetails',
            () => import('./npsApi').then(module => module.default.getParkDetails(parkCode))
          )
        );
      }
      
      // Prefetch park alerts
      prefetchPromises.push(
        this.prefetch(
          parkCode,
          'parkAlerts',
          () => import('./npsApi').then(module => module.default.getParkAlerts(parkCode))
        )
      );
    }
    
    // Prefetch weather for popular parks (if coordinates available)
    const popularParks = ['acad', 'arch', 'badl', 'crla', 'dena', 'ever', 'glac', 'grca', 'grte', 'olym'];
    if (popularParks.includes(parkCode)) {
      // This would need park coordinates - implement based on your data structure
      // prefetchPromises.push(this.prefetchWeatherForPark(parkCode));
    }
    
    await Promise.allSettled(prefetchPromises);
  }
}

// Create singleton instance
const globalCacheManager = new GlobalCacheManager();

export default globalCacheManager;
