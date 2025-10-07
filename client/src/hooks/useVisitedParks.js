import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import userService from '../services/userService';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export const useVisitedParks = () => {
  const { isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

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
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
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
