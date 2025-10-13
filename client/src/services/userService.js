import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

class UserService {
  async getProfile() {
    const response = await api.get('/users/profile');
    return response.data.data;
  }

  async updateProfile(profileData) {
    console.log('UserService: Updating profile with data:', profileData);
    const response = await api.put('/users/profile', profileData, {
      invalidateCache: ['userProfile', 'reviews', 'favorites'] // Clear user-related caches
    });
    console.log('UserService: Profile update response:', response.data);
    return response.data.data;
  }

  async getSavedParks() {
    const response = await api.get('/users/saved-parks');
    return response.data.data;
  }

  async savePark(parkCode, parkName) {
    const response = await api.post('/users/saved-parks', {
      parkCode,
      parkName
    }, {
      invalidateCache: ['favorites', 'userProfile'] // Clear favorites and profile cache
    });
    return response.data.data;
  }

  async removeSavedPark(parkCode) {
    const response = await api.delete(`/users/saved-parks/${parkCode}`, {
      invalidateCache: ['favorites', 'userProfile'] // Clear favorites and profile cache
    });
    return response.data.data;
  }

  async checkParkSaved(parkCode) {
    const response = await api.get(`/users/saved-parks/${parkCode}/check`);
    return response.data.data.isSaved;
  }

  async getUserStats() {
    const response = await api.get('/users/stats');
    return response.data.data;
  }

  async markParkVisited(parkCode, visitDate = new Date()) {
    const response = await api.post('/users/saved-parks/visited', {
      parkCode,
      visitDate
    }, {
      invalidateCache: ['userProfile', 'favorites'] // Clear user profile and favorites cache
    });
    return response.data.data;
  }

  // New visited parks methods (separate from favorites)
  async markParkAsVisited(parkCode, visitDate = null, rating = null, parkName = null, imageUrl = null, notes = null) {
    const response = await api.post(`/users/visited-parks/${parkCode}`, {
      visitDate,
      rating,
      parkName,
      imageUrl,
      notes
    }, {
      invalidateCache: ['userProfile', 'favorites'] // Clear user profile and favorites cache
    });
    return response.data.data;
  }

  async getVisitedParks() {
    const response = await api.get('/users/visited-parks');
    return response.data.data;
  }

  async checkParkVisited(parkCode) {
    const response = await api.get(`/users/visited-parks/${parkCode}`);
    return response.data.data;
  }

  async updateVisitedPark(parkCode, visitDate = null, rating = null, notes = null) {
    const response = await api.put(`/users/visited-parks/${parkCode}`, {
      visitDate,
      rating,
      notes
    }, {
      invalidateCache: ['userProfile', 'favorites'] // Clear user profile and favorites cache
    });
    return response.data.data;
  }

  async removeVisitedPark(parkCode) {
    const response = await api.delete(`/users/visited-parks/${parkCode}`, {
      invalidateCache: ['userProfile', 'favorites'] // Clear user profile and favorites cache
    });
    return response.data.data;
  }

  // Deprecated method (kept for backward compatibility)
  async markFavoriteAsVisited(parkCode, visitDate = null, rating = null, parkName = null) {
    const response = await api.post(`/users/favorites/${parkCode}/visited`, {
      visitDate,
      rating,
      parkName
    });
    return response.data.data;
  }
}

export default new UserService();
