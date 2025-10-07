// Simple service worker for development
// This prevents the 404 error in the console

const CACHE_NAME = 'npe-usa-v1';

self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Simple passthrough for development
  event.respondWith(fetch(event.request));
});
