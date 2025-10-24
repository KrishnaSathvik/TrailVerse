/**
 * Enhanced API Service with Integrated Caching
 * Provides a unified API interface with automatic caching, retry logic, and error handling
 */

import axios from 'axios';
import cacheService from './cacheService';

class EnhancedApiService {
  constructor() {
    this.baseURL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:5001/api');
    this.timeout = 60000;
    this.retryAttempts = 3;
    this.retryDelay = 1000;
    
    // Create axios instance
    this.api = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      maxContentLength: 10 * 1024 * 1024, // 10MB
      maxBodyLength: 10 * 1024 * 1024, // 10MB
      headers: {
        'Content-Type': 'application/json',
      }
    });

    this.setupInterceptors();
  }

  /**
   * Setup request and response interceptors
   */
  setupInterceptors() {
    // Request interceptor
    this.api.interceptors.request.use(
      (config) => {
        // Add auth token
        const token = localStorage.getItem('token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Add cache metadata
        config.metadata = {
          startTime: Date.now(),
          cacheType: config.cacheType || 'default',
          skipCache: config.skipCache || false
        };

        // Debug logging for large requests
        if (config.data && JSON.stringify(config.data).length > 1000000) {
          console.log(`🚀 EnhancedApi Request Interceptor: Large request to ${config.url}:`, {
            method: config.method,
            headers: config.headers,
            dataSize: `${(JSON.stringify(config.data).length / 1024).toFixed(2)} KB`,
            maxContentLength: config.maxContentLength,
            maxBodyLength: config.maxBodyLength
          });
        }

        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.api.interceptors.response.use(
      (response) => {
        // Silent performance tracking (no logging)
        const _duration = Date.now() - response.config.metadata.startTime;

        return response;
      },
      async (error) => {
        // Debug logging for 413 errors
        if (error.response?.status === 413) {
          console.error('🚨 EnhancedApi: 413 Payload Too Large Error:', {
            url: error.config?.url,
            method: error.config?.method,
            dataSize: error.config?.data ? `${(JSON.stringify(error.config.data).length / 1024).toFixed(2)} KB` : 'Unknown',
            headers: error.config?.headers,
            response: error.response?.data,
            maxContentLength: error.config?.maxContentLength,
            maxBodyLength: error.config?.maxBodyLength
          });
        }
        
        // Don't handle 401 errors here - let AuthContext handle authentication
        // This prevents conflicts with the AuthContext's smart error handling
        
        // Global rate limiting error handling
        if (error.response?.status === 429) {
          // Store rate limiting error in a way that components can detect
          const rateLimitError = {
            message: 'Too many requests. Please wait a moment and try again.',
            timestamp: Date.now()
          };
          
          // Store in sessionStorage to prevent duplicate notifications
          const existingError = sessionStorage.getItem('rateLimitError');
          if (!existingError || Date.now() - JSON.parse(existingError).timestamp > 30000) {
            sessionStorage.setItem('rateLimitError', JSON.stringify(rateLimitError));
            
            // Dispatch custom event for toast handling
            window.dispatchEvent(new CustomEvent('rateLimitError', {
              detail: rateLimitError
            }));
          }
        }
        
        // Retry logic for network errors
        if (this.shouldRetry(error) && error.config.metadata.retryCount < this.retryAttempts) {
          return this.retryRequest(error.config);
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Check if request should be retried
   */
  shouldRetry(error) {
    return (
      !error.response || // Network error
      error.response.status >= 500 || // Server error
      error.code === 'ECONNABORTED' // Timeout
    );
  }

  /**
   * Retry failed request
   */
  async retryRequest(config) {
    config.metadata.retryCount = (config.metadata.retryCount || 0) + 1;
    
    // Exponential backoff
    const delay = this.retryDelay * Math.pow(2, config.metadata.retryCount - 1);
    await new Promise(resolve => setTimeout(resolve, delay));
    
    return this.api.request(config);
  }

  /**
   * GET request with caching
   */
  async get(url, params = {}, options = {}) {
    const {
      cacheType = 'default',
      skipCache = false,
      ttl = null,
      ...axiosOptions
    } = options;

    const cacheKey = cacheService.generateKey(url, params, cacheType);
    
    // Try cache first (unless skipped)
    if (!skipCache) {
      const cachedData = cacheService.get(cacheKey, cacheType);
      if (cachedData) {
        console.log(`[EnhancedApi] 📦 Serving from cache [${cacheType}]: ${url}`);
        return { data: cachedData, fromCache: true };
      }
    } else {
      console.log(`[EnhancedApi] 🔄 Skipping cache for [${cacheType}]: ${url}`);
    }

    try {
      console.log(`[EnhancedApi] 🌐 Fetching fresh data [${cacheType}]: ${url}`);
      const response = await this.api.get(url, {
        params,
        cacheType,
        skipCache,
        ...axiosOptions
      });

      // Cache successful responses (unless skipCache is true)
      if (response.data && !skipCache) {
        const config = cacheService.getCacheConfig(cacheType);
        if (ttl) config.ttl = ttl;
        cacheService.set(cacheKey, response.data, cacheType);
        console.log(`[EnhancedApi] ✅ Cached response [${cacheType}]: ${url}`);
      } else if (skipCache) {
        console.log(`[EnhancedApi] 🔄 Not caching response due to skipCache flag [${cacheType}]: ${url}`);
      }

      return { data: response.data, fromCache: false };
    } catch (error) {
      // Return cached data as fallback if available
      if (!skipCache) {
        const cachedData = cacheService.get(cacheKey, cacheType);
        if (cachedData) {
          console.log(`[EnhancedApi] ⚠️ Network error, serving stale cache [${cacheType}]: ${url}`);
          return { data: cachedData, fromCache: true, error: error.message };
        }
      }
      throw error;
    }
  }

  /**
   * POST request
   */
  async post(url, data = {}, options = {}) {
    const { invalidateCache = [], ...axiosOptions } = options;
    
    console.log(`[EnhancedApi] 📤 POST ${url}`, invalidateCache.length > 0 ? `(will invalidate: ${invalidateCache.join(', ')})` : '');
    
    // Debug logging for large requests
    const requestSize = JSON.stringify(data).length;
    if (requestSize > 1000000) { // Log requests > 1MB
      console.log(`🚀 EnhancedApi: Large POST request to ${url}:`, {
        size: `${(requestSize / 1024).toFixed(2)} KB`,
        headers: this.api.defaults.headers,
        dataKeys: Object.keys(data)
      });
    }
    
    const response = await this.api.post(url, data, axiosOptions);
    
    // Invalidate related cache entries
    if (invalidateCache.length > 0) {
      console.log(`[EnhancedApi] 🔥 POST complete, invalidating cache:`, invalidateCache);
      this.invalidateCache(invalidateCache);
    }
    
    return response;
  }

  /**
   * PUT request
   */
  async put(url, data = {}, options = {}) {
    const { invalidateCache = [], ...axiosOptions } = options;
    
    console.log(`[EnhancedApi] 📝 PUT ${url}`, invalidateCache.length > 0 ? `(will invalidate: ${invalidateCache.join(', ')})` : '');
    
    const response = await this.api.put(url, data, axiosOptions);
    
    // Invalidate related cache entries
    if (invalidateCache.length > 0) {
      console.log(`[EnhancedApi] 🔥 PUT complete, invalidating cache:`, invalidateCache);
      this.invalidateCache(invalidateCache);
    }
    
    return response;
  }

  /**
   * DELETE request
   */
  async delete(url, options = {}) {
    const { invalidateCache = [], ...axiosOptions } = options;
    
    console.log(`[EnhancedApi] 🗑️ DELETE ${url}`, invalidateCache.length > 0 ? `(will invalidate: ${invalidateCache.join(', ')})` : '');
    
    const response = await this.api.delete(url, axiosOptions);
    
    // Invalidate related cache entries
    if (invalidateCache.length > 0) {
      console.log(`[EnhancedApi] 🔥 DELETE complete, invalidating cache:`, invalidateCache);
      this.invalidateCache(invalidateCache);
    }
    
    return response;
  }

  /**
   * PATCH request
   */
  async patch(url, data = {}, options = {}) {
    const { invalidateCache = [], ...axiosOptions } = options;
    
    const response = await this.api.patch(url, data, axiosOptions);
    
    // Invalidate related cache entries
    this.invalidateCache(invalidateCache);
    
    return response;
  }

  /**
   * Batch multiple requests
   */
  async batch(requests) {
    const promises = requests.map(request => {
      if (request.method === 'GET') {
        return this.get(request.url, request.params, request.options);
      } else if (request.method === 'POST') {
        return this.post(request.url, request.data, request.options);
      } else if (request.method === 'PUT') {
        return this.put(request.url, request.data, request.options);
      } else if (request.method === 'DELETE') {
        return this.delete(request.url, request.options);
      }
      return Promise.reject(new Error(`Unsupported method: ${request.method}`));
    });

    return Promise.allSettled(promises);
  }

  /**
   * Invalidate cache entries
   */
  invalidateCache(patterns) {
    patterns.forEach(pattern => {
      if (typeof pattern === 'string') {
        // Invalidate by type
        console.log(`[EnhancedApi] 🔥 Invalidating cache type: ${pattern}`);
        cacheService.clearByType(pattern);
        console.log(`[EnhancedApi] ✅ Cache type '${pattern}' invalidated`);
      } else if (pattern.url) {
        // Invalidate specific URL
        const cacheKey = cacheService.generateKey(pattern.url, pattern.params || {}, pattern.type || 'default');
        console.log(`[EnhancedApi] 🔥 Invalidating cache key: ${cacheKey}`);
        cacheService.delete(cacheKey);
        console.log(`[EnhancedApi] ✅ Cache key invalidated`);
      }
    });
  }

  /**
   * Prefetch data for better UX
   */
  async prefetch(url, params = {}, cacheType = 'default') {
    return cacheService.prefetch(`${this.baseURL}${url}`, params, cacheType);
  }

  /**
   * Get cache statistics (internal use only)
   */
  getCacheStats() {
    return cacheService.getStats();
  }

  /**
   * Clear all cache (internal use only)
   */
  clearCache() {
    cacheService.clear();
  }

  /**
   * Clear cache by type (internal use only)
   */
  clearCacheByType(type) {
    cacheService.clearByType(type);
  }

  /**
   * Upload file with progress tracking
   */
  async uploadFile(url, file, onProgress, options = {}) {
    const formData = new FormData();
    formData.append('file', file);

    return this.api.post(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress) {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          onProgress(percentCompleted);
        }
      },
      ...options
    });
  }

  /**
   * Download file
   */
  async downloadFile(url, filename, options = {}) {
    const response = await this.api.get(url, {
      responseType: 'blob',
      ...options
    });

    // Create download link
    const blob = new Blob([response.data]);
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
  }
}

// Create singleton instance
const enhancedApi = new EnhancedApiService();

export default enhancedApi;
