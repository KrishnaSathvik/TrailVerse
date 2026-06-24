/**
 * Bump on deploy when clients must drop stale park/tab/PWA caches.
 * Keep in sync with SW_CACHE_VERSION in src/app/sw.ts (`v${CLIENT_CACHE_VERSION}`).
 */
export const CLIENT_CACHE_VERSION = '5';

const VERSION_STORAGE_KEY = 'trailverse_client_cache_version';

const LEGACY_LOCAL_PREFIXES = [
  'trailverse_all_parks_',
  'trailverse_all_parks_lite_',
  'trailverse_all_parks_time_',
  'npe_cache_v',
];

const RUNTIME_CACHE_PREFIXES = [
  'api-parks-',
  'api-reviews-',
  'api-blog-',
  'api-events-',
  'api-user-data-',
  'next-data-',
  'next-static-',
  'images-',
];

const CURRENT_CACHE_SUFFIX = `-v${CLIENT_CACHE_VERSION}`;

/**
 * One-time per version: purge stale localStorage + old service-worker Cache API buckets.
 * Safe to call on every app boot (no-op when version matches).
 */
export function applyClientCacheMigration() {
  if (typeof window === 'undefined') return false;

  const stored = localStorage.getItem(VERSION_STORAGE_KEY);
  if (stored === CLIENT_CACHE_VERSION) return false;

  for (let i = localStorage.length - 1; i >= 0; i -= 1) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (LEGACY_LOCAL_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      localStorage.removeItem(key);
    }
  }

  localStorage.setItem(VERSION_STORAGE_KEY, CLIENT_CACHE_VERSION);

  if ('caches' in window) {
    caches.keys().then((names) => {
      const stale = names.filter((name) => {
        const isRuntime = RUNTIME_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix));
        return isRuntime && !name.endsWith(CURRENT_CACHE_SUFFIX);
      });
      return Promise.all(stale.map((name) => caches.delete(name)));
    }).catch(() => {});
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then((regs) => Promise.all(regs.map((reg) => reg.update())))
      .catch(() => {});
  }

  return true;
}
