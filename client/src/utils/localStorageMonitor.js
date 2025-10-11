/**
 * localStorage Quota Monitoring Utility
 * Tracks localStorage usage and warns when approaching browser limits
 */

class LocalStorageMonitor {
  constructor() {
    this.WARNING_THRESHOLD = 0.8; // 80% of quota
    this.CRITICAL_THRESHOLD = 0.95; // 95% of quota
    this.ESTIMATED_QUOTA = 5 * 1024 * 1024; // 5MB typical browser limit
    this.PREFIX = 'npe_';
  }

  /**
   * Calculate current localStorage usage in bytes
   */
  getCurrentUsage() {
    let totalBytes = 0;
    
    try {
      for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          // Count both key and value size
          const keySize = new Blob([key]).size;
          const valueSize = new Blob([localStorage.getItem(key) || '']).size;
          totalBytes += keySize + valueSize;
        }
      }
    } catch (error) {
      console.error('[LocalStorageMonitor] Error calculating usage:', error);
    }
    
    return totalBytes;
  }

  /**
   * Get usage statistics
   */
  getStats() {
    const usage = this.getCurrentUsage();
    const usagePercent = (usage / this.ESTIMATED_QUOTA) * 100;
    const remainingBytes = this.ESTIMATED_QUOTA - usage;
    
    return {
      usedBytes: usage,
      usedMB: (usage / (1024 * 1024)).toFixed(2),
      totalMB: (this.ESTIMATED_QUOTA / (1024 * 1024)).toFixed(2),
      usagePercent: usagePercent.toFixed(2),
      remainingBytes,
      remainingMB: (remainingBytes / (1024 * 1024)).toFixed(2),
      status: this.getStatus(usagePercent)
    };
  }

  /**
   * Get status based on usage percentage
   */
  getStatus(usagePercent) {
    if (usagePercent >= this.CRITICAL_THRESHOLD * 100) {
      return 'critical';
    } else if (usagePercent >= this.WARNING_THRESHOLD * 100) {
      return 'warning';
    }
    return 'ok';
  }

  /**
   * Get breakdown by key prefix
   */
  getBreakdown() {
    const breakdown = {
      cache: 0,
      auth: 0,
      trips: 0,
      preferences: 0,
      analytics: 0,
      other: 0
    };

    try {
      for (let key in localStorage) {
        if (!localStorage.hasOwnProperty(key)) continue;
        
        const size = new Blob([key]).size + new Blob([localStorage.getItem(key) || '']).size;
        
        if (key.startsWith('npe_cache_')) {
          breakdown.cache += size;
        } else if (key === 'token' || key === 'user') {
          breakdown.auth += size;
        } else if (key.includes('trip') || key.includes('planai')) {
          breakdown.trips += size;
        } else if (key.includes('preferences') || key.includes('cookie')) {
          breakdown.preferences += size;
        } else if (key.includes('analytics')) {
          breakdown.analytics += size;
        } else {
          breakdown.other += size;
        }
      }
    } catch (error) {
      console.error('[LocalStorageMonitor] Error calculating breakdown:', error);
    }

    // Convert to MB and sort by size
    const result = Object.entries(breakdown)
      .map(([category, bytes]) => ({
        category,
        bytes,
        mb: (bytes / (1024 * 1024)).toFixed(3),
        percent: ((bytes / this.getCurrentUsage()) * 100).toFixed(1)
      }))
      .sort((a, b) => b.bytes - a.bytes);

    return result;
  }

  /**
   * Check if storage operation is safe
   */
  canStore(dataSize) {
    const stats = this.getStats();
    const wouldExceed = (stats.usedBytes + dataSize) > (this.ESTIMATED_QUOTA * this.CRITICAL_THRESHOLD);
    
    return !wouldExceed;
  }

  /**
   * Clean up expired cache entries
   */
  cleanExpiredCache() {
    let removedBytes = 0;
    const keysToRemove = [];
    
    try {
      for (let key in localStorage) {
        if (!localStorage.hasOwnProperty(key)) continue;
        
        // Only clean cache entries
        if (key.startsWith('npe_cache_')) {
          try {
            const data = JSON.parse(localStorage.getItem(key));
            const now = Date.now();
            
            // Check if entry has expired
            if (data && data.timestamp && data.ttl) {
              if (now - data.timestamp > data.ttl) {
                const size = new Blob([key]).size + new Blob([JSON.stringify(data)]).size;
                keysToRemove.push(key);
                removedBytes += size;
              }
            }
          } catch (e) {
            // Invalid JSON, remove it
            keysToRemove.push(key);
          }
        }
      }
      
      // Remove expired entries
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
    } catch (error) {
      console.error('[LocalStorageMonitor] Error cleaning cache:', error);
    }
    
    return {
      removedCount: keysToRemove.length,
      removedBytes,
      removedMB: (removedBytes / (1024 * 1024)).toFixed(2)
    };
  }

  /**
   * Clean up least recently used cache entries
   */
  cleanLRUCache(targetBytes) {
    const cacheEntries = [];
    
    try {
      // Collect all cache entries with timestamps
      for (let key in localStorage) {
        if (!localStorage.hasOwnProperty(key)) continue;
        
        if (key.startsWith('npe_cache_')) {
          try {
            const data = JSON.parse(localStorage.getItem(key));
            const size = new Blob([key]).size + new Blob([JSON.stringify(data)]).size;
            
            cacheEntries.push({
              key,
              timestamp: data.timestamp || 0,
              size
            });
          } catch (e) {
            // Invalid entry, will be removed
            cacheEntries.push({ key, timestamp: 0, size: 0 });
          }
        }
      }
      
      // Sort by timestamp (oldest first)
      cacheEntries.sort((a, b) => a.timestamp - b.timestamp);
      
      // Remove oldest entries until target is met
      let freedBytes = 0;
      let removedCount = 0;
      
      for (const entry of cacheEntries) {
        if (freedBytes >= targetBytes) break;
        
        localStorage.removeItem(entry.key);
        freedBytes += entry.size;
        removedCount++;
      }
      
      return {
        removedCount,
        freedBytes,
        freedMB: (freedBytes / (1024 * 1024)).toFixed(2)
      };
      
    } catch (error) {
      console.error('[LocalStorageMonitor] Error cleaning LRU cache:', error);
      return { removedCount: 0, freedBytes: 0, freedMB: '0.00' };
    }
  }

  /**
   * Perform automatic cleanup if needed
   */
  autoCleanup() {
    const stats = this.getStats();
    
    // If we're above warning threshold, clean expired cache
    if (stats.status === 'warning' || stats.status === 'critical') {
      console.log('[LocalStorageMonitor] Performing automatic cleanup...');
      
      // First, remove expired entries
      const expiredResult = this.cleanExpiredCache();
      console.log(`[LocalStorageMonitor] Removed ${expiredResult.removedCount} expired entries (${expiredResult.removedMB}MB)`);
      
      // If still above warning, remove LRU cache (free up 1MB)
      const newStats = this.getStats();
      if (newStats.status !== 'ok') {
        const lruResult = this.cleanLRUCache(1 * 1024 * 1024); // Free 1MB
        console.log(`[LocalStorageMonitor] Removed ${lruResult.removedCount} LRU entries (${lruResult.freedMB}MB)`);
      }
      
      return true;
    }
    
    return false;
  }

  /**
   * Log current status to console
   */
  logStatus() {
    const stats = this.getStats();
    const breakdown = this.getBreakdown();
    
    console.group('[LocalStorageMonitor] Status Report');
    console.log(`Status: ${stats.status.toUpperCase()}`);
    console.log(`Usage: ${stats.usedMB}MB / ${stats.totalMB}MB (${stats.usagePercent}%)`);
    console.log(`Remaining: ${stats.remainingMB}MB`);
    console.log('\nBreakdown by category:');
    breakdown.forEach(item => {
      console.log(`  ${item.category}: ${item.mb}MB (${item.percent}%)`);
    });
    console.groupEnd();
    
    // Show warning if needed
    if (stats.status === 'warning') {
      console.warn('[LocalStorageMonitor] ⚠️ Warning: localStorage usage is at 80%+. Consider cleanup.');
    } else if (stats.status === 'critical') {
      console.error('[LocalStorageMonitor] ❌ Critical: localStorage usage is at 95%+. Automatic cleanup recommended.');
    }
    
    return stats;
  }

  /**
   * Initialize monitoring with periodic checks
   */
  startMonitoring(interval = 60000) { // Check every minute
    // Initial check
    this.logStatus();
    this.autoCleanup();
    
    // Periodic monitoring
    this.monitorInterval = setInterval(() => {
      const stats = this.getStats();
      
      // Only log if there's an issue
      if (stats.status !== 'ok') {
        this.logStatus();
        this.autoCleanup();
      }
    }, interval);
    
    return this.monitorInterval;
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }
}

// Create singleton instance
const localStorageMonitor = new LocalStorageMonitor();

// Export both the class and instance
export { LocalStorageMonitor };
export default localStorageMonitor;

