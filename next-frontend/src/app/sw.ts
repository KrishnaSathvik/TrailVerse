/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, StaleWhileRevalidate, NetworkFirst, CacheFirst } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Next.js static assets — immutable hashed bundles
    {
      matcher({ url }) {
        return url.pathname.startsWith("/_next/static/");
      },
      handler: new CacheFirst({
        cacheName: "next-static",
      }),
    },
    // Next.js data routes
    {
      matcher({ url }) {
        return url.pathname.startsWith("/_next/data/");
      },
      handler: new NetworkFirst({
        cacheName: "next-data",
        networkTimeoutSeconds: 5,
      }),
    },
    // Parks API — StaleWhileRevalidate
    {
      matcher({ url }) {
        return url.pathname.startsWith("/api/parks");
      },
      handler: new StaleWhileRevalidate({
        cacheName: "api-parks",
      }),
    },
    // User & trip APIs — NetworkFirst
    {
      matcher({ url }) {
        return url.pathname.startsWith("/api/users") || url.pathname.startsWith("/api/trips");
      },
      handler: new NetworkFirst({
        cacheName: "api-user-data",
        networkTimeoutSeconds: 5,
      }),
    },
    // Reviews API — StaleWhileRevalidate
    {
      matcher({ url }) {
        return url.pathname.startsWith("/api/reviews");
      },
      handler: new StaleWhileRevalidate({
        cacheName: "api-reviews",
      }),
    },
    // Blog API — StaleWhileRevalidate
    {
      matcher({ url }) {
        return url.pathname.startsWith("/api/blog");
      },
      handler: new StaleWhileRevalidate({
        cacheName: "api-blog",
      }),
    },
    // Events API — StaleWhileRevalidate
    {
      matcher({ url }) {
        return url.pathname.startsWith("/api/events");
      },
      handler: new StaleWhileRevalidate({
        cacheName: "api-events",
      }),
    },
    // Google Maps tiles — CacheFirst
    {
      matcher({ url }) {
        return url.hostname.endsWith(".googleapis.com") || url.hostname.endsWith(".gstatic.com");
      },
      handler: new CacheFirst({
        cacheName: "google-maps",
      }),
    },
    // NPS images — CacheFirst
    {
      matcher({ url }) {
        return url.hostname.endsWith(".nps.gov");
      },
      handler: new CacheFirst({
        cacheName: "nps-images",
      }),
    },
    // Other images — StaleWhileRevalidate
    {
      matcher({ request }) {
        return request.destination === "image";
      },
      handler: new StaleWhileRevalidate({
        cacheName: "images",
      }),
    },
    // Fonts — CacheFirst
    {
      matcher({ request }) {
        return request.destination === "font";
      },
      handler: new CacheFirst({
        cacheName: "fonts",
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

serwist.addEventListeners();
