import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import enhancedApi from '../enhancedApi';

// Mock axios
const mockAxios = {
  create: vi.fn(() => ({
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
    request: vi.fn(),
    interceptors: {
      request: {
        use: vi.fn()
      },
      response: {
        use: vi.fn()
      }
    }
  }))
};

vi.mock('axios', () => ({
  default: mockAxios
}));

// Mock cacheService
const mockCacheService = {
  generateKey: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  clearByType: vi.fn(),
  getCacheConfig: vi.fn(),
  prefetch: vi.fn(),
  getStats: vi.fn(),
  clear: vi.fn()
};

vi.mock('../cacheService', () => ({
  default: mockCacheService
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn()
};
global.localStorage = localStorageMock;

describe('EnhancedApiService', () => {
  let apiInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    // Create a new instance for testing
    apiInstance = new (await import('../enhancedApi')).default.constructor();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET requests', () => {
    it('should make GET request and cache response', async () => {
      const mockResponse = { data: { id: 1, name: 'Test' } };
      const mockApi = {
        get: vi.fn().mockResolvedValue(mockResponse)
      };
      
      apiInstance.api = mockApi;
      mockCacheService.generateKey.mockReturnValue('test-key');
      mockCacheService.get.mockReturnValue(null);
      mockCacheService.getCacheConfig.mockReturnValue({ ttl: 300000 });

      const result = await apiInstance.get('/test', { param: 'value' });

      expect(mockCacheService.generateKey).toHaveBeenCalledWith('/test', { param: 'value' }, 'default');
      expect(mockCacheService.get).toHaveBeenCalledWith('test-key', 'default');
      expect(mockApi.get).toHaveBeenCalledWith('/test', {
        params: { param: 'value' },
        cacheType: 'default',
        skipCache: false,
        metadata: expect.any(Object)
      });
      expect(mockCacheService.set).toHaveBeenCalledWith('test-key', mockResponse.data, 'default');
      expect(result).toEqual({ data: mockResponse.data, fromCache: false });
    });

    it('should return cached data when available', async () => {
      const cachedData = { id: 1, name: 'Cached' };
      mockCacheService.generateKey.mockReturnValue('test-key');
      mockCacheService.get.mockReturnValue(cachedData);

      const result = await apiInstance.get('/test');

      expect(result).toEqual({ data: cachedData, fromCache: true });
    });

    it('should skip cache when skipCache is true', async () => {
      const mockResponse = { data: { id: 1, name: 'Test' } };
      const mockApi = {
        get: vi.fn().mockResolvedValue(mockResponse)
      };
      
      apiInstance.api = mockApi;
      mockCacheService.generateKey.mockReturnValue('test-key');
      mockCacheService.get.mockReturnValue(null);

      const result = await apiInstance.get('/test', {}, { skipCache: true });

      expect(mockCacheService.get).not.toHaveBeenCalled();
      expect(mockCacheService.set).not.toHaveBeenCalled();
      expect(result).toEqual({ data: mockResponse.data, fromCache: false });
    });

    it('should return cached data as fallback on error', async () => {
      const cachedData = { id: 1, name: 'Cached' };
      const mockApi = {
        get: vi.fn().mockRejectedValue(new Error('Network error'))
      };
      
      apiInstance.api = mockApi;
      mockCacheService.generateKey.mockReturnValue('test-key');
      mockCacheService.get.mockReturnValue(cachedData);

      const result = await apiInstance.get('/test');

      expect(result).toEqual({ 
        data: cachedData, 
        fromCache: true, 
        error: 'Network error' 
      });
    });
  });

  describe('POST requests', () => {
    it('should make POST request and invalidate cache', async () => {
      const mockResponse = { data: { id: 1, name: 'Created' } };
      const mockApi = {
        post: vi.fn().mockResolvedValue(mockResponse)
      };
      
      apiInstance.api = mockApi;
      apiInstance.invalidateCache = vi.fn();

      const result = await apiInstance.post('/test', { name: 'Test' }, {
        invalidateCache: ['users', { url: '/test', type: 'default' }]
      });

      expect(mockApi.post).toHaveBeenCalledWith('/test', { name: 'Test' }, {
        invalidateCache: ['users', { url: '/test', type: 'default' }]
      });
      expect(apiInstance.invalidateCache).toHaveBeenCalledWith(['users', { url: '/test', type: 'default' }]);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('PUT requests', () => {
    it('should make PUT request and invalidate cache', async () => {
      const mockResponse = { data: { id: 1, name: 'Updated' } };
      const mockApi = {
        put: vi.fn().mockResolvedValue(mockResponse)
      };
      
      apiInstance.api = mockApi;
      apiInstance.invalidateCache = vi.fn();

      const result = await apiInstance.put('/test/1', { name: 'Updated' }, {
        invalidateCache: ['users']
      });

      expect(mockApi.put).toHaveBeenCalledWith('/test/1', { name: 'Updated' }, {
        invalidateCache: ['users']
      });
      expect(apiInstance.invalidateCache).toHaveBeenCalledWith(['users']);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('DELETE requests', () => {
    it('should make DELETE request and invalidate cache', async () => {
      const mockResponse = { data: { success: true } };
      const mockApi = {
        delete: vi.fn().mockResolvedValue(mockResponse)
      };
      
      apiInstance.api = mockApi;
      apiInstance.invalidateCache = vi.fn();

      const result = await apiInstance.delete('/test/1', {
        invalidateCache: ['users']
      });

      expect(mockApi.delete).toHaveBeenCalledWith('/test/1', {
        invalidateCache: ['users']
      });
      expect(apiInstance.invalidateCache).toHaveBeenCalledWith(['users']);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('PATCH requests', () => {
    it('should make PATCH request and invalidate cache', async () => {
      const mockResponse = { data: { id: 1, name: 'Patched' } };
      const mockApi = {
        patch: vi.fn().mockResolvedValue(mockResponse)
      };
      
      apiInstance.api = mockApi;
      apiInstance.invalidateCache = vi.fn();

      const result = await apiInstance.patch('/test/1', { name: 'Patched' }, {
        invalidateCache: ['users']
      });

      expect(mockApi.patch).toHaveBeenCalledWith('/test/1', { name: 'Patched' }, {
        invalidateCache: ['users']
      });
      expect(apiInstance.invalidateCache).toHaveBeenCalledWith(['users']);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('Batch requests', () => {
    it('should handle batch requests', async () => {
      const requests = [
        { method: 'GET', url: '/test1', params: {}, options: {} },
        { method: 'POST', url: '/test2', data: { name: 'Test' }, options: {} }
      ];

      const mockGet = vi.fn().mockResolvedValue({ data: { id: 1 } });
      const mockPost = vi.fn().mockResolvedValue({ data: { id: 2 } });

      apiInstance.get = mockGet;
      apiInstance.post = mockPost;

      const result = await apiInstance.batch(requests);

      expect(mockGet).toHaveBeenCalledWith('/test1', {}, {});
      expect(mockPost).toHaveBeenCalledWith('/test2', { name: 'Test' }, {});
      expect(result).toHaveLength(2);
    });
  });

  describe('Cache invalidation', () => {
    it('should invalidate cache by type', () => {
      apiInstance.invalidateCache(['users', 'posts']);

      expect(mockCacheService.clearByType).toHaveBeenCalledWith('users');
      expect(mockCacheService.clearByType).toHaveBeenCalledWith('posts');
    });

    it('should invalidate specific cache entries', () => {
      const patterns = [
        { url: '/test', params: { id: 1 }, type: 'default' }
      ];

      mockCacheService.generateKey.mockReturnValue('specific-key');
      apiInstance.invalidateCache(patterns);

      expect(mockCacheService.generateKey).toHaveBeenCalledWith('/test', { id: 1 }, 'default');
      expect(mockCacheService.delete).toHaveBeenCalledWith('specific-key');
    });
  });

  describe('File operations', () => {
    it('should upload file with progress tracking', async () => {
      const mockFile = new File(['test'], 'test.txt', { type: 'text/plain' });
      const mockResponse = { data: { success: true } };
      const mockApi = {
        post: vi.fn().mockResolvedValue(mockResponse)
      };
      
      apiInstance.api = mockApi;
      const onProgress = vi.fn();

      const result = await apiInstance.uploadFile('/upload', mockFile, onProgress);

      expect(mockApi.post).toHaveBeenCalledWith('/upload', expect.any(FormData), {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: expect.any(Function)
      });
      expect(result).toEqual(mockResponse);
    });

    it('should download file', async () => {
      const mockBlob = new Blob(['test content']);
      const mockResponse = { data: mockBlob };
      const mockApi = {
        get: vi.fn().mockResolvedValue(mockResponse)
      };
      
      apiInstance.api = mockApi;

      // Mock DOM methods
      global.URL.createObjectURL = vi.fn().mockReturnValue('blob:url');
      global.URL.revokeObjectURL = vi.fn();
      
      const createElement = vi.fn().mockReturnValue({
        href: '',
        download: '',
        click: vi.fn()
      });
      const appendChild = vi.fn();
      const removeChild = vi.fn();
      
      global.document = {
        createElement,
        body: { appendChild, removeChild }
      };

      await apiInstance.downloadFile('/download', 'test.txt');

      expect(mockApi.get).toHaveBeenCalledWith('/download', {
        responseType: 'blob'
      });
      expect(createElement).toHaveBeenCalledWith('a');
      expect(appendChild).toHaveBeenCalled();
      expect(removeChild).toHaveBeenCalled();
    });
  });

  describe('Retry logic', () => {
    it('should retry on network errors', async () => {
      const mockError = { response: null, code: 'NETWORK_ERROR' };
      const mockApi = {
        request: vi.fn().mockResolvedValue({ data: { success: true } })
      };
      
      apiInstance.api = mockApi;
      apiInstance.shouldRetry = vi.fn().mockReturnValue(true);

      const result = await apiInstance.retryRequest({
        metadata: { retryCount: 0 }
      });

      expect(apiInstance.shouldRetry).toHaveBeenCalledWith(mockError);
      expect(mockApi.request).toHaveBeenCalled();
    });

    it('should not retry on client errors', () => {
      const mockError = { response: { status: 400 } };
      
      const result = apiInstance.shouldRetry(mockError);

      expect(result).toBe(false);
    });

    it('should retry on server errors', () => {
      const mockError = { response: { status: 500 } };
      
      const result = apiInstance.shouldRetry(mockError);

      expect(result).toBe(true);
    });

    it('should retry on timeout', () => {
      const mockError = { code: 'ECONNABORTED' };
      
      const result = apiInstance.shouldRetry(mockError);

      expect(result).toBe(true);
    });
  });
});
