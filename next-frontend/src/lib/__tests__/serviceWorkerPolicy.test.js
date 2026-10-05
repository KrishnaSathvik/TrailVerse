import { beforeAll, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({ options: null, listeners: {} }));
vi.mock('serwist', () => {
  class Strategy { constructor(options) { this.options = options; } }
  return {
    Serwist: class { constructor(options) { captured.options = options; } addEventListeners() {} },
    CacheFirst: class extends Strategy {},
    NetworkOnly: class extends Strategy {},
    StaleWhileRevalidate: class extends Strategy {},
  };
});
beforeAll(async () => {
  vi.stubGlobal('self', {
    location: { origin: 'https://example.com' },
    addEventListener: (name, fn) => { captured.listeners[name] = fn; },
  });
  await import('../../app/sw.ts');
});
function handler(path, headers = {}) {
  const url = new URL(path, 'https://example.com');
  return captured.options.runtimeCaching.find(({ matcher }) => matcher({
    url, sameOrigin: url.origin === 'https://example.com',
    request: { headers: new Headers(headers), destination: path.endsWith('.webp') ? 'image' : '' },
  }))?.handler.constructor.name;
}
describe('service worker privacy and caching', () => {
  it('keeps cookie-authenticated and public API data out of shared SW caches', () => {
    for (const path of ['/api/users/profile', '/api/trips/123', '/api/parks/yell', '/api/reviews/yell', '/api/blogs', '/api/events', '/_next/data/build/profile.json']) {
      expect(handler(path)).toBe('NetworkOnly');
    }
  });
  it('bypasses static caches for authorization-bearing requests', () => {
    expect(handler('/_next/static/test.js', { authorization: 'Bearer test' })).toBe('NetworkOnly');
  });
  it('only caches versioned local logos without background revalidation', () => {
    expect(handler('/brand/trailverse-logo-80.5ba3166e4f83.webp')).toBe('CacheFirst');
    expect(handler('/brand/unversioned.webp')).toBe('StaleWhileRevalidate');
    expect(handler('https://other.example/brand/trailverse-logo-80.5ba3166e4f83.webp')).toBe('StaleWhileRevalidate');
  });
  it('purges legacy data caches on upgrade but keeps unrelated caches', async () => {
    const remove = vi.fn();
    vi.stubGlobal('caches', { keys: async () => ['api-user-data-v5', 'api-parks-v4', 'next-data-v5', 'other-app', 'next-static-v6'], delete: remove });
    let cleanup;
    captured.listeners.activate({ waitUntil: (promise) => { cleanup = promise; } });
    await cleanup;
    expect(remove.mock.calls.flat()).toEqual(['api-user-data-v5', 'api-parks-v4', 'next-data-v5']);
  });
});
