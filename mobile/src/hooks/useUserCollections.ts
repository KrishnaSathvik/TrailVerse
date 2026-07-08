import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getApi } from '@/src/lib/api';
import { useAuth } from '@/src/providers/AuthProvider';

export function useSavedParks() {
  const { isAuthenticated, showLoginPrompt } = useAuth();
  const queryClient = useQueryClient();
  const api = getApi();

  const query = useQuery({
    queryKey: ['saved-parks'],
    enabled: isAuthenticated,
    queryFn: () => api.user.getSavedParks(),
  });

  const saveMutation = useMutation({
    mutationFn: ({ parkCode, parkName }: { parkCode: string; parkName: string }) =>
      api.user.savePark(parkCode, parkName),
    onMutate: async ({ parkCode, parkName }) => {
      await queryClient.cancelQueries({ queryKey: ['saved-parks'] });
      const previous = queryClient.getQueryData<unknown[]>(['saved-parks']);
      queryClient.setQueryData(['saved-parks'], (old: unknown[] = []) => [
        ...old,
        { parkCode, parkName },
      ]);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['saved-parks'], context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['saved-parks'] }),
  });

  const removeMutation = useMutation({
    mutationFn: (parkCode: string) => api.user.removeSavedPark(parkCode),
    onMutate: async (parkCode) => {
      await queryClient.cancelQueries({ queryKey: ['saved-parks'] });
      const previous = queryClient.getQueryData<unknown[]>(['saved-parks']);
      queryClient.setQueryData(['saved-parks'], (old: unknown[] = []) =>
        old.filter((p) => (p as { parkCode?: string }).parkCode !== parkCode),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['saved-parks'], context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['saved-parks'] }),
  });

  const savePark = (parkCode: string, parkName: string) => {
    if (!isAuthenticated) {
      showLoginPrompt('Sign in to save parks');
      return;
    }
    saveMutation.mutate({ parkCode, parkName });
  };

  const removePark = (parkCode: string) => {
    if (!isAuthenticated) {
      showLoginPrompt('Sign in to manage saved parks');
      return;
    }
    removeMutation.mutate(parkCode);
  };

  return {
    ...query,
    savePark,
    removePark,
    isSaving: saveMutation.isPending,
    isRemoving: removeMutation.isPending,
  };
}

export function useVisitedParks() {
  const { isAuthenticated } = useAuth();
  const api = getApi();

  return useQuery({
    queryKey: ['visited-parks'],
    enabled: isAuthenticated,
    queryFn: () => api.user.getVisitedParks(),
  });
}

export function useUserTrips() {
  const { isAuthenticated, user } = useAuth();
  const api = getApi();

  return useQuery({
    queryKey: ['user-trips', user?._id],
    enabled: isAuthenticated && !!user?._id,
    queryFn: () => api.trips.getUserTrips(user!._id),
  });
}
