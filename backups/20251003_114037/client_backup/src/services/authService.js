import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

// Create axios instance
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

class AuthService {
  async signup(name, email, password) {
    const response = await api.post('/auth/signup', {
      name,
      email,
      password
    });
    
    if (response.data.token) {
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.data));
    }
    
    return response.data;
  }

  async login(email, password) {
    const response = await api.post('/auth/login', {
      email,
      password
    });
    
    if (response.data.token) {
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.data));
    }
    
    return response.data;
  }

  async getMe() {
    const response = await api.get('/auth/me');
    return response.data;
  }

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }

  getCurrentUser() {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  }

  getToken() {
    return localStorage.getItem('token');
  }

  isAuthenticated() {
    return !!this.getToken();
  }

  async forgotPassword(email) {
    const response = await api.post('/auth/forgot-password', { email });
    return response.data;
  }

  async resetPassword(token, password) {
    const response = await api.put(`/auth/reset-password/${token}`, { password });
    return response.data;
  }

  async verifyEmail(token) {
    const response = await api.get(`/auth/verify-email/${token}`);
    return response.data;
  }
}

export default new AuthService();
