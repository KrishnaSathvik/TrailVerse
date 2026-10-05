import type { ApiClient } from './client';
import type { User } from './types';

export function createUserApi(client: ApiClient) {
  return {
    getProfile() {
      return client.get<User>('/users/profile');
    },

    updateProfile(profileData: Record<string, unknown>) {
      return client.put<User>('/users/profile', profileData);
    },

    getSavedParks() {
      return client.get<unknown[]>('/users/saved-parks');
    },

    savePark(parkCode: string, parkName: string) {
      return client.post<unknown>('/users/saved-parks', { parkCode, parkName });
    },

    removeSavedPark(parkCode: string) {
      return client.delete<unknown>(`/users/saved-parks/${parkCode}`);
    },

    checkParkSaved(parkCode: string) {
      return client.get<{ isSaved: boolean }>(`/users/saved-parks/${parkCode}/check`);
    },

    getVisitedParks() {
      return client.get<unknown[]>('/users/visited-parks');
    },

    markParkAsVisited(
      parkCode: string,
      data?: {
        visitDate?: string | Date | null;
        rating?: number | null;
        parkName?: string | null;
        imageUrl?: string | null;
        notes?: string | null;
      },
    ) {
      return client.post<unknown>(`/users/visited-parks/${parkCode}`, data || {});
    },

    checkParkVisited(parkCode: string) {
      return client.get<unknown>(`/users/visited-parks/${parkCode}`);
    },

    updateVisitedPark(
      parkCode: string,
      data?: { visitDate?: string | Date | null; rating?: number | null; notes?: string | null },
    ) {
      return client.put<unknown>(`/users/visited-parks/${parkCode}`, data || {});
    },

    removeVisitedPark(parkCode: string) {
      return client.delete<unknown>(`/users/visited-parks/${parkCode}`);
    },

    getUserStats() {
      return client.get<unknown>('/users/stats');
    },
  };
}

export type UserApi = ReturnType<typeof createUserApi>;
