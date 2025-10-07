import { useQuery } from '@tanstack/react-query';
import reviewService from '../services/reviewService';

export const useUserReviews = () => {
  return useQuery({
    queryKey: ['userReviews'],
    queryFn: () => reviewService.getUserReviews(),
    staleTime: 1000 * 60 * 5, // 5 minutes - user reviews change less frequently
    cacheTime: 1000 * 60 * 30, // 30 minutes - keep in cache for reasonable time
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    retry: 2,
  });
};
