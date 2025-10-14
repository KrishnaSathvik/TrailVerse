/**
 * Offline Data Manager
 * Handles caching and retrieval of data for offline use
 */

import serviceWorkerManager from '../utils/serviceWorkerRegistration';

class OfflineDataManager {
  constructor() {
    this.cachePrefix = 'trailverse_offline_';
    this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours
    this.isOnline = navigator.onLine;
    
    this.setupEventListeners();
  }

  // Setup event listeners
  setupEventListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.syncOfflineActions();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  // Cache data for offline use
  async cacheData(key, data, expiry = this.cacheExpiry) {
    try {
      const cacheKey = this.cachePrefix + key;
      const cacheData = {
        data,
        timestamp: Date.now(),
        expiry: Date.now() + expiry
      };
      
      localStorage.setItem(cacheKey, JSON.stringify(cacheData));
      
      return true;
    } catch (error) {
      console.error('[OfflineDataManager] Failed to cache data:', error);
      return false;
    }
  }

  // Get cached data
  async getCachedData(key) {
    try {
      const cacheKey = this.cachePrefix + key;
      const cached = localStorage.getItem(cacheKey);
      
      if (!cached) {
        return null;
      }
      
      const cacheData = JSON.parse(cached);
      
      // Check if expired
      if (Date.now() > cacheData.expiry) {
        localStorage.removeItem(cacheKey);
        return null;
      }
      

      return cacheData.data;
    } catch (error) {
      console.error('[OfflineDataManager] Failed to get cached data:', error);
      return null;
    }
  }

  // Cache user favorites for offline use
  async cacheUserFavorites(favorites) {
    return this.cacheData('user_favorites', favorites);
  }

  // Get cached user favorites
  async getCachedUserFavorites() {
    return this.getCachedData('user_favorites');
  }

  // Cache trip plans for offline use
  async cacheTripPlans(trips) {
    return this.cacheData('trip_plans', trips);
  }

  // Get cached trip plans
  async getCachedTripPlans() {
    return this.getCachedData('trip_plans');
  }

  // Cache park details for offline use
  async cacheParkDetails(parkCode, parkData) {
    return this.cacheData(`park_${parkCode}`, parkData);
  }

  // Get cached park details
  async getCachedParkDetails(parkCode) {
    return this.getCachedData(`park_${parkCode}`);
  }

  // Cache user profile for offline use
  async cacheUserProfile(profile) {
    return this.cacheData('user_profile', profile);
  }

  // Get cached user profile
  async getCachedUserProfile() {
    return this.getCachedData('user_profile');
  }

  // Cache user preferences for offline use
  async cacheUserPreferences(preferences) {
    return this.cacheData('user_preferences', preferences);
  }

  // Get cached user preferences
  async getCachedUserPreferences() {
    return this.getCachedData('user_preferences');
  }

  // Store offline action for background sync
  async storeOfflineAction(action) {
    if (this.isOnline) {
      // If online, try to execute immediately
      try {
        return await this.executeAction(action);
      } catch (error) {
        // If fails, store for later sync

        return await serviceWorkerManager.storeOfflineAction(action);
      }
    } else {
      // If offline, store for later sync
      return await serviceWorkerManager.storeOfflineAction(action);
    }
  }

  // Execute action (API call)
  async executeAction(action) {
    const { type, data, url, method = 'POST' } = action;
    
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      throw new Error(`Action failed: ${response.status}`);
    }
    
    return await response.json();
  }

  // Sync offline actions when back online
  async syncOfflineActions() {
    if (!this.isOnline) return;
    
    try {
      const offlineActions = await serviceWorkerManager.getOfflineActions();
      
      for (const action of offlineActions) {
        try {
          await this.executeAction(action);
          await serviceWorkerManager.removeOfflineAction(action.id);

        } catch (error) {
          console.error('[OfflineDataManager] Failed to sync action:', action, error);
          
          // Increment retry count
          action.retryCount = (action.retryCount || 0) + 1;
          
          // Remove if too many retries
          if (action.retryCount > 3) {
            await serviceWorkerManager.removeOfflineAction(action.id);

          }
        }
      }
    } catch (error) {
      console.error('[OfflineDataManager] Failed to sync offline actions:', error);
    }
  }

  // Preload critical data for offline use
  async preloadCriticalData() {
    if (!this.isOnline) return;
    
    try {
      
      // This would be called when the app loads to preload important data
      // Implementation depends on your specific data needs
      

    } catch (error) {
      console.error('[OfflineDataManager] Failed to preload critical data:', error);
    }
  }

  // Clear expired cache
  clearExpiredCache() {
    try {
      const keys = Object.keys(localStorage);
      const now = Date.now();
      let clearedCount = 0;
      
      keys.forEach(key => {
        if (key.startsWith(this.cachePrefix)) {
          try {
            const cached = JSON.parse(localStorage.getItem(key));
            if (cached.expiry && now > cached.expiry) {
              localStorage.removeItem(key);
              clearedCount++;
            }
          } catch (error) {
            // Invalid cache entry, remove it
            localStorage.removeItem(key);
            clearedCount++;
          }
        }
      });
      

      return clearedCount;
    } catch (error) {
      console.error('[OfflineDataManager] Failed to clear expired cache:', error);
      return 0;
    }
  }

  // Get cache statistics
  getCacheStats() {
    try {
      const keys = Object.keys(localStorage);
      const cacheKeys = keys.filter(key => key.startsWith(this.cachePrefix));
      const now = Date.now();
      
      let totalSize = 0;
      let expiredCount = 0;
      let validCount = 0;
      
      cacheKeys.forEach(key => {
        try {
          const cached = JSON.parse(localStorage.getItem(key));
          const size = new Blob([localStorage.getItem(key)]).size;
          totalSize += size;
          
          if (cached.expiry && now > cached.expiry) {
            expiredCount++;
          } else {
            validCount++;
          }
        } catch (error) {
          // Invalid entry
          expiredCount++;
        }
      });
      
      return {
        totalKeys: cacheKeys.length,
        validKeys: validCount,
        expiredKeys: expiredCount,
        totalSize: totalSize,
        totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2)
      };
    } catch (error) {
      console.error('[OfflineDataManager] Failed to get cache stats:', error);
      return null;
    }
  }

  // Check if online
  isOnline() {
    return this.isOnline;
  }
}

// Create singleton instance
const offlineDataManager = new OfflineDataManager();

export default offlineDataManager;
