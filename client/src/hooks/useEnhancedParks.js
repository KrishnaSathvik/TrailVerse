import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import enhancedParkService from '../services/enhancedParkService';

// Hook for enhanced park data
export const useEnhancedParkData = (parkCode, options = {}) => {
  return useQuery({
    queryKey: ['enhancedPark', parkCode],
    queryFn: () => enhancedParkService.getEnhancedParkData(parkCode),
    enabled: !!parkCode,
    staleTime: 2 * 60 * 60 * 1000, // 2 hours
    cacheTime: 24 * 60 * 60 * 1000, // 24 hours
    refetchOnWindowFocus: false,
    ...options
  });
};

// Hook for park comparison
export const useParkComparison = (parkCodes, options = {}) => {
  return useQuery({
    queryKey: ['parkComparison', parkCodes?.sort()],
    queryFn: () => enhancedParkService.getParkComparison(parkCodes),
    enabled: !!parkCodes && parkCodes.length >= 2,
    staleTime: 30 * 60 * 1000, // 30 minutes
    cacheTime: 2 * 60 * 60 * 1000, // 2 hours
    refetchOnWindowFocus: false,
    ...options
  });
};

// Hook for park comparison summary
export const useParkComparisonSummary = (parkCodes, options = {}) => {
  return useQuery({
    queryKey: ['parkComparisonSummary', parkCodes?.sort()],
    queryFn: () => enhancedParkService.getParkComparisonSummary(parkCodes),
    enabled: !!parkCodes && parkCodes.length >= 2,
    staleTime: 30 * 60 * 1000, // 30 minutes
    cacheTime: 2 * 60 * 60 * 1000, // 2 hours
    refetchOnWindowFocus: false,
    ...options
  });
};

// Hook for park weather
export const useParkWeather = (parkCode, options = {}) => {
  return useQuery({
    queryKey: ['parkWeather', parkCode],
    queryFn: () => enhancedParkService.getParkWeather(parkCode),
    enabled: !!parkCode,
    staleTime: 15 * 60 * 1000, // 15 minutes
    cacheTime: 60 * 60 * 1000, // 1 hour
    refetchOnWindowFocus: false,
    ...options
  });
};

// Hook for park crowd level
export const useParkCrowdLevel = (parkCode, date = null, options = {}) => {
  return useQuery({
    queryKey: ['parkCrowdLevel', parkCode, date?.toDateString()],
    queryFn: () => enhancedParkService.getParkCrowdLevel(parkCode, date),
    enabled: !!parkCode,
    staleTime: 60 * 60 * 1000, // 1 hour
    cacheTime: 4 * 60 * 60 * 1000, // 4 hours
    refetchOnWindowFocus: false,
    ...options
  });
};

// Hook for best time to visit
export const useBestTimeToVisit = (parkCode, options = {}) => {
  return useQuery({
    queryKey: ['bestTimeToVisit', parkCode],
    queryFn: () => enhancedParkService.getBestTimeToVisit(parkCode),
    enabled: !!parkCode,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
    cacheTime: 7 * 24 * 60 * 60 * 1000, // 7 days
    refetchOnWindowFocus: false,
    ...options
  });
};

// Hook for park facilities
export const useParkFacilities = (parkCode, options = {}) => {
  return useQuery({
    queryKey: ['parkFacilities', parkCode],
    queryFn: () => enhancedParkService.getParkFacilities(parkCode),
    enabled: !!parkCode,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
    cacheTime: 7 * 24 * 60 * 60 * 1000, // 7 days
    refetchOnWindowFocus: false,
    ...options
  });
};

// Hook for park reviews
export const useParkReviews = (parkCode, options = {}) => {
  const { page = 1, limit = 10, sort = 'newest', rating, verified } = options;
  
  return useQuery({
    queryKey: ['parkReviews', parkCode, { page, limit, sort, rating, verified }],
    queryFn: () => enhancedParkService.getParkReviews(parkCode, options),
    enabled: !!parkCode,
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
  });
};

// Hook for park review statistics
export const useParkReviewStats = (parkCode, options = {}) => {
  return useQuery({
    queryKey: ['parkReviewStats', parkCode],
    queryFn: () => enhancedParkService.getParkReviewStats(parkCode),
    enabled: !!parkCode,
    staleTime: 10 * 60 * 1000, // 10 minutes
    cacheTime: 60 * 60 * 1000, // 1 hour
    refetchOnWindowFocus: false,
    ...options
  });
};

// Hook for top rated parks
export const useTopRatedParks = (limit = 10, options = {}) => {
  return useQuery({
    queryKey: ['topRatedParks', limit],
    queryFn: () => enhancedParkService.getTopRatedParks(limit),
    staleTime: 60 * 60 * 1000, // 1 hour
    cacheTime: 4 * 60 * 60 * 1000, // 4 hours
    refetchOnWindowFocus: false,
    ...options
  });
};

// Hook for user reviews
export const useUserReviews = (options = {}) => {
  const { page = 1, limit = 10 } = options;
  
  return useQuery({
    queryKey: ['userReviews', { page, limit }],
    queryFn: () => enhancedParkService.getUserReviews(options),
    staleTime: 2 * 60 * 1000, // 2 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
  });
};

// Mutation hooks
export const useCreateParkReview = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ parkCode, reviewData }) => 
      enhancedParkService.createParkReview(parkCode, reviewData),
    onSuccess: (data, variables) => {
      // Invalidate related queries
      queryClient.invalidateQueries(['parkReviews', variables.parkCode]);
      queryClient.invalidateQueries(['parkReviewStats', variables.parkCode]);
      queryClient.invalidateQueries(['enhancedPark', variables.parkCode]);
      queryClient.invalidateQueries(['userReviews']);
    }
  });
};

export const useUpdateParkReview = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ reviewId, reviewData }) => 
      enhancedParkService.updateParkReview(reviewId, reviewData),
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries(['parkReviews']);
      queryClient.invalidateQueries(['parkReviewStats']);
      queryClient.invalidateQueries(['userReviews']);
      queryClient.invalidateQueries(['enhancedPark']);
    }
  });
};

export const useDeleteParkReview = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (reviewId) => 
      enhancedParkService.deleteParkReview(reviewId),
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries(['parkReviews']);
      queryClient.invalidateQueries(['parkReviewStats']);
      queryClient.invalidateQueries(['userReviews']);
      queryClient.invalidateQueries(['enhancedPark']);
    }
  });
};

export const useVoteOnReview = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ reviewId, isHelpful }) => 
      enhancedParkService.voteOnReview(reviewId, isHelpful),
    onSuccess: () => {
      // Invalidate reviews queries
      queryClient.invalidateQueries(['parkReviews']);
    }
  });
};

// Utility hook for batch fetching enhanced data
export const useBatchEnhancedData = (parkCodes, options = {}) => {
  return useQuery({
    queryKey: ['batchEnhancedData', parkCodes?.sort()],
    queryFn: () => enhancedParkService.getBatchEnhancedData(parkCodes),
    enabled: !!parkCodes && parkCodes.length > 0,
    staleTime: 2 * 60 * 60 * 1000, // 2 hours
    cacheTime: 24 * 60 * 60 * 1000, // 24 hours
    refetchOnWindowFocus: false,
    ...options
  });
};
