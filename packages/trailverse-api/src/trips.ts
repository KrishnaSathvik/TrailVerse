import type { ApiClient } from './client';

export function createTripsApi(client: ApiClient) {
  return {
    getUserTrips(userId: string) {
      return client.get<unknown[]>(`/trips/user/${userId}`);
    },

    getTrip(tripId: string) {
      return client.get<unknown>(`/trips/${tripId}`);
    },

    createTrip(tripData: Record<string, unknown>) {
      return client.post<unknown>('/trips', tripData);
    },

    updateTrip(tripId: string, tripData: Record<string, unknown>) {
      return client.put<unknown>(`/trips/${tripId}`, tripData);
    },

    addMessage(tripId: string, messageData: Record<string, unknown>) {
      return client.post<unknown>(`/trips/${tripId}/messages`, messageData);
    },

    deleteTrip(tripId: string) {
      return client.delete<void>(`/trips/${tripId}`);
    },

    archiveTrip(tripId: string) {
      return client.put<unknown>(`/trips/${tripId}`, { status: 'archived' });
    },

    unarchiveTrip(tripId: string) {
      return client.put<unknown>(`/trips/${tripId}`, { status: 'active' });
    },

    shareTrip(tripId: string) {
      return client.post<unknown>(`/trips/${tripId}/share`);
    },

    getSharedTrip(shareId: string) {
      return client.get<unknown>(`/trips/shared/${shareId}`);
    },
  };
}

export type TripsApi = ReturnType<typeof createTripsApi>;
