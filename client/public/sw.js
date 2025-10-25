const CACHE_NAME = 'trailverse-v2';
const OFFLINE_CACHE = 'trailverse-offline-v2';
const API_CACHE = 'trailverse-api-v2';

// Files to cache for offline functionality
const STATIC_CACHE_URLS = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/manifest.json',
  '/android-chrome-192x192.png',
  '/android-chrome-512x512.png',
  '/favicon.ico'
];

// API endpoints to cache for offline
// NOTE: Favorites is EXCLUDED from caching to prevent stale data issues
const API_CACHE_PATTERNS = [
  /\/api\/parks/,
  /\/api\/users\/profile/,
  /\/api\/users\/preferences/,
  // /\/api\/favorites/,  // ❌ DISABLED - causes stale data after mutations
  /\/api\/trips/,
  /\/api\/reviews/
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker');
  
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then(cache => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_CACHE_URLS);
      }),
      caches.open(OFFLINE_CACHE).then(cache => {
        console.log('[SW] Setting up offline cache');
        return cache.addAll([
          '/offline.html',
          '/static/js/bundle.js',
          '/static/css/main.css'
        ]);
      })
    ])
  );
  
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && 
              cacheName !== OFFLINE_CACHE && 
              cacheName !== API_CACHE) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  
  self.clients.claim();
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip development server requests
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    // In development, only handle API requests and specific assets
    if (url.pathname.startsWith('/api/')) {
      event.respondWith(handleApiRequest(request));
      return;
    }
    
    // Skip source files and dev server requests
    if (url.pathname.includes('/src/') || 
        url.pathname.includes('/pages/') || 
        url.pathname.includes('/components/') ||
        url.pathname.includes('/@') ||
        url.pathname.includes('/__vite') ||
        url.pathname.includes('/node_modules/') ||
        url.pathname.match(/\.(jsx|ts|tsx)$/)) {
      return; // Let the request pass through to dev server
    }
  }
  
  // Handle API requests
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request));
    return;
  }
  
  // Handle static assets (only in production or for specific asset types)
  if (request.destination === 'document' || 
      request.destination === 'script' || 
      request.destination === 'style' ||
      request.destination === 'image') {
    event.respondWith(handleStaticRequest(request));
    return;
  }
});

