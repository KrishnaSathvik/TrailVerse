// Legacy API service - now uses enhanced API for backward compatibility
import enhancedApi from './enhancedApi';

// Create a legacy-compatible API interface
const api = {
  get: (url, config = {}) => {
    return enhancedApi.get(url, config.params || {}, {
      cacheType: config.cacheType || 'default',
      skipCache: config.skipCache || false,
      ...config
    }).then(result => ({
      data: result.data,
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { url, ...config },
      request: {}
    }));
  },

  post: (url, data = {}, config = {}) => {
    return enhancedApi.post(url, data, {
      invalidateCache: config.invalidateCache || [],
      ...config
    });
  },

  put: (url, data = {}, config = {}) => {
    return enhancedApi.put(url, data, {
      invalidateCache: config.invalidateCache || [],
      ...config
    });
  },

  delete: (url, config = {}) => {
    return enhancedApi.delete(url, {
      invalidateCache: config.invalidateCache || [],
      ...config
    });
  },

  patch: (url, data = {}, config = {}) => {
    return enhancedApi.patch(url, data, {
      invalidateCache: config.invalidateCache || [],
      ...config
    });
  }
};

// Legacy cache functions for backward compatibility
export const clearCache = () => {
  enhancedApi.clearCache();
};

export const clearCacheEntry = (url, params = {}) => {
  const cacheKey = enhancedApi.cacheService.generateKey(url, params, 'default');
  enhancedApi.cacheService.delete(cacheKey);
};

export default api;
