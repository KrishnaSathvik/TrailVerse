/**
 * Service Worker Registration Utility
 * Handles registration, updates, and communication with Service Worker
 */

class ServiceWorkerManager {
  constructor() {
    this.registration = null;
    this.isSupported = 'serviceWorker' in navigator;
    this.isOnline = navigator.onLine;
    
    this.setupEventListeners();
  }

  // Register Service Worker
  async register() {
    if (!this.isSupported) {
      console.log('[SW] Service Worker not supported');
      return false;
    }

    try {
      this.registration = await navigator.serviceWorker.register('/sw.js');
      console.log('[SW] Service Worker registered successfully:', this.registration);

      // Handle updates
      this.registration.addEventListener('updatefound', () => {
        this.handleUpdate();
      });

      // Handle controller change
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[SW] Service Worker controller changed');
        window.location.reload();
      });

      return true;
    } catch (error) {
      console.error('[SW] Service Worker registration failed:', error);
      return false;
    }
  }

  // Handle Service Worker updates
  handleUpdate() {
    const newWorker = this.registration.installing;
    
    if (newWorker) {
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed') {
          if (navigator.serviceWorker.controller) {
            // New content is available
            console.log('[SW] New content available');
            this.showUpdateNotification();
          } else {
            // Content is cached for offline use
            console.log('[SW] Content cached for offline use');
          }
        }
      });
    }
  }

  // Show update notification
  showUpdateNotification() {
    if (confirm('New version available! Reload to update?')) {
      this.updateServiceWorker();
    }
  }

  // Update Service Worker
  updateServiceWorker() {
    if (this.registration && this.registration.waiting) {
      this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  }

  // Setup event listeners
  setupEventListeners() {
    // Online/offline status
    window.addEventListener('online', () => {
      this.isOnline = true;
      console.log('[SW] Back online');
      this.notifyClients('online');
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      console.log('[SW] Gone offline');
      this.notifyClients('offline');
    });

    // Background sync
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
      this.setupBackgroundSync();
    }
  }

  // Setup background sync
  setupBackgroundSync() {
    navigator.serviceWorker.ready.then(registration => {
      // Register for background sync
      return registration.sync.register('background-sync');
    }).catch(error => {
      console.error('[SW] Background sync registration failed:', error);
    });
  }

  // Cache URLs for offline use
  async cacheUrls(urls) {
    if (this.registration && this.registration.active) {
      this.registration.active.postMessage({
        type: 'CACHE_URLS',
        urls: urls
      });
    }
  }

  // Store offline action for background sync
  async storeOfflineAction(action) {
    try {
      // Store in IndexedDB for background sync
      const db = await this.openIndexedDB();
      const transaction = db.transaction(['offlineActions'], 'readwrite');
      const store = transaction.objectStore('offlineActions');
      
      const offlineAction = {
        id: Date.now() + Math.random(),
        ...action,
        timestamp: Date.now(),
        retryCount: 0
      };
      
      await store.add(offlineAction);
      console.log('[SW] Stored offline action:', offlineAction);
      
      return offlineAction;
    } catch (error) {
      console.error('[SW] Failed to store offline action:', error);
      throw error;
    }
  }

  // Open IndexedDB
  openIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('TrailVerseOffline', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        if (!db.objectStoreNames.contains('offlineActions')) {
          const store = db.createObjectStore('offlineActions', { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp');
          store.createIndex('type', 'type');
        }
      };
    });
  }

  // Get offline actions
  async getOfflineActions() {
    try {
      const db = await this.openIndexedDB();
      const transaction = db.transaction(['offlineActions'], 'readonly');
      const store = transaction.objectStore('offlineActions');
      
      return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('[SW] Failed to get offline actions:', error);
      return [];
    }
  }

  // Remove offline action
  async removeOfflineAction(actionId) {
    try {
      const db = await this.openIndexedDB();
      const transaction = db.transaction(['offlineActions'], 'readwrite');
      const store = transaction.objectStore('offlineActions');
      
      await store.delete(actionId);
      console.log('[SW] Removed offline action:', actionId);
    } catch (error) {
      console.error('[SW] Failed to remove offline action:', error);
    }
  }

  // Notify clients about status changes
  notifyClients(message) {
    if (this.registration && this.registration.active) {
      this.registration.active.postMessage({
        type: 'STATUS_CHANGE',
        status: message
      });
    }
  }

  // Check if offline
  isOffline() {
    return !this.isOnline;
  }

  // Get registration
  getRegistration() {
    return this.registration;
  }

  // Unregister Service Worker
  async unregister() {
    if (this.registration) {
      const success = await this.registration.unregister();
      console.log('[SW] Service Worker unregistered:', success);
      return success;
    }
    return false;
  }
}

// Create singleton instance
const serviceWorkerManager = new ServiceWorkerManager();

// Export for use in components
export default serviceWorkerManager;

// Auto-register on load
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    serviceWorkerManager.register();
  });
}
