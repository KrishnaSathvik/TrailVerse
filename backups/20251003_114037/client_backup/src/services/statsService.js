import api from './api';

const statsService = {
  // Get site statistics
  getSiteStats: async () => {
    const response = await api.get('/stats/site');
    return response.data;
  },

  // Get park statistics
  getParkStats: async () => {
    const response = await api.get('/stats/parks');
    return response.data;
  },

  // Get user statistics
  getUserStats: async () => {
    const response = await api.get('/stats/users');
    return response.data;
  }
};

export default statsService;
