/**
 * Enhanced API Service with Integrated Caching
 * Provides a unified API interface with automatic caching, retry logic, and error handling
 */

import axios from 'axios';
import cacheService from './cacheService';

class EnhancedApiService {
  constructor() {
    this.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
    this.timeout = 60000;
    this.retryAttempts = 3;
    this.retryDelay = 1000;
    
    // Create axios instance
    this.api = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
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
        const duration = Date.now() - response.config.metadata.startTime;

        return response;
      },
      async (error) => {
        // Handle 401 errors
        if (error.response?.status === 401) {
          localStorage.removeItem('token');
          window.location.href = '/login';
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
        return { data: cachedData, fromCache: true };
      }
    }

    try {
      const response = await this.api.get(url, {
        params,
        cacheType,
        skipCache,
        ...axiosOptions
      });

      // Cache successful responses
      if (response.data && !skipCache) {
        const config = cacheService.getCacheConfig(cacheType);
        if (ttl) config.ttl = ttl;
        cacheService.set(cacheKey, response.data, cacheType);
      }

      return { data: response.data, fromCache: false };
    } catch (error) {
      // Return cached data as fallback if available
      if (!skipCache) {
        const cachedData = cacheService.get(cacheKey, cacheType);
        if (cachedData) {
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
    
    const response = await this.api.post(url, data, axiosOptions);
    
    // Invalidate related cache entries
    this.invalidateCache(invalidateCache);
    
    return response;
  }

  /**
   * PUT request
   */
  async put(url, data = {}, options = {}) {
    const { invalidateCache = [], ...axiosOptions } = options;
    
    const response = await this.api.put(url, data, axiosOptions);
    
    // Invalidate related cache entries
    this.invalidateCache(invalidateCache);
    
    return response;
  }

  /**
   * DELETE request
   */
  async delete(url, options = {}) {
    const { invalidateCache = [], ...axiosOptions } = options;
    
    const response = await this.api.delete(url, axiosOptions);
    
    // Invalidate related cache entries
    this.invalidateCache(invalidateCache);
    
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
        cacheService.clearByType(pattern);
      } else if (pattern.url) {
        // Invalidate specific URL
        const cacheKey = cacheService.generateKey(pattern.url, pattern.params || {}, pattern.type || 'default');
        cacheService.delete(cacheKey);
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
