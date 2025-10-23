/**
 * Comprehensive Caching Service
 * Provides unified caching across all API services with multiple storage backends
 */

class CacheService {
  constructor() {
    this.memoryCache = new Map();
    this.storagePrefix = 'npe_cache_';
    this.defaultTTL = 5 * 60 * 1000; // 5 minutes
    this.maxMemorySize = 100; // Max items in memory cache
    this.maxStorageSize = 10 * 1024 * 1024; // 10MB max localStorage usage
    
    // Cache configuration for different data types
    this.cacheConfig = {
      // Static data - cache for longer but use memory to avoid localStorage quota issues
      parks: { ttl: 24 * 60 * 60 * 1000, storage: 'memory' }, // 24 hours
      parkDetails: { ttl: 12 * 60 * 60 * 1000, storage: 'memory' }, // 12 hours
      weather: { ttl: 60 * 60 * 1000, storage: 'memory' }, // 60 minutes (matches globalCacheManager)
      forecast: { ttl: 120 * 60 * 1000, storage: 'memory' }, // 120 minutes (matches globalCacheManager)
      
      // User-specific data - shorter cache
      userProfile: { ttl: 15 * 60 * 1000, storage: 'memory' }, // 15 minutes
      userEvents: { ttl: 10 * 60 * 1000, storage: 'memory' }, // 10 minutes
      favorites: { ttl: 5 * 60 * 1000, storage: 'memory' }, // 5 minutes
      
      // Dynamic content - short cache
      blogPosts: { ttl: 30 * 60 * 1000, storage: 'memory' }, // 30 minutes
      events: { ttl: 15 * 60 * 1000, storage: 'memory' }, // 15 minutes
      reviews: { ttl: 10 * 60 * 1000, storage: 'memory' }, // 10 minutes
      
      // Daily feed - refresh frequently to get new content
      dailyFeed: { ttl: 5 * 60 * 1000, storage: 'memory' }, // 5 minutes
      parkOfDay: { ttl: 60 * 60 * 1000, storage: 'memory' }, // 1 hour (changes daily)
      natureFact: { ttl: 60 * 60 * 1000, storage: 'memory' }, // 1 hour (changes daily)
      
      // AI conversations - no cache (real-time)
      aiConversations: { ttl: 0, storage: 'none' },
      
      // Search results - very short cache
      search: { ttl: 2 * 60 * 1000, storage: 'memory' }, // 2 minutes
    };
    
    this.initializeStorage();
  }

  /**
   * Initialize storage and cleanup old entries
   */
  initializeStorage() {
    try {
      this.cleanupExpiredStorage();
      this.enforceStorageLimit();
    } catch (error) {
      console.warn('Cache storage initialization failed:', error);
    }
  }

  /**
   * Generate cache key from URL and parameters
   */
  generateKey(url, params = {}, type = 'default') {
    const paramString = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    
    return `${type}:${url}${paramString ? `?${paramString}` : ''}`;
  }

  /**
   * Get cache configuration for a specific type
   */
  getCacheConfig(type) {
    return this.cacheConfig[type] || { 
      ttl: this.defaultTTL, 
      storage: 'memory' 
    };
  }

  /**
   * Set cache entry
   */
  set(key, data, type = 'default') {
    const config = this.getCacheConfig(type);
    
    if (config.ttl === 0) {
      return; // No caching for this type
    }

    const entry = {
      data,
      timestamp: Date.now(),
      ttl: config.ttl,
      type
    };

    // Store in memory
    if (config.storage === 'memory' || config.storage === 'both') {
      this.setMemoryCache(key, entry);
    }

    // Store in localStorage
    if (config.storage === 'localStorage' || config.storage === 'both') {
      this.setStorageCache(key, entry, type);
    }
  }

  /**
   * Get cache entry
   */
  get(key, type = 'default') {
    const config = this.getCacheConfig(type);
    
    if (config.ttl === 0) {
      return null; // No caching for this type
    }

    // Try memory first
    if (config.storage === 'memory' || config.storage === 'both') {
      const memoryEntry = this.getMemoryCache(key);
      if (memoryEntry && !this.isExpired(memoryEntry)) {
        return memoryEntry.data;
      }
    }

    // Try localStorage
    if (config.storage === 'localStorage' || config.storage === 'both') {
      const storageEntry = this.getStorageCache(key);
      if (storageEntry && !this.isExpired(storageEntry)) {
        // Promote to memory cache
        if (config.storage === 'both') {
          this.setMemoryCache(key, storageEntry);
        }
        return storageEntry.data;
      }
    }

    return null;
  }

  /**
   * Check if cache entry is expired
   */
  isExpired(entry) {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  /**
   * Memory cache operations
   */
  setMemoryCache(key, entry) {
    // Enforce memory limit
    if (this.memoryCache.size >= this.maxMemorySize) {
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
    }
    
    this.memoryCache.set(key, entry);
  }

  getMemoryCache(key) {
    return this.memoryCache.get(key);
  }

  /**
   * localStorage cache operations
   */
  setStorageCache(key, entry, type = 'default') {
    try {
      const storageKey = this.storagePrefix + key;
      localStorage.setItem(storageKey, JSON.stringify(entry));
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        this.enforceStorageLimit();
        // Try again after cleanup
        try {
          const storageKey = this.storagePrefix + key;
          localStorage.setItem(storageKey, JSON.stringify(entry));
        } catch (retryError) {
          console.warn('Failed to store in localStorage after cleanup:', retryError);
          // If localStorage still fails, fall back to memory-only storage
          const retryConfig = this.getCacheConfig(type);
          if (retryConfig.storage === 'localStorage') {
            retryConfig.storage = 'memory';
            this.setMemoryCache(key, entry);
          }
        }
      } else {
        console.warn('localStorage set error:', error);
      }
    }
  }

