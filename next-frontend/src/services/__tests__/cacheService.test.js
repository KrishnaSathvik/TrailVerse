import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import cacheService from '../cacheService';

describe('CacheService', () => {
  beforeEach(() => {
    cacheService.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cacheService.clear();
    vi.useRealTimers();
  });

  it('sets and gets cache entries', () => {
    const key = 'test-key';
    const data = { id: 1, name: 'Test' };

    cacheService.set(key, data);

    expect(cacheService.get(key)).toEqual(data);
  });

  it('deletes cache entries', () => {
    cacheService.set('test-key', { ok: true });
    cacheService.delete('test-key');

    expect(cacheService.get('test-key')).toBeNull();
  });

  it('clears cache by type', () => {
    cacheService.set('key1', 'data1', 'type1');
    cacheService.set('key2', 'data2', 'type1');
    cacheService.set('key3', 'data3', 'type2');

    cacheService.clearByType('type1');

    expect(cacheService.get('key1', 'type1')).toBeNull();
    expect(cacheService.get('key2', 'type1')).toBeNull();
    expect(cacheService.get('key3', 'type2')).toEqual('data3');
  });

  it('generates deterministic cache keys', () => {
    const key1 = cacheService.generateKey('/api/test', { id: 1, name: 'x' }, 'parks');
    const key2 = cacheService.generateKey('/api/test', { name: 'x', id: 1 }, 'parks');

    expect(key1).toBe(key2);
  });

  it('returns current cache stats shape', () => {
    cacheService.set('key1', 'data1', 'type1');
    cacheService.set('key2', 'data2', 'type2');

    const stats = cacheService.getStats();

    expect(stats).toHaveProperty('memory');
    expect(stats).toHaveProperty('storage');
    expect(stats).toHaveProperty('types');
    expect(stats.memory.total).toBeGreaterThanOrEqual(2);
  });

  it('prefetches data into the cache', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 1, name: 'Prefetched' })
    });
    global.fetch = mockFetch;

    const url = 'https://api.example.com/data';
    const params = { id: 1 };
    const type = 'default';

    await cacheService.prefetch(url, params, type);

    const key = cacheService.generateKey(url, params, type);
    expect(cacheService.get(key, type)).toEqual({ id: 1, name: 'Prefetched' });
  });

  it('handles prefetch failures silently', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    await expect(
      cacheService.prefetch('https://api.example.com/data', { id: 1 }, 'default')
    ).resolves.toBeUndefined();
  });
});
