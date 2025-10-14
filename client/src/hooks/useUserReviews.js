import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import reviewService from '../services/reviewService';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from './useWebSocket';
import cacheService from '../services/cacheService';

export const useUserReviews = () => {
  const { isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();
  const { subscribe, unsubscribe, subscribeToReviews } = useWebSocket();
  
  const queryResult = useQuery({
    queryKey: ['userReviews'],
    queryFn: () => reviewService.getUserReviews(),
    enabled: isAuthenticated,
    staleTime: 0, // Always consider stale so refetchOnMount works
    refetchOnMount: true, // Always refetch when component mounts to get fresh data
    refetchOnWindowFocus: false, // Don't refetch on window focus - WebSocket handles this
    retry: 2,
  });

  // Setup WebSocket real-time sync
  useEffect(() => {
    if (!user || !isAuthenticated) return;

    // Subscribe to reviews channel
    subscribeToReviews();

    // Handle review added from another device/tab
    const handleReviewAdded = (review) => {
      console.log('[Real-Time] Review added:', review);
      
      // Invalidate EnhancedApi cache
      console.log('[Real-Time] 🔥 Invalidating EnhancedApi cache for reviews');
      cacheService.clearByType('reviews');
      
      // Invalidate React Query to refetch
      queryClient.invalidateQueries(['userReviews']);
    };

    // Handle review updated from another device/tab
    const handleReviewUpdated = (review) => {
      console.log('[Real-Time] Review updated:', review);
      
      // Invalidate EnhancedApi cache
      console.log('[Real-Time] 🔥 Invalidating EnhancedApi cache for reviews');
      cacheService.clearByType('reviews');
      
      // Invalidate React Query to refetch
      queryClient.invalidateQueries(['userReviews']);
    };

    // Handle review deleted from another device/tab
    const handleReviewDeleted = (data) => {
      console.log('[Real-Time] Review deleted:', data);
      
      // Invalidate EnhancedApi cache
      console.log('[Real-Time] 🔥 Invalidating EnhancedApi cache for reviews');
      cacheService.clearByType('reviews');
      
      // Invalidate React Query to refetch
      queryClient.invalidateQueries(['userReviews']);
    };

    // Handle review vote updated
    const handleReviewVoteUpdated = (data) => {
      console.log('[Real-Time] Review vote updated:', data);
      
      // Invalidate EnhancedApi cache
      console.log('[Real-Time] 🔥 Invalidating EnhancedApi cache for reviews');
      cacheService.clearByType('reviews');
      
      // Invalidate React Query to refetch
      queryClient.invalidateQueries(['userReviews']);
    };

    // Subscribe to WebSocket events
    subscribe('reviewAdded', handleReviewAdded);
    subscribe('reviewUpdated', handleReviewUpdated);
    subscribe('reviewDeleted', handleReviewDeleted);
    subscribe('reviewVoteUpdated', handleReviewVoteUpdated);

    return () => {
      unsubscribe('reviewAdded', handleReviewAdded);
      unsubscribe('reviewUpdated', handleReviewUpdated);
      unsubscribe('reviewDeleted', handleReviewDeleted);
      unsubscribe('reviewVoteUpdated', handleReviewVoteUpdated);
    };
  }, [user, isAuthenticated, subscribe, unsubscribe, subscribeToReviews, queryClient]);

  // Auto-refresh functionality with visibility change and custom events
  useEffect(() => {
    if (!isAuthenticated) return;

    // Auto-refresh every 30 seconds (reduced since WebSocket now handles real-time)
    const autoRefreshInterval = setInterval(() => {
      console.log('[Auto-Refresh] Refreshing user reviews...');
      queryClient.invalidateQueries(['userReviews']);
    }, 30000);

    // Refresh when page becomes visible
    const handleVisibilityChange = () => {
      if (!document.hidden && isAuthenticated) {
        console.log('[Visibility] Page became visible, refreshing user reviews...');
        queryClient.invalidateQueries(['userReviews']);
      }
    };

    // Manual refresh event
    const handleRefreshEvent = () => {
      if (isAuthenticated) {
        console.log('[Custom Event] Refresh user reviews event received');
        queryClient.invalidateQueries(['userReviews']);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('refreshUserReviews', handleRefreshEvent);

    return () => {
      clearInterval(autoRefreshInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('refreshUserReviews', handleRefreshEvent);
    };
  }, [isAuthenticated, queryClient]);

  return queryResult;
};
