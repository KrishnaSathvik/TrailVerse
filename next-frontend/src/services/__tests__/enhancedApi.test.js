import { describe, it, expect, vi, beforeEach } from 'vitest';
import enhancedApi from '../enhancedApi';

const { mockAxios, mockCacheService } = vi.hoisted(() => ({
  mockAxios: {
    create: vi.fn(() => ({
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      patch: vi.fn(),
      request: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() }
      }
    }))
  },
  mockCacheService: {
    generateKey: vi.fn(),
    get: vi.fn(),
    getCacheConfig: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    clearByType: vi.fn(),
    getStats: vi.fn(),
    prefetch: vi.fn()
  }
}));

vi.mock('axios', () => ({
  default: mockAxios
}));

vi.mock('../cacheService', () => ({
  default: mockCacheService
}));

describe('EnhancedApiService', () => {
  let apiInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    apiInstance = new enhancedApi.constructor();
    mockCacheService.getCacheConfig.mockReturnValue({ ttl: 300000, storage: 'memory' });
  });

  it('serves GETs from cache when available', async () => {
    mockCacheService.generateKey.mockReturnValue('cache-key');
    mockCacheService.get.mockReturnValue({ id: 1 });

    const result = await apiInstance.get('/test');

    expect(result).toEqual({ data: { id: 1 }, fromCache: true });
  });

  it('fetches and caches GET responses when cache is cold', async () => {
    const mockApi = {
      get: vi.fn().mockResolvedValue({ data: { id: 1 } })
    };
    apiInstance.api = mockApi;
    mockCacheService.generateKey.mockReturnValue('cache-key');
    mockCacheService.get.mockReturnValue(null);

    const result = await apiInstance.get('/test', { q: 'x' });

    expect(mockApi.get).toHaveBeenCalledWith('/test', expect.objectContaining({
      params: { q: 'x' },
      cacheType: 'default',
      skipCache: false
    }));
    expect(mockCacheService.set).toHaveBeenCalledWith('cache-key', { id: 1 }, 'default');
    expect(result).toEqual({ data: { id: 1 }, fromCache: false });
  });

  it('invalidates cache after writes', async () => {
    apiInstance.api = {
      post: vi.fn().mockResolvedValue({ data: { ok: true } }),
      put: vi.fn().mockResolvedValue({ data: { ok: true } }),
      delete: vi.fn().mockResolvedValue({ data: { ok: true } }),
      patch: vi.fn().mockResolvedValue({ data: { ok: true } })
    };
    apiInstance.invalidateCache = vi.fn();

    await apiInstance.post('/test', { ok: true }, { invalidateCache: ['users'] });
    await apiInstance.put('/test/1', { ok: true }, { invalidateCache: ['users'] });
    await apiInstance.delete('/test/1', { invalidateCache: ['users'] });
    await apiInstance.patch('/test/1', { ok: true }, { invalidateCache: ['users'] });

    expect(apiInstance.invalidateCache).toHaveBeenCalledTimes(4);
  });

  it('invalidates cache by type or specific URL', () => {
    mockCacheService.generateKey.mockReturnValue('specific-key');

    apiInstance.invalidateCache([
      'users',
      { url: '/test', type: 'default' }
    ]);

    expect(mockCacheService.clearByType).toHaveBeenCalledWith('users');
    expect(mockCacheService.delete).toHaveBeenCalledWith('specific-key');
  });

  it('retries on network, server, and timeout errors', () => {
    expect(apiInstance.shouldRetry({ response: null })).toBe(true);
    expect(apiInstance.shouldRetry({ response: { status: 500 } })).toBe(true);
    expect(apiInstance.shouldRetry({ code: 'ECONNABORTED', response: { status: 408 } })).toBe(true);
    expect(apiInstance.shouldRetry({ response: { status: 400 } })).toBe(false);
  });

  it('delegates prefetch and cache stats helpers', async () => {
    mockCacheService.prefetch.mockResolvedValue(undefined);
    mockCacheService.getStats.mockReturnValue({ memory: { total: 0 } });

    await apiInstance.prefetch('/parks', { page: 1 }, 'parks');

    expect(mockCacheService.prefetch).toHaveBeenCalled();
    expect(apiInstance.getCacheStats()).toEqual({ memory: { total: 0 } });
  });
});
