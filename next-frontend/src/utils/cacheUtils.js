import enhancedApi from '../services/enhancedApi';

// We'll need to get the queryClient instance from the React context
// For now, we'll create a placeholder that will be set by the app
let queryClientInstance = null;
const _cacheLoggerInterval = null;

export const setQueryClient = (client) => {
  queryClientInstance = client;
  
  // Background cache monitoring disabled - purely background operation
};

const getQueryClient = () => {
  if (!queryClientInstance) {
    console.warn('QueryClient not initialized. Make sure to call setQueryClient() in your app.');
    return null;
  }
  return queryClientInstance;
};

// Background cache logging disabled - purely background operation

/**
 * Cache utilities for managing NPS API data efficiently
 * Helps reduce API calls and stay within rate limits
 */

// Cache keys for different data types
export const CACHE_KEYS = {
  PARKS: ['parks'],
  PARK: (parkCode) => ['park', parkCode],
  PARK_DETAILS: (parkCode) => ['parkDetails', parkCode],
  PARK_RATINGS: ['parkRatings'],
  BLOG_POSTS: ['blogPosts'],
  EVENTS: ['events'],
  DAILY_FEED: (userId) => ['dailyFeed', new Date().toDateString(), userId],
};

// Prefetch park data for better UX
export const prefetchParkData = async (parkCode) => {
  const queryClient = getQueryClient();
  if (!parkCode || !queryClient) return;
  
  try {
    // Prefetch park basic info
    await queryClient.prefetchQuery({
      queryKey: CACHE_KEYS.PARK(parkCode),
      staleTime: 1000 * 60 * 60 * 12, // 12 hours
    });
    
    // Prefetch park details
    await queryClient.prefetchQuery({
      queryKey: CACHE_KEYS.PARK_DETAILS(parkCode),
      staleTime: 1000 * 60 * 60 * 6, // 6 hours
    });
  } catch (error) {
    console.warn('Failed to prefetch park data:', error);
  }
};

// Invalidate specific cache entries
export const invalidateCache = {
  parks: () => {
    const queryClient = getQueryClient();
    return queryClient?.invalidateQueries({ queryKey: CACHE_KEYS.PARKS });
  },
  park: (parkCode) => {
    const queryClient = getQueryClient();
    return queryClient?.invalidateQueries({ queryKey: CACHE_KEYS.PARK(parkCode) });
  },
  parkDetails: (parkCode) => {
    const queryClient = getQueryClient();
    return queryClient?.invalidateQueries({ queryKey: CACHE_KEYS.PARK_DETAILS(parkCode) });
  },
  ratings: () => {
    const queryClient = getQueryClient();
    return queryClient?.invalidateQueries({ queryKey: CACHE_KEYS.PARK_RATINGS });
  },
  dailyFeed: (userId) => {
    const queryClient = getQueryClient();
    return queryClient?.invalidateQueries({ queryKey: CACHE_KEYS.DAILY_FEED(userId) });
  },
  all: () => {
    const queryClient = getQueryClient();
    return queryClient?.invalidateQueries();
  },
};

// Get cached data without triggering a fetch
export const getCachedData = {
  parks: () => {
    const queryClient = getQueryClient();
    return queryClient?.getQueryData(CACHE_KEYS.PARKS);
  },
  park: (parkCode) => {
    const queryClient = getQueryClient();
    return queryClient?.getQueryData(CACHE_KEYS.PARK(parkCode));
  },
  parkDetails: (parkCode) => {
    const queryClient = getQueryClient();
    return queryClient?.getQueryData(CACHE_KEYS.PARK_DETAILS(parkCode));
  },
  ratings: () => {
    const queryClient = getQueryClient();
    return queryClient?.getQueryData(CACHE_KEYS.PARK_RATINGS);
  },
};

// Check if data is fresh (not stale)
export const isDataFresh = (queryKey, staleTime = 30 * 60 * 1000) => {
  const queryClient = getQueryClient();
  if (!queryClient) return false;
  
  const query = queryClient.getQueryState(queryKey);
  if (!query || !query.dataUpdatedAt) return false;
  
  const now = Date.now();
  const dataAge = now - query.dataUpdatedAt;
  return dataAge < staleTime;
};

// Cache statistics for debugging
export const getCacheStats = () => {
  const queryClient = getQueryClient();
  if (!queryClient) return null;
  
  const cache = queryClient.getQueryCache();
  const queries = cache.getAll();
  
  // Get enhanced API cache stats
  const enhancedStats = enhancedApi.getCacheStats();
  
  return {
    // React Query stats
    totalQueries: queries.length,
    freshQueries: queries.filter(q => isDataFresh(q.queryKey)).length,
    staleQueries: queries.filter(q => !isDataFresh(q.queryKey)).length,
    queries: queries.map(q => ({
      key: q.queryKey,
      isFresh: isDataFresh(q.queryKey),
      dataUpdatedAt: q.state.dataUpdatedAt,
      status: q.state.status,
    })),
    // Enhanced API cache stats
    enhancedCache: enhancedStats
  };
};

// Clear all cache (use sparingly)
export const clearAllCache = () => {
  const queryClient = getQueryClient();
  queryClient?.clear();
  enhancedApi.clearCache();
};

// Set cache data manually (useful for optimistic updates)
export const setCacheData = (queryKey, data) => {
  const queryClient = getQueryClient();
  return queryClient?.setQueryData(queryKey, data);
};