// Handle API requests with offline support
async function handleApiRequest(request) {
  const url = new URL(request.url);
  
  // ALWAYS bypass cache for mutation requests (POST, PUT, DELETE, PATCH)
  if (request.method !== 'GET') {
    console.log('[SW] Mutation request, bypassing cache:', request.method, url.pathname);
    try {
      const response = await fetch(request);
      
      // If this is a favorites mutation, invalidate favorites cache
      if (url.pathname.includes('/favorites')) {
        console.log('[SW] ⚡ Invalidating favorites cache after mutation');
        const cache = await caches.open(API_CACHE);
        const keys = await cache.keys();
        const favoritesKeys = keys.filter(req => new URL(req.url).pathname.includes('/favorites'));
        await Promise.all(favoritesKeys.map(key => cache.delete(key)));
        console.log('[SW] ✅ Deleted', favoritesKeys.length, 'favorites cache entries');
      }
      
      return response;
    } catch (error) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Network unavailable',
          offline: true 
        }),
        { 
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  }
  
  // Check if this is a cacheable API endpoint
  const isCacheable = API_CACHE_PATTERNS.some(pattern => pattern.test(url.pathname));
  
  if (!isCacheable) {
    // For non-cacheable endpoints, try network first
    try {
      return await fetch(request);
    } catch (error) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Network unavailable',
          offline: true 
        }),
        { 
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  }
  
  // For cacheable endpoints, try cache first, then network
  try {
    const cache = await caches.open(API_CACHE);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log('[SW] Serving API from cache:', url.pathname);
      
      // Return cached response immediately
      const clonedResponse = cachedResponse.clone();
      
      // Update cache in background
      fetch(request)
        .then(response => {
          if (response.ok) {
            cache.put(request, response.clone());
          }
        })
        .catch(error => {
          console.log('[SW] Background update failed:', error);
        });
      
      return clonedResponse;
    }
    
    // No cached response, try network
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Cache successful responses
      cache.put(request, networkResponse.clone());
      console.log('[SW] Cached API response:', url.pathname);
    }
    
    return networkResponse;
    
  } catch (error) {
    console.log('[SW] Network failed, checking cache:', error);
    
    // Network failed, try cache
    const cache = await caches.open(API_CACHE);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log('[SW] Serving stale API from cache:', url.pathname);
      return cachedResponse;
    }
    
    // No cache available, return offline response
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Offline - no cached data available',
        offline: true 
      }),
      { 
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// Handle static asset requests
async function handleStaticRequest(request) {
  const url = new URL(request.url);
  
  // Skip development source files (jsx, ts, tsx, etc.)
  if (url.pathname.match(/\.(jsx|ts|tsx|js)$/) && 
      (url.pathname.includes('/src/') || url.pathname.includes('/pages/') || url.pathname.includes('/components/'))) {
    // Let Vite dev server handle these files
    return fetch(request).catch(error => {
      console.log('[SW] Dev server request failed, letting it pass through:', error);
      throw error;
    });
  }
  
  // Skip HMR and dev server requests
  if (url.pathname.includes('/@') || url.pathname.includes('/__vite') || url.pathname.includes('/node_modules/')) {
    return fetch(request).catch(error => {
      console.log('[SW] HMR request failed, letting it pass through:', error);
      throw error;
    });
  }
  
  try {
    // Try network first for static assets
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Only cache production assets (not source files)
      if (url.pathname.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/) && 
          !url.pathname.includes('/src/') && 
          !url.pathname.includes('/pages/') && 
          !url.pathname.includes('/components/')) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, networkResponse.clone());
      }
    }
    
    return networkResponse;
    
  } catch (error) {
    console.log('[SW] Network failed for static asset, trying cache:', error);
    
    // Network failed, try cache
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // For navigation requests, show offline page
    if (request.destination === 'document') {
      const offlineCache = await caches.open(OFFLINE_CACHE);
      const offlineResponse = await offlineCache.match('/offline.html');
      
      if (offlineResponse) {
        return offlineResponse;
      }
    }
    
    // Fallback to network error - but don't throw, return error response
    return new Response(
      `Service Worker: Failed to fetch ${url.pathname}`,
      { 
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'text/plain' }
      }
    );
  }
}

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);
  
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

// Background sync implementation
async function doBackgroundSync() {
  try {
    console.log('[SW] Performing background sync');
    
    // Get pending offline actions from IndexedDB
    const pendingActions = await getPendingOfflineActions();
    
    for (const action of pendingActions) {
      try {
        await processOfflineAction(action);
        await removePendingAction(action.id);
      } catch (error) {
        console.error('[SW] Failed to sync action:', action, error);
      }
    }
    
  } catch (error) {
    console.error('[SW] Background sync failed:', error);
  }
}

// Get pending offline actions from IndexedDB
async function getPendingOfflineActions() {
  // This would integrate with IndexedDB to get pending actions
  // For now, return empty array
  return [];
}

// Process a single offline action
async function processOfflineAction(action) {
  const { type, data, url, method } = action;
  
  try {
    const response = await fetch(url, {
      method: method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${data.token}`
      },
      body: JSON.stringify(data)
    });
    
    if (response.ok) {
      console.log('[SW] Successfully synced action:', type);
    } else {
      throw new Error(`Sync failed: ${response.status}`);
    }
    
  } catch (error) {
    console.error('[SW] Failed to process action:', error);
    throw error;
  }
}

// Remove processed action from pending list
async function removePendingAction(actionId) {
  // This would remove the action from IndexedDB
  console.log('[SW] Removing processed action:', actionId);
}

// Push notification handling
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');
  
  const options = {
    body: event.data ? event.data.text() : 'New update available',
    icon: '/android-chrome-192x192.png',
    badge: '/android-chrome-192x192.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'Explore Parks',
        icon: '/android-chrome-192x192.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/android-chrome-192x192.png'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('TrailVerse', options)
  );
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);
  
  event.notification.close();
  
  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Message handling from main thread
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_URLS') {
    const urls = event.data.urls;
    event.waitUntil(
      caches.open(CACHE_NAME).then(cache => {
        return cache.addAll(urls);
      })
    );
  }
});
