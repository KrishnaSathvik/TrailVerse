import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import cacheService from '../cacheService';

describe('CacheService', () => {
  beforeEach(() => {
    cacheService.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cacheService.clear();
  });

  describe('Basic cache operations', () => {
    it('should set and get cache entries', () => {
      const key = 'test-key';
      const data = { id: 1, name: 'Test' };

      cacheService.set(key, data);
      const result = cacheService.get(key);

      expect(result).toEqual(data);
    });

    it('should return null for non-existent keys', () => {
      const result = cacheService.get('non-existent-key');
      expect(result).toBeNull();
    });

    it('should delete cache entries', () => {
      const key = 'test-key';
      const data = { id: 1, name: 'Test' };

      cacheService.set(key, data);
      expect(cacheService.get(key)).toEqual(data);

      cacheService.delete(key);
      expect(cacheService.get(key)).toBeNull();
    });

    it('should clear all cache', () => {
      cacheService.set('key1', 'data1');
      cacheService.set('key2', 'data2');

      cacheService.clear();

      expect(cacheService.get('key1')).toBeNull();
      expect(cacheService.get('key2')).toBeNull();
    });
  });

  describe('Cache types', () => {
    it('should handle different cache types', () => {
      const key = 'test-key';
      const data1 = { id: 1, name: 'Test1' };
      const data2 = { id: 2, name: 'Test2' };

      cacheService.set(key, data1, 'type1');
      cacheService.set(key, data2, 'type2');

      expect(cacheService.get(key, 'type1')).toEqual(data1);
      expect(cacheService.get(key, 'type2')).toEqual(data2);
    });

    it('should clear cache by type', () => {
      cacheService.set('key1', 'data1', 'type1');
      cacheService.set('key2', 'data2', 'type1');
      cacheService.set('key3', 'data3', 'type2');

      cacheService.clearByType('type1');

      expect(cacheService.get('key1', 'type1')).toBeNull();
      expect(cacheService.get('key2', 'type1')).toBeNull();
      expect(cacheService.get('key3', 'type2')).toEqual('data3');
    });
  });

  describe('Cache key generation', () => {
    it('should generate consistent cache keys', () => {
      const url = '/api/test';
      const params = { id: 1, name: 'test' };
      const type = 'default';

      const key1 = cacheService.generateKey(url, params, type);
      const key2 = cacheService.generateKey(url, params, type);

      expect(key1).toBe(key2);
      expect(typeof key1).toBe('string');
    });

    it('should generate different keys for different parameters', () => {
      const url = '/api/test';
      const params1 = { id: 1 };
      const params2 = { id: 2 };
      const type = 'default';

      const key1 = cacheService.generateKey(url, params1, type);
      const key2 = cacheService.generateKey(url, params2, type);

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different types', () => {
      const url = '/api/test';
      const params = { id: 1 };
      const type1 = 'type1';
      const type2 = 'type2';

      const key1 = cacheService.generateKey(url, params, type1);
      const key2 = cacheService.generateKey(url, params, type2);

      expect(key1).not.toBe(key2);
    });
  });

  describe('TTL (Time To Live)', () => {
    it('should respect TTL settings', () => {
      const key = 'test-key';
      const data = { id: 1, name: 'Test' };
      const ttl = 100; // 100ms

      cacheService.set(key, data, 'default', ttl);

      // Should be available immediately
      expect(cacheService.get(key)).toEqual(data);

      // Wait for TTL to expire
      return new Promise(resolve => {
        setTimeout(() => {
          expect(cacheService.get(key)).toBeNull();
          resolve();
        }, ttl + 10);
      });
    });

    it('should use default TTL when not specified', () => {
      const key = 'test-key';
      const data = { id: 1, name: 'Test' };

      cacheService.set(key, data);

      // Should be available (default TTL is longer)
      expect(cacheService.get(key)).toEqual(data);
    });
  });

  describe('Cache statistics', () => {
    it('should provide cache statistics', () => {
      cacheService.set('key1', 'data1', 'type1');
      cacheService.set('key2', 'data2', 'type1');
      cacheService.set('key3', 'data3', 'type2');

      const stats = cacheService.getStats();

      expect(stats).toHaveProperty('totalEntries');
      expect(stats).toHaveProperty('totalSize');
      expect(stats).toHaveProperty('typeStats');
      expect(stats.totalEntries).toBe(3);
    });

    it('should track cache hits and misses', () => {
      const key = 'test-key';
      const data = { id: 1, name: 'Test' };

      // Miss
      cacheService.get('non-existent');
      
      // Set and hit
      cacheService.set(key, data);
      cacheService.get(key);
      cacheService.get(key);

      const stats = cacheService.getStats();
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
    });
  });

  describe('Prefetch functionality', () => {
    it('should prefetch data', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 1, name: 'Prefetched' })
      });
      global.fetch = mockFetch;

      const url = 'https://api.example.com/data';
      const params = { id: 1 };
      const type = 'default';

      await cacheService.prefetch(url, params, type);

      expect(mockFetch).toHaveBeenCalled();
      
      // Check if data was cached
      const key = cacheService.generateKey(url, params, type);
      const cachedData = cacheService.get(key, type);
      expect(cachedData).toEqual({ id: 1, name: 'Prefetched' });
    });

    it('should handle prefetch errors gracefully', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch;

      const url = 'https://api.example.com/data';
      const params = { id: 1 };
      const type = 'default';

      // Should not throw
      await expect(cacheService.prefetch(url, params, type)).resolves.not.toThrow();
    });
  });

  describe('Cache configuration', () => {
    it('should get cache configuration for type', () => {
      const config = cacheService.getCacheConfig('default');
      
      expect(config).toHaveProperty('ttl');
      expect(config).toHaveProperty('maxSize');
      expect(typeof config.ttl).toBe('number');
      expect(typeof config.maxSize).toBe('number');
    });

    it('should handle unknown cache types', () => {
      const config = cacheService.getCacheConfig('unknown-type');
      
      expect(config).toHaveProperty('ttl');
      expect(config).toHaveProperty('maxSize');
    });
  });

  describe('Memory management', () => {
    it('should respect max size limits', () => {
      // Set a small max size for testing
      const originalConfig = cacheService.getCacheConfig('default');
      cacheService.setCacheConfig('default', { ...originalConfig, maxSize: 2 });

      cacheService.set('key1', 'data1');
      cacheService.set('key2', 'data2');
      cacheService.set('key3', 'data3'); // Should evict key1

      expect(cacheService.get('key1')).toBeNull();
      expect(cacheService.get('key2')).toEqual('data2');
      expect(cacheService.get('key3')).toEqual('data3');

      // Restore original config
      cacheService.setCacheConfig('default', originalConfig);
    });

    it('should calculate cache size', () => {
      const data1 = { id: 1, name: 'Test1' };
      const data2 = { id: 2, name: 'Test2' };

      cacheService.set('key1', data1);
      cacheService.set('key2', data2);

      const stats = cacheService.getStats();
      expect(stats.totalSize).toBeGreaterThan(0);
    });
  });

  describe('Cache invalidation patterns', () => {
    it('should invalidate by pattern', () => {
      cacheService.set('user:1', { id: 1, name: 'User1' });
      cacheService.set('user:2', { id: 2, name: 'User2' });
      cacheService.set('post:1', { id: 1, title: 'Post1' });

      cacheService.invalidatePattern('user:*');

      expect(cacheService.get('user:1')).toBeNull();
      expect(cacheService.get('user:2')).toBeNull();
      expect(cacheService.get('post:1')).toEqual({ id: 1, title: 'Post1' });
    });

    it('should handle invalid patterns gracefully', () => {
      cacheService.set('key1', 'data1');
      
      // Should not throw
      expect(() => cacheService.invalidatePattern('invalid-pattern')).not.toThrow();
      
      expect(cacheService.get('key1')).toEqual('data1');
    });
  });
});
