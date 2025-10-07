/**
 * useSmartPrefetch Hook
 * Provides smart prefetching capabilities for React components
 */

import { useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import smartPrefetchService from '../services/smartPrefetchService';
import performanceMonitor from '../services/performanceMonitor';

/**
 * Hook for smart prefetching based on current route and user behavior
 */
export const useSmartPrefetch = () => {
  const location = useLocation();

  useEffect(() => {
    // Track page view for prefetching
    smartPrefetchService.trackPageView();
  }, [location.pathname]);

  const recordParkView = useCallback((parkCode) => {
    smartPrefetchService.recordParkView(parkCode);
    
    // Dispatch custom event for performance monitoring
    window.dispatchEvent(new CustomEvent('parkView', { 
      detail: { parkCode } 
    }));
  }, []);

  const recordSearch = useCallback((query) => {
    smartPrefetchService.recordSearchQuery(query);
    
    // Dispatch custom event for performance monitoring
    window.dispatchEvent(new CustomEvent('search', { 
      detail: { query } 
    }));
  }, []);

  return {
    recordParkView,
    recordSearch,
    getStats: smartPrefetchService.getStats.bind(smartPrefetchService)
  };
};

/**
 * Hook for performance monitoring
 */
export const usePerformanceMonitor = () => {
  const getMetrics = useCallback(() => {
    return performanceMonitor.getMetrics();
  }, []);

  const getInsights = useCallback(() => {
    return performanceMonitor.getInsights();
  }, []);

  const getRecommendations = useCallback(() => {
    return performanceMonitor.getOptimizationRecommendations();
  }, []);

  const resetMetrics = useCallback(() => {
    performanceMonitor.resetMetrics();
  }, []);

  return {
    getMetrics,
    getInsights,
    getRecommendations,
    resetMetrics
  };
};

/**
 * Hook for park-specific prefetching
 */
export const useParkPrefetch = (parkCode) => {
  const { recordParkView } = useSmartPrefetch();

  useEffect(() => {
    if (parkCode) {
      // Record that user viewed this park
      recordParkView(parkCode);
    }
  }, [parkCode, recordParkView]);

  return {
    recordParkView: () => recordParkView(parkCode)
  };
};

/**
 * Hook for search prefetching
 */
export const useSearchPrefetch = () => {
  const { recordSearch } = useSmartPrefetch();

  const handleSearch = useCallback((query) => {
    if (query && query.trim().length > 2) {
      recordSearch(query.trim());
    }
  }, [recordSearch]);

  return {
    handleSearch
  };
};
