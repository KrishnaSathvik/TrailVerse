import { useQuery } from '@tanstack/react-query';
import reviewService from '../services/reviewService';

export const useParkRatings = () => {
  return useQuery({
    queryKey: ['parkRatings'],
    queryFn: () => reviewService.getAllParkRatings(),
    staleTime: 1000 * 60 * 15, // 15 minutes - ratings change more frequently than park data
    cacheTime: 1000 * 60 * 60 * 2, // 2 hours - keep in cache for reasonable time
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 2,
  });
};
