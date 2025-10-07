import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

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

  async updateProfile(name, email) {
    const response = await api.put('/users/profile', { name, email });
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
    });
    return response.data.data;
  }

  async removeSavedPark(parkCode) {
    const response = await api.delete(`/users/saved-parks/${parkCode}`);
    return response.data.data;
  }

  async checkParkSaved(parkCode) {
    const response = await api.get(`/users/saved-parks/${parkCode}/check`);
    return response.data.data.isSaved;
  }
}

export default new UserService();
