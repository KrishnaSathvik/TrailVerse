// Clear Service Worker Cache Script
// Run this in the browser console to clear service worker cache and unregister

console.log('🧹 Clearing Service Worker Cache...');

// Unregister service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    for(let registration of registrations) {
      console.log('Unregistering service worker:', registration);
      registration.unregister();
    }
  });
}

// Clear all caches
if ('caches' in window) {
  caches.keys().then(function(cacheNames) {
    return Promise.all(
      cacheNames.map(function(cacheName) {
        console.log('Deleting cache:', cacheName);
        return caches.delete(cacheName);
      })
    );
  }).then(function() {
    console.log('✅ All caches cleared!');
    console.log('🔄 Please refresh the page to complete the cleanup.');
  });
}

// Clear IndexedDB
if ('indexedDB' in window) {
  const deleteDB = indexedDB.deleteDatabase('TrailVerseOffline');
  deleteDB.onsuccess = function() {
    console.log('✅ IndexedDB cleared!');
  };
  deleteDB.onerror = function() {
    console.log('❌ Failed to clear IndexedDB');
  };
}

console.log('🎯 Service Worker cleanup initiated. Refresh the page when done.');
