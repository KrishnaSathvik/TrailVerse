/**
 * Centralized Error Handling Utility
 * Provides consistent error handling across the application
 */

/**
 * Check if error is a network/connection error (server not running)
 * @param {Error} error - The error object
 * @returns {boolean} - True if it's a network error
 */
export const isNetworkError = (error) => {
  return (
    error.code === 'ERR_NETWORK' ||
    error.message === 'Network Error' ||
    error.message.includes('ERR_CONNECTION_REFUSED') ||
    error.message.includes('fetch') ||
    error.message.includes('Failed to fetch')
  );
};

/**
 * Check if error is a server error (5xx)
 * @param {Error} error - The error object
 * @returns {boolean} - True if it's a server error
 */
export const isServerError = (error) => {
  return error.response?.status >= 500;
};

/**
 * Check if error is a client error (4xx)
 * @param {Error} error - The error object
 * @returns {boolean} - True if it's a client error
 */
export const isClientError = (error) => {
  return error.response?.status >= 400 && error.response?.status < 500;
};

/**
 * Get user-friendly error message
 * @param {Error} error - The error object
 * @returns {string} - User-friendly error message
 */
export const getErrorMessage = (error) => {
  if (isNetworkError(error)) {
    return 'Unable to connect to server. Please check your connection or try again later.';
  }
  
  if (isServerError(error)) {
    return 'Server is temporarily unavailable. Please try again later.';
  }
  
  if (isClientError(error)) {
    return error.response?.data?.error || error.response?.data?.message || 'Something went wrong.';
  }
  
  return error.message || 'An unexpected error occurred.';
};

/**
 * Handle API errors with appropriate user feedback
 * @param {Error} error - The error object
 * @param {Function} showToast - Toast function from context
 * @param {Function} fallbackCallback - Optional fallback function
 * @param {boolean} showToastForNetworkErrors - Whether to show toast for network errors
 */
export const handleApiError = (
  error, 
  showToast, 
  fallbackCallback = null,
  showToastForNetworkErrors = false
) => {
  console.error('API Error:', error);
  
  if (isNetworkError(error)) {
    console.log('Network error detected - server may not be running');
    
    if (fallbackCallback) {
      fallbackCallback();
    }
    
    if (showToastForNetworkErrors) {
      showToast('Unable to connect to server', 'warning');
    }
  } else if (isServerError(error)) {
    showToast('Server error - please try again later', 'error');
  } else if (isClientError(error)) {
    showToast(getErrorMessage(error), 'error');
  } else {
    showToast('An unexpected error occurred', 'error');
  }
};

/**
 * Fallback data for when server is not available
 */
export const fallbackData = {
  stats: {
    users: 1250,
    trips: 3420,
    reviews: 890,
    parks: 63
  },
  
  testimonials: [], // No fake testimonials - only real user feedback
  
  parks: [],
  events: [],
  blogPosts: []
};

/**
 * Retry function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in milliseconds
 * @returns {Promise} - Promise that resolves with function result
 */
export const retryWithBackoff = async (fn, maxRetries = 3, baseDelay = 1000) => {
  let lastError;
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (i === maxRetries) {
        throw lastError;
      }
      
      // Don't retry network errors - server is likely down
      if (isNetworkError(error)) {
        throw lastError;
      }
      
      // Exponential backoff: 1s, 2s, 4s, etc.
      const delay = baseDelay * Math.pow(2, i);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
};

/**
 * Check if server is available
 * @param {string} baseURL - Base URL to check
 * @returns {Promise<boolean>} - True if server is available
 */
export const checkServerHealth = async (baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api') => {
  try {
    const response = await fetch(`${baseURL}/health`, {
      method: 'GET',
      timeout: 5000
    });
    return response.ok;
  } catch (error) {
    return false;
  }
};
