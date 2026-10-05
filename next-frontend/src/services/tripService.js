import api from './api';

const tripService = {
  // Get user's trips (never cache — list must reflect new chats immediately)
  getUserTrips: async (userId) => {
    const response = await api.get(`/trips/user/${userId}`, {}, { skipCache: true });
    return response.data;
  },

  // Get single trip
  getTrip: async (tripId, options = {}) => {
    const response = await api.get(`/trips/${tripId}`, options);
    return response.data;
  },

  // Create trip
  createTrip: async (tripData) => {
    const response = await api.post('/trips', tripData);
    return response.data;
  },

  // Update trip
  updateTrip: async (tripId, tripData) => {
    const response = await api.put(`/trips/${tripId}`, tripData);
    return response.data;
  },

  // Add message to trip
  addMessage: async (tripId, messageData) => {
    const response = await api.post(`/trips/${tripId}/messages`, messageData);
    return response.data;
  },

  // Stage 8.1 — narrow feedback command. Updates ONLY userFeedback on one
  // message; never rewrites conversation content or the plan.
  updateMessageFeedback: async (tripId, messageId, feedback) => {
    const response = await api.patch(`/trips/${tripId}/messages/${messageId}/feedback`, { feedback });
    return response.data;
  },

  // Delete trip
  deleteTrip: async (tripId) => {
    const response = await api.delete(`/trips/${tripId}`);
    return response.data;
  },

  // Stage 8.3 — narrow trip-management metadata command (title/status/shareScope).
  // Kept separate from response saves so a stale auto-save can never change these.
  updateTripMetadata: async (tripId, metadata) => {
    const response = await api.patch(`/trips/${tripId}/metadata`, metadata);
    return response.data;
  },

  // Archive trip (via the narrow metadata command)
  archiveTrip: async (tripId) => {
    const response = await api.patch(`/trips/${tripId}/metadata`, { status: 'archived' });
    return response.data;
  },

  // Restore/Unarchive trip (via the narrow metadata command)
  unarchiveTrip: async (tripId) => {
    const response = await api.patch(`/trips/${tripId}/metadata`, { status: 'active' });
    return response.data;
  },

  // Generate or fetch public share link
  shareTrip: async (tripId) => {
    const response = await api.post(`/trips/${tripId}/share`);
    return response.data;
  },
};

export default tripService;
