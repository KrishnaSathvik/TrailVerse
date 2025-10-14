import { useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import userService from '../services/userService';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useWebSocket } from './useWebSocket';
import cacheService from '../services/cacheService';

export const useVisitedParks = () => {
  const { isAuthenticated, user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { subscribe, unsubscribe, subscribeToVisited } = useWebSocket();

  // Query for visited parks
  const {
    data: visitedParks = [],
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['visitedParks'],
    queryFn: userService.getVisitedParks,
    enabled: isAuthenticated,
    staleTime: 0, // Always consider stale so refetchOnMount works
    refetchOnMount: true, // Always refetch when component mounts to get fresh data
    refetchOnWindowFocus: false, // Don't refetch on window focus - WebSocket handles this
  });

  // Mutation for marking a park as visited
  const markAsVisitedMutation = useMutation({
    mutationFn: ({ parkCode, visitDate, rating, parkName, imageUrl, notes }) =>
      userService.markParkAsVisited(parkCode, visitDate, rating, parkName, imageUrl, notes),
    onSuccess: () => {
      queryClient.invalidateQueries(['visitedParks']);
      showToast('Park marked as visited! 🎉', 'success');
    },
    onError: (error) => {
      console.error('Error marking park as visited:', error);
      if (error.response?.status === 400 && error.response?.data?.error === 'Park is already marked as visited') {
        showToast('This park is already marked as visited!', 'info');
      } else {
        showToast('Error marking park as visited', 'error');
      }
    }
  });

  // Mutation for removing a visited park
  const removeVisitedMutation = useMutation({
    mutationFn: (parkCode) => userService.removeVisitedPark(parkCode),
    onSuccess: () => {
      queryClient.invalidateQueries(['visitedParks']);
      showToast('Park removed from visited list', 'success');
    },
    onError: (error) => {
      console.error('Error removing visited park:', error);
      showToast('Error removing visited park', 'error');
    }
  });

  // Mutation for updating a visited park
  const updateVisitedMutation = useMutation({
    mutationFn: ({ parkCode, visitDate, rating, notes }) =>
      userService.updateVisitedPark(parkCode, visitDate, rating, notes),
    onSuccess: () => {
      queryClient.invalidateQueries(['visitedParks']);
      showToast('Visited park updated successfully', 'success');
    },
    onError: (error) => {
      console.error('Error updating visited park:', error);
      showToast('Error updating visited park', 'error');
    }
  });

  // Check if a specific park is visited
  const isParkVisited = useCallback((parkCode) => {
    return visitedParks.some(park => park.parkCode === parkCode);
  }, [visitedParks]);

  // Get visited park details
  const getVisitedPark = useCallback((parkCode) => {
    return visitedParks.find(park => park.parkCode === parkCode);
  }, [visitedParks]);

  // Mark park as visited
  const markAsVisited = useCallback((parkCode, visitDate = null, rating = null, parkName = null, imageUrl = null, notes = null) => {
    if (!isAuthenticated) {
      showToast('Please login to mark parks as visited', 'warning');
      return Promise.reject(new Error('Not authenticated'));
    }
    
    return markAsVisitedMutation.mutateAsync({
      parkCode,
      visitDate,
      rating,
      parkName,
      imageUrl,
      notes
    });
  }, [isAuthenticated, markAsVisitedMutation, showToast]);

  // Remove visited park
  const removeVisited = useCallback((parkCode) => {
    if (!isAuthenticated) {
      showToast('Please login to manage visited parks', 'warning');
      return Promise.reject(new Error('Not authenticated'));
    }
    
    return removeVisitedMutation.mutateAsync(parkCode);
  }, [isAuthenticated, removeVisitedMutation, showToast]);

  // Update visited park
  const updateVisited = useCallback((parkCode, visitDate = null, rating = null, notes = null) => {
    if (!isAuthenticated) {
      showToast('Please login to manage visited parks', 'warning');
      return Promise.reject(new Error('Not authenticated'));
    }
    
    return updateVisitedMutation.mutateAsync({
      parkCode,
      visitDate,
      rating,
      notes
    });
  }, [isAuthenticated, updateVisitedMutation, showToast]);

  // Refresh visited parks
  const refreshVisitedParks = useCallback(() => {
    return refetch();
  }, [refetch]);

  // Setup WebSocket real-time sync
  useEffect(() => {
    if (!user || !isAuthenticated) return;

    // Subscribe to visited channel
    subscribeToVisited();

    // Handle park visited added from another device/tab
    const handleParkVisitedAdded = (visitedPark) => {
      console.log('[Real-Time] Park visited added:', visitedPark);
      
      // Invalidate EnhancedApi cache
      console.log('[Real-Time] 🔥 Invalidating EnhancedApi cache for visited parks');
      cacheService.clearByType('visitedParks');
      
      // Update cache
      queryClient.setQueryData(['visitedParks'], (old = []) => {
        if (old.some(v => v.parkCode === visitedPark.parkCode)) {
          console.log('[Real-Time] Duplicate visited park, skipping');
          return old;
        }
        return [...old, visitedPark];
      });
    };

    // Handle park visited removed from another device/tab
    const handleParkVisitedRemoved = (data) => {
      console.log('[Real-Time] Park visited removed:', data);
      
      // Invalidate EnhancedApi cache
      console.log('[Real-Time] 🔥 Invalidating EnhancedApi cache for visited parks');
      cacheService.clearByType('visitedParks');
      
      // Update cache
      queryClient.setQueryData(['visitedParks'], (old = []) => {
        return old.filter(v => v.parkCode !== data.parkCode);
      });
    };

    // Subscribe to WebSocket events
    subscribe('parkVisitedAdded', handleParkVisitedAdded);
    subscribe('parkVisitedRemoved', handleParkVisitedRemoved);

    return () => {
      unsubscribe('parkVisitedAdded', handleParkVisitedAdded);
      unsubscribe('parkVisitedRemoved', handleParkVisitedRemoved);
    };
  }, [user, isAuthenticated, subscribe, unsubscribe, subscribeToVisited, queryClient]);

  // Auto-refresh functionality with visibility change and custom events
  useEffect(() => {
    if (!isAuthenticated) return;

    // Auto-refresh every 30 seconds (reduced from 10s since WebSocket now handles real-time)
    const autoRefreshInterval = setInterval(() => {
      console.log('[Auto-Refresh] Refreshing visited parks...');
      queryClient.invalidateQueries(['visitedParks']);
    }, 30000);

    // Refresh when page becomes visible
    const handleVisibilityChange = () => {
      if (!document.hidden && isAuthenticated) {
        console.log('[Visibility] Page became visible, refreshing visited parks...');
        queryClient.invalidateQueries(['visitedParks']);
      }
    };

    // Manual refresh event
    const handleRefreshEvent = () => {
      if (isAuthenticated) {
        console.log('[Custom Event] Refresh visited parks event received');
        queryClient.invalidateQueries(['visitedParks']);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('refreshVisitedParks', handleRefreshEvent);

    return () => {
      clearInterval(autoRefreshInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('refreshVisitedParks', handleRefreshEvent);
    };
  }, [isAuthenticated, queryClient]);

  return {
    visitedParks,
    isLoading,
    error,
    isParkVisited,
    getVisitedPark,
    markAsVisited,
    removeVisited,
    updateVisited,
    refreshVisitedParks,
    // Mutation states
    markingAsVisited: markAsVisitedMutation.isPending,
    removingVisited: removeVisitedMutation.isPending,
    updatingVisited: updateVisitedMutation.isPending
  };
};
