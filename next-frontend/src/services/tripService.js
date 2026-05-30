import api from './api';

const tripService = {
  // Get user's trips (never cache — list must reflect new chats immediately)
  getUserTrips: async (userId) => {
    const response = await api.get(`/trips/user/${userId}`, {}, { skipCache: true });
    return response.data;
  },

  // Get single trip
  getTrip: async (tripId) => {
    const response = await api.get(`/trips/${tripId}`);
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

  // Delete trip
  deleteTrip: async (tripId) => {
    const response = await api.delete(`/trips/${tripId}`);
    return response.data;
  },

  // Archive trip
  archiveTrip: async (tripId) => {
    const response = await api.put(`/trips/${tripId}`, { status: 'archived' });
    return response.data;
  },

  // Restore/Unarchive trip
  unarchiveTrip: async (tripId) => {
    const response = await api.put(`/trips/${tripId}`, { status: 'active' });
    return response.data;
  },

  // Generate or fetch public share link
  shareTrip: async (tripId) => {
    const response = await api.post(`/trips/${tripId}/share`);
    return response.data;
  },
};

export default tripService;
