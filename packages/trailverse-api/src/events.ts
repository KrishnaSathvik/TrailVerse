import type { ApiClient } from './client';

export function createEventsApi(client: ApiClient) {
  return {
    getEvents(params?: Record<string, string | number | boolean>) {
      return client.get<unknown[]>('/events', { params });
    },

    registerForEvent(eventId: string, data?: Record<string, unknown>) {
      return client.post<unknown>(`/events/${eventId}/register`, data);
    },
  };
}

export type EventsApi = ReturnType<typeof createEventsApi>;
