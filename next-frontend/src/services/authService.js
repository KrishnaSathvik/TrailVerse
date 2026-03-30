import axios from 'axios';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://trailverse.onrender.com/api'
    : 'http://localhost:5001/api');

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

const TOKEN_KEY = 'token';
const USER_KEY = 'user';

export const getStoredToken = () =>
  localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);

export const getStoredUser = () =>
  localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);

const clearStoredAuth = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
};

const persistAuth = (token, user, rememberMe) => {
  clearStoredAuth();

  const storage = rememberMe ? localStorage : sessionStorage;
  storage.setItem(TOKEN_KEY, token);
  storage.setItem(USER_KEY, JSON.stringify(user));

  const cookieParts = [`trailverse_auth_token=${token}`, 'path=/', 'SameSite=Lax'];
  if (rememberMe) {
    cookieParts.push('max-age=2592000');
  }
  document.cookie = cookieParts.join('; ');
};

// Add token to requests
api.interceptors.request.use(
  (config) => {
    const token = getStoredToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle response errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Don't automatically logout on 401 errors - let components handle it
    // This prevents global logout on network issues
    return Promise.reject(error);
  }
);

class AuthService {
  constructor() {
    this.api = api;
  }

  async signup(firstName, lastName, email, password) {
    console.log('📝 AuthService: signup() called');
    const response = await this.api.post('/auth/signup', {
      firstName,
      lastName,
      email,
      password
    });
    
    console.log('✅ AuthService: Signup response:', response.data);
    
    // Signup doesn't return a token - email verification is required
    // User will get a token after verification or manual login
    // Don't store anything in localStorage during signup
    
    return response.data;
  }

  async login(email, password, rememberMe = false) {
    console.log('🔐 AuthService: login() called with email:', email);
    const response = await this.api.post('/auth/login', {
      email,
      password,
      rememberMe
    });
    
    console.log('🔐 AuthService: Login response received:', response.data);
    
    if (response.data.token) {
      console.log('✅ AuthService: Login successful, storing token and user data');
      console.log('🔐 AuthService: Token to store:', response.data.token);
      console.log('🔐 AuthService: User data to store:', response.data.data);
      
      persistAuth(response.data.token, response.data.data, rememberMe);
      
      console.log(`✅ AuthService: Token and user data stored in ${rememberMe ? 'localStorage' : 'sessionStorage'} and cookies`);
      
      // Verify storage
      const storedToken = getStoredToken();
      const storedUser = getStoredUser();
      console.log('🔍 AuthService: Verification - stored token exists:', !!storedToken);
      console.log('🔍 AuthService: Verification - stored user exists:', !!storedUser);
      console.log('🔍 AuthService: Verification - stored user data:', storedUser);
    } else {
      console.log('❌ AuthService: No token in response data');
    }
    
    return response.data;
  }

  async getMe() {
    const response = await this.api.get('/auth/me');
    console.log('🔍 AuthService: getMe() response:', response);
    console.log('🔍 AuthService: getMe() response.data:', response.data);
    console.log('🔍 AuthService: getMe() response.data.data:', response.data.data);
    // Server returns {success: true, data: user}, so we return the full response.data
    // and let the caller access response.data.data for the user object
    return response.data;
  }

  logout() {
    console.log('🚪 AuthService: Removing token from storage and cookies');
    clearStoredAuth();
    document.cookie = "trailverse_auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    // Clear admin authentication flags
    localStorage.removeItem('adminAuthenticated');
    localStorage.removeItem('adminEmail');
    // Clear any corrupted data
    try {
      localStorage.removeItem('planai-chat-state');
      console.log('🚪 AuthService: Cleared planai-chat-state');
    } catch (error) {
      console.warn('Error clearing localStorage:', error);
    }
    console.log('🚪 AuthService: Logout complete');
  }

  getCurrentUser() {
    const user = getStoredUser();
    console.log('🔍 AuthService: getCurrentUser() called');
    console.log('🔍 AuthService: Raw user data from storage:', user);
    console.log('🔍 AuthService: User data type:', typeof user);
    console.log('🔍 AuthService: User data length:', user ? user.length : 'null');
    
    if (!user || user === 'undefined' || user === 'null') {
      console.log('❌ AuthService: No valid user data in localStorage');
      return null;
    }
    try {
      const parsedUser = JSON.parse(user);
      console.log('✅ AuthService: Successfully parsed user data:', parsedUser);
      return parsedUser;
    } catch (error) {
      console.error('❌ AuthService: Error parsing user data:', error);
      console.log('❌ AuthService: Corrupted user data:', user);
      localStorage.removeItem(USER_KEY);
      sessionStorage.removeItem(USER_KEY);
      return null;
    }
  }

  getToken() {
    const token = getStoredToken();
    console.log('🔍 AuthService: getToken() called');
    console.log('🔍 AuthService: Token from storage:', token ? `EXISTS (${token.substring(0, 20)}...)` : 'NOT_FOUND');
    return token;
  }

  isAuthenticated() {
    return !!this.getToken();
  }

  async forgotPassword(email) {
    const response = await this.api.post('/auth/forgot-password', { email });
    return response.data;
  }

  async resetPassword(token, password) {
    const response = await this.api.put(`/auth/reset-password/${token}`, { password });
    return response.data;
  }

  async verifyEmail(token) {
    const response = await this.api.get(`/auth/verify-email/${token}`);
    return response.data;
  }

  async resendVerification(email) {
    const response = await this.api.post('/auth/resend-verification', { email });
    return response.data;
  }
}

export default new AuthService();
