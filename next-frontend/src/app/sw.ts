/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, StaleWhileRevalidate, NetworkOnly, CacheFirst } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/** Bump when runtime SW caches should be invalidated on deploy */
// Retain existing static/image caches; only legacy data caches need purging.
const SW_CACHE_VERSION = "v5";

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Let HTTP cache headers and the query client govern changing data.
    // SW Cache Storage is shared across logins and must not store API responses.
    // Cookie authentication cannot reliably be detected from request headers.
    {
      matcher({ url, request }) {
        return request.headers.has("authorization") ||
          url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/data/");
      },
      handler: new NetworkOnly(),
    },

    // Next.js static assets — immutable hashed bundles
    {
      matcher({ url }) {
        return url.origin === self.location.origin && url.pathname.startsWith("/_next/static/");
      },
      handler: new CacheFirst({
        cacheName: `next-static-${SW_CACHE_VERSION}`,
      }),
    },
    // Versioned logo assets never need background revalidation.
    {
      matcher({ url, sameOrigin }) {
        return sameOrigin && /^\/brand\/trailverse-logo-(40|80|120)\.[a-f0-9]{12}\.webp$/.test(url.pathname);
      },
      handler: new CacheFirst({ cacheName: `brand-${SW_CACHE_VERSION}` }),
    },
    // Google Maps tiles — CacheFirst
    {
      matcher({ url }) {
        return url.hostname.endsWith(".googleapis.com") || url.hostname.endsWith(".gstatic.com");
      },
      handler: new CacheFirst({
        cacheName: `google-maps-${SW_CACHE_VERSION}`,
      }),
    },
    // NPS images — CacheFirst
    {
      matcher({ url }) {
        return url.hostname.endsWith(".nps.gov");
      },
      handler: new CacheFirst({
        cacheName: `nps-images-${SW_CACHE_VERSION}`,
      }),
    },
    // Other images — StaleWhileRevalidate
    {
      matcher({ request }) {
        return request.destination === "image";
      },
      handler: new StaleWhileRevalidate({
        cacheName: `images-${SW_CACHE_VERSION}`,
      }),
    },
    // Fonts — CacheFirst
    {
      matcher({ request }) {
        return request.destination === "font";
      },
      handler: new CacheFirst({
        cacheName: `fonts-${SW_CACHE_VERSION}`,
      }),
    },
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

// Remove caches that could contain another user's data from older workers.
// Match only TrailVerse-owned legacy runtime caches, never unrelated caches.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((name) => /^(api-(parks|user-data|reviews|blog|events)|next-data)-v\d+$/.test(name))
        .map((name) => caches.delete(name)),
    )),
  );
});

serwist.addEventListeners();
