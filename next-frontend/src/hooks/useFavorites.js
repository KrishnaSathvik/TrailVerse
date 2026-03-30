import { useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from './useWebSocket';
import favoriteService from '../services/favoriteService';
import cacheService from '../services/cacheService';

export const useFavorites = () => {
  const { user, isAuthenticated } = useAuth();
  const { subscribe, unsubscribe, subscribeToFavorites } = useWebSocket();
  const queryClient = useQueryClient();

  // Query for favorites using React Query
  const {
    data: favorites = [],
    isLoading: loading,
    error,
    refetch: refreshFavorites
  } = useQuery({
    queryKey: ['favorites', user?.id || user?._id],
    queryFn: async () => {
      const userId = user?.id || user?._id;
      console.log('[useFavorites] Fetching favorites for user:', userId);
      if (!userId) {
        throw new Error('User ID not found');
      }
      const response = await favoriteService.getUserFavorites(userId);
      console.log('[useFavorites] API Response:', response);
      const favoritesData = Array.isArray(response.data) ? response.data : (response.data?.data || []);
      console.log('[useFavorites] Parsed favorites count:', favoritesData.length);
      console.log('[useFavorites] Favorites parkCodes:', favoritesData.map(f => f.parkCode));
      return favoritesData;
    },
    enabled: isAuthenticated && !!(user?.id || user?._id),
    staleTime: 0, // Always consider stale so refetchOnMount works
    refetchOnMount: true, // Always refetch when component mounts to get fresh data
    refetchOnWindowFocus: false, // Don't refetch on window focus - WebSocket handles this
  });

  // Mutation for adding a favorite with optimistic updates
  const addFavoriteMutation = useMutation({
    mutationFn: (parkData) => favoriteService.addFavorite(parkData),
    onMutate: async (parkData) => {
      console.log('[Mutation] Adding favorite:', parkData.parkCode);
      
      // Cancel any outgoing refetches to prevent race conditions
      await queryClient.cancelQueries(['favorites', user?.id || user?._id]);

      // Snapshot the previous value
      const previousFavorites = queryClient.getQueryData(['favorites', user?.id || user?._id]);
      console.log('[Mutation] Previous favorites count:', previousFavorites?.length || 0);

      // Optimistically update to the new value
      const userId = user?.id || user?._id;
      queryClient.setQueryData(['favorites', userId], (old = []) => {
        const tempFavorite = { ...parkData, _id: `temp-${Date.now()}`, user: userId };
        const updated = [...old, tempFavorite];
        console.log('[Mutation] Optimistic update - new count:', updated.length);
        return updated;
      });

      // Return context with the previous value
      return { previousFavorites, userId };
    },
    onSuccess: (response, parkData, context) => {
      console.log('[Mutation] Success! Server response:', response);
      const userId = context.userId;
      
      // Replace the optimistic entry with the real data from the server
      queryClient.setQueryData(['favorites', userId], (old = []) => {
        // Check if we already have this favorite (could be from WebSocket)
        const existingIndex = old.findIndex(fav => fav.parkCode === parkData.parkCode && !fav._id?.startsWith('temp-'));
        
        if (existingIndex >= 0) {
          // Already have the real favorite (from WebSocket), just remove temp if any
          const updated = old.filter(fav => !(fav._id?.startsWith('temp-') && fav.parkCode === parkData.parkCode));
          console.log('[Mutation] Real favorite already exists (WebSocket), removed temp, count:', updated.length);
          return updated;
        }
        
        // Replace temp with real data
        const updated = old.map(fav => 
          fav._id?.startsWith('temp-') && fav.parkCode === parkData.parkCode 
            ? response.data 
            : fav
        );
        console.log('[Mutation] Replaced temp with real data, count:', updated.length);
        return updated;
      });
      
      // No need to invalidate immediately - WebSocket will handle real-time updates
      // and the optimistic update ensures immediate UI feedback
    },
    onError: (error, parkData, context) => {
      console.error('[Mutation] Error adding favorite:', error);
      // Rollback to previous value on error
      if (context?.previousFavorites && context?.userId) {
        queryClient.setQueryData(['favorites', context.userId], context.previousFavorites);
      }
    }
  });

  // Mutation for removing a favorite with optimistic updates
  const removeFavoriteMutation = useMutation({
    mutationFn: (parkCode) => favoriteService.removeFavorite(parkCode),
    onMutate: async (parkCode) => {
      console.log('[Mutation] Removing favorite:', parkCode);
      
      // Cancel any outgoing refetches to prevent race conditions
      await queryClient.cancelQueries(['favorites', user?.id || user?._id]);

      // Snapshot the previous value
      const previousFavorites = queryClient.getQueryData(['favorites', user?.id || user?._id]);
      console.log('[Mutation] Previous favorites count:', previousFavorites?.length || 0);

      // Optimistically remove from cache
      const userId = user?.id || user?._id;
      queryClient.setQueryData(['favorites', userId], (old = []) => {
        const updated = old.filter(fav => fav.parkCode !== parkCode);
        console.log('[Mutation] After removal - new count:', updated.length);
        return updated;
      });

      // Return context with the previous value
      return { previousFavorites, userId };
    },
    onSuccess: (response, parkCode, context) => {
      console.log('[Mutation] Remove success!');
      const userId = context.userId;
      
      // Ensure the favorite is removed from cache (optimistic update should have already done this)
      queryClient.setQueryData(['favorites', userId], (old = []) => {
        const updated = old.filter(fav => fav.parkCode !== parkCode);
        console.log('[Mutation] Ensured favorite removed, count:', updated.length);
        return updated;
      });
      
      // No need to invalidate immediately - optimistic update ensures immediate UI feedback
    },
    onError: (error, parkCode, context) => {
      console.error('[Mutation] Error removing favorite:', error);
      // Rollback to previous value on error
      if (context?.previousFavorites && context?.userId) {
        queryClient.setQueryData(['favorites', context.userId], context.previousFavorites);
      }
    }
  });

  // Mutation for updating a favorite
  const updateFavoriteMutation = useMutation({
    mutationFn: ({ favoriteId, favoriteData }) => 
      favoriteService.updateFavorite(favoriteId, favoriteData),
    onSuccess: () => {
      // Invalidate and refetch favorites
      queryClient.invalidateQueries(['favorites']);
    },
    onError: (error) => {
      console.error('Error updating favorite:', error);
    }
  });

  // Setup WebSocket real-time sync with auto-refresh fallback
  useEffect(() => {
    if (!user || !isAuthenticated) return;

    // Subscribe to favorites channel
    subscribeToFavorites();

    // Handle favorite added from another device/tab
    const handleFavoriteAdded = (favorite) => {
      console.log('[Real-Time] Favorite added:', favorite);
      const userId = user?.id || user?._id;
      console.log('[Real-Time] Updating cache for user:', userId);
      
      // CRITICAL: Invalidate EnhancedApi cache so next fetch gets fresh data
      console.log('[Real-Time] 🔥 Invalidating EnhancedApi cache for favorites');
      cacheService.clearByType('favorites');
      
      // Update cache directly instead of invalidating
      queryClient.setQueryData(['favorites', userId], (old = []) => {
        console.log('[Real-Time] Current favorites in cache:', old.length);
        // Avoid duplicates
        if (old.some(f => f.parkCode === favorite.parkCode)) {
          console.log('[Real-Time] Duplicate favorite detected, skipping');
          return old;
        }
        const updated = [...old, favorite];
        console.log('[Real-Time] Updated favorites count:', updated.length);
        return updated;
      });
      
      // Force a re-render by invalidating after setting
      setTimeout(() => {
        queryClient.invalidateQueries(['favorites', userId]);
      }, 100);
    };

    // Handle favorite removed from another device/tab
    const handleFavoriteRemoved = (data) => {
      console.log('[Real-Time] Favorite removed:', data);
      const userId = user?.id || user?._id;
      
      // CRITICAL: Invalidate EnhancedApi cache so next fetch gets fresh data
      console.log('[Real-Time] 🔥 Invalidating EnhancedApi cache for favorites');
      cacheService.clearByType('favorites');
      
      // Update cache directly instead of invalidating
      queryClient.setQueryData(['favorites', userId], (old = []) => {
        const updated = old.filter(f => f.parkCode !== data.parkCode);
        console.log('[Real-Time] Favorites after removal:', updated.length);
        return updated;
      });
      
      // Force a re-render by invalidating after setting
      setTimeout(() => {
        queryClient.invalidateQueries(['favorites', userId]);
      }, 100);
    };

    // Subscribe to WebSocket events
    subscribe('favoriteAdded', handleFavoriteAdded);
    subscribe('favoriteRemoved', handleFavoriteRemoved);

    // Auto-refresh fallback - refetch every 30 seconds as a safety net
    // This is only needed if WebSocket events are missed
    const autoRefreshInterval = setInterval(() => {
      console.log('[Auto-Refresh] Safety refresh of favorites...');
      queryClient.invalidateQueries(['favorites', user?.id || user?._id]);
    }, 30000); // Reduced frequency since WebSocket should handle real-time updates

    // Cleanup
    return () => {
      unsubscribe('favoriteAdded', handleFavoriteAdded);
      unsubscribe('favoriteRemoved', handleFavoriteRemoved);
      clearInterval(autoRefreshInterval);
    };
  }, [user, isAuthenticated, subscribe, unsubscribe, subscribeToFavorites, queryClient]);

  // Refresh favorites when page becomes visible (tab switching) or on custom event
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && user && isAuthenticated) {
        console.log('[Visibility] Page became visible, refreshing favorites...');
        queryClient.invalidateQueries(['favorites', user?.id || user?._id]);
      }
    };

    const handleRefreshEvent = () => {
      if (user && isAuthenticated) {
        console.log('[Custom Event] Refresh favorites event received');
        queryClient.invalidateQueries(['favorites', user?.id || user?._id]);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('refreshFavorites', handleRefreshEvent);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('refreshFavorites', handleRefreshEvent);
    };
  }, [user, isAuthenticated, queryClient]);

  // Wrapper functions to maintain the same API
  const addFavorite = useCallback(async (parkData) => {
    return addFavoriteMutation.mutateAsync(parkData);
  }, [addFavoriteMutation]);

  const removeFavorite = useCallback(async (parkCode) => {
    return removeFavoriteMutation.mutateAsync(parkCode);
  }, [removeFavoriteMutation]);

  const updateFavorite = useCallback(async (favoriteId, favoriteData) => {
    return updateFavoriteMutation.mutateAsync({ favoriteId, favoriteData });
  }, [updateFavoriteMutation]);

  // Check if a specific park is favorited
  const isParkFavorited = useCallback((parkCode) => {
    return favorites.some(fav => fav.parkCode === parkCode);
  }, [favorites]);

  // Get favorite details
  const getFavorite = useCallback((parkCode) => {
    return favorites.find(fav => fav.parkCode === parkCode);
  }, [favorites]);

  return {
    favorites,
    loading,
    error: error?.message,
    addFavorite,
    removeFavorite,
    updateFavorite,
    isParkFavorited,
    getFavorite,
    refreshFavorites
  };
};
