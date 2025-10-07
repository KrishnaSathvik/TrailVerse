import enhancedApi from './enhancedApi';

const eventService = {
  // Get all events
  getEvents: async (params = {}) => {
    const result = await enhancedApi.get('/events', params, { 
      cacheType: 'events',
      ttl: 15 * 60 * 1000 // 15 minutes
    });
    return result.data;
  },

  // Get single event
  getEvent: async (eventId) => {
    const result = await enhancedApi.get(`/events/${eventId}`, {}, { 
      cacheType: 'events',
      ttl: 15 * 60 * 1000 // 15 minutes
    });
    return result.data;
  },

  // Register for event
  registerForEvent: async (eventId) => {
    const response = await enhancedApi.post(`/events/${eventId}/register`, {}, {
      invalidateCache: ['events', 'userEvents']
    });
    return response.data;
  },

  // Unregister from event
  unregisterFromEvent: async (eventId) => {
    const response = await enhancedApi.delete(`/events/${eventId}/register`, {
      invalidateCache: ['events', 'userEvents']
    });
    return response.data;
  },

  // Get user's events
  getUserEvents: async (userId) => {
    const result = await enhancedApi.get(`/events/user/${userId}`, {}, { 
      cacheType: 'userEvents',
      ttl: 10 * 60 * 1000 // 10 minutes
    });
    return result.data;
  },

  // Admin: Create event
  createEvent: async (eventData) => {
    const response = await enhancedApi.post('/events', eventData, {
      invalidateCache: ['events']
    });
    return response.data;
  },

  // Admin: Update event
  updateEvent: async (eventId, eventData) => {
    const response = await enhancedApi.put(`/events/${eventId}`, eventData, {
      invalidateCache: ['events', 'userEvents']
    });
    return response.data;
  },

  // Admin: Delete event
  deleteEvent: async (eventId) => {
    const response = await enhancedApi.delete(`/events/${eventId}`, {
      invalidateCache: ['events', 'userEvents']
    });
    return response.data;
  },

  // Prefetch events data for better UX
  prefetchEventsData: async () => {
    try {
      await Promise.all([
        enhancedApi.prefetch('/events', { limit: 20, page: 1 }, 'events')
      ]);
    } catch (error) {
      // Silent fail - prefetch is optional
    }
  }
};

export default eventService;