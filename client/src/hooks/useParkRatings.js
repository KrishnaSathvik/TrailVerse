import { useQuery } from '@tanstack/react-query';
import reviewService from '../services/reviewService';

export const useParkRatings = () => {
  return useQuery({
    queryKey: ['parkRatings'],
    queryFn: () => reviewService.getAllParkRatings(),
    staleTime: 1000 * 60 * 5, // 5 minutes - ratings change frequently
    cacheTime: 1000 * 60 * 30, // 30 minutes - keep in cache for reasonable time
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    retry: 2,
  });
};
