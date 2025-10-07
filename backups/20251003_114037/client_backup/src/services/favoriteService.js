import api from './api';

const favoriteService = {
  // Get user's favorites
  getUserFavorites: async (userId) => {
    const response = await api.get(`/favorites/user/${userId}`);
    return response.data;
  },

  // Add favorite
  addFavorite: async (parkData) => {
    const response = await api.post('/favorites', parkData);
    return response.data;
  },

  // Remove favorite
  removeFavorite: async (parkCode) => {
    const response = await api.delete(`/favorites/${parkCode}`);
    return response.data;
  },

  // Update favorite
  updateFavorite: async (favoriteId, favoriteData) => {
    const response = await api.put(`/favorites/${favoriteId}`, favoriteData);
    return response.data;
  },

  // Check if favorited
  checkFavorite: async (parkCode) => {
    const response = await api.get(`/favorites/check/${parkCode}`);
    return response.data;
  }
};

export default favoriteService;