  getStorageCache(key) {
    try {
      const storageKey = this.storagePrefix + key;
      const item = localStorage.getItem(storageKey);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.warn('localStorage get error:', error);
      return null;
    }
  }

  /**
   * Remove cache entry
   */
  delete(key) {
    // Remove from memory
    this.memoryCache.delete(key);
    
    // Remove from localStorage
    try {
      const storageKey = this.storagePrefix + key;
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.warn('localStorage delete error:', error);
    }
  }

  /**
   * Clear all cache entries of a specific type
   */
  clearByType(type) {
    console.log(`[CacheService] 🗑️ Clearing cache by type: ${type}`);
    console.log(`[CacheService] 📊 Memory cache size before: ${this.memoryCache.size}`);
    
    const keysToDelete = [];
    
    // Collect memory cache keys
    for (const [key, entry] of this.memoryCache.entries()) {
      console.log(`[CacheService] 🔍 Checking key: ${key}, entry.type: ${entry.type}`);
      if (entry.type === type) {
        console.log(`[CacheService] ✅ Match found, will delete: ${key}`);
        keysToDelete.push(key);
      }
    }
    
    console.log(`[CacheService] 🗑️ Deleting ${keysToDelete.length} entries from memory`);
    
    // Delete from memory
    keysToDelete.forEach(key => {
      this.memoryCache.delete(key);
      console.log(`[CacheService] ✅ Deleted from memory: ${key}`);
    });
    
    // Delete from localStorage
    keysToDelete.forEach(key => {
      try {
        const storageKey = this.storagePrefix + key;
        localStorage.removeItem(storageKey);
        console.log(`[CacheService] ✅ Deleted from localStorage: ${storageKey}`);
      } catch (error) {
        console.warn('localStorage delete error:', error);
      }
    });
    
    console.log(`[CacheService] 📊 Memory cache size after: ${this.memoryCache.size}`);
    console.log(`[CacheService] ✅ clearByType('${type}') complete`);
  }

  /**
   * Clear all cache
   */
  clear() {
    this.memoryCache.clear();
    
    // Clear localStorage cache entries
    const keysToDelete = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.storagePrefix)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => localStorage.removeItem(key));
  }

  /**
   * Cleanup expired entries from localStorage
   */
  cleanupExpiredStorage() {
    const keysToDelete = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.storagePrefix)) {
        try {
          const entry = JSON.parse(localStorage.getItem(key));
          if (this.isExpired(entry)) {
            keysToDelete.push(key);
          }
        } catch (error) {
          // Invalid JSON, delete it
          keysToDelete.push(key);
        }
      }
    }
    
    keysToDelete.forEach(key => localStorage.removeItem(key));
  }

  /**
   * Enforce localStorage size limit
   */
  enforceStorageLimit() {
    let totalSize = 0;
    const entries = [];
    
    // Calculate total size and collect entries
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.storagePrefix)) {
        const value = localStorage.getItem(key);
        totalSize += key.length + value.length;
        entries.push({ key, value, size: key.length + value.length });
      }
    }
    
    // If over limit, remove oldest entries more aggressively
    if (totalSize > this.maxStorageSize) {
      entries.sort((a, b) => {
        try {
          const aEntry = JSON.parse(a.value);
          const bEntry = JSON.parse(b.value);
          return aEntry.timestamp - bEntry.timestamp;
        } catch {
          return 0;
        }
      });
      
      let removedSize = 0;
      // Remove entries until we're at 50% of the limit (more aggressive cleanup)
      for (const entry of entries) {
        if (totalSize - removedSize <= this.maxStorageSize * 0.5) break;
        localStorage.removeItem(entry.key);
        removedSize += entry.size;
      }
    }
  }

  /**
   * Get cache statistics (for internal use only)
   */
  getStats() {
    const memoryEntries = Array.from(this.memoryCache.entries());
    const storageEntries = [];
    
    // Count localStorage entries
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.storagePrefix)) {
        storageEntries.push(key);
      }
    }
    
    const stats = {
      memory: {
        total: memoryEntries.length,
        max: this.maxMemorySize,
        usage: Math.round((memoryEntries.length / this.maxMemorySize) * 100)
      },
      storage: {
        total: storageEntries.length,
        size: this.getStorageSize(),
        max: this.maxStorageSize,
        usage: Math.round((this.getStorageSize() / this.maxStorageSize) * 100)
      },
      types: {}
    };
    
    // Count by type
    const typeCounts = {};
    memoryEntries.forEach(([, entry]) => {
      typeCounts[entry.type] = (typeCounts[entry.type] || 0) + 1;
    });
    
    stats.types = typeCounts;
    
    return stats;
  }

  /**
   * Get current localStorage size
   */
  getStorageSize() {
    let size = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.storagePrefix)) {
        size += key.length + localStorage.getItem(key).length;
      }
    }
    return size;
  }

  /**
   * Prefetch data for better UX (background operation)
   */
  async prefetch(url, params = {}, type = 'default') {
    const key = this.generateKey(url, params, type);
    
    // Don't prefetch if already cached
    if (this.get(key, type)) {
      return;
    }
    
    try {
      const response = await fetch(url + (params ? `?${new URLSearchParams(params)}` : ''));
      if (response.ok) {
        const data = await response.json();
        this.set(key, data, type);
      }
    } catch (error) {
      // Silent fail - prefetch is optional
    }
  }
}

// Create singleton instance
const cacheService = new CacheService();

export default cacheService;
