import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import authService from '../authService';

// Mock axios
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      post: vi.fn(),
      get: vi.fn(),
      put: vi.fn(),
      interceptors: {
        request: {
          use: vi.fn()
        },
        response: {
          use: vi.fn()
        }
      }
    }))
  }
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};
global.localStorage = localStorageMock;

describe('AuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('signup', () => {
    it('should sign up a user successfully', async () => {
      const mockResponse = {
        data: {
          success: true,
          token: 'mock-token',
          data: {
            id: '123',
            name: 'Test User',
            email: 'test@example.com'
          }
        }
      };

      // Mock the API call
      const mockApi = {
        post: vi.fn().mockResolvedValue(mockResponse)
      };
      
      // Replace the api instance
      authService.api = mockApi;

      const result = await authService.signup('Test User', 'test@example.com', 'password123');

      expect(mockApi.post).toHaveBeenCalledWith('/auth/signup', {
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      });

      expect(localStorage.setItem).toHaveBeenCalledWith('token', 'mock-token');
      expect(localStorage.setItem).toHaveBeenCalledWith('user', JSON.stringify(mockResponse.data.data));
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle signup errors', async () => {
      const mockError = new Error('Signup failed');
      const mockApi = {
        post: vi.fn().mockRejectedValue(mockError)
      };
      
      authService.api = mockApi;

      await expect(authService.signup('Test User', 'test@example.com', 'password123'))
        .rejects.toThrow('Signup failed');
    });
  });

  describe('login', () => {
    it('should login a user successfully', async () => {
      const mockResponse = {
        data: {
          success: true,
          token: 'mock-token',
          data: {
            id: '123',
            name: 'Test User',
            email: 'test@example.com'
          }
        }
      };

      const mockApi = {
        post: vi.fn().mockResolvedValue(mockResponse)
      };
      
      authService.api = mockApi;

      const result = await authService.login('test@example.com', 'password123');

      expect(mockApi.post).toHaveBeenCalledWith('/auth/login', {
        email: 'test@example.com',
        password: 'password123',
        rememberMe: false
      });

      expect(localStorage.setItem).toHaveBeenCalledWith('token', 'mock-token');
      expect(localStorage.setItem).toHaveBeenCalledWith('user', JSON.stringify(mockResponse.data.data));
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle login errors', async () => {
      const mockError = new Error('Login failed');
      const mockApi = {
        post: vi.fn().mockRejectedValue(mockError)
      };
      
      authService.api = mockApi;

      await expect(authService.login('test@example.com', 'password123'))
        .rejects.toThrow('Login failed');
    });

    it('should login with remember me option', async () => {
      const mockResponse = {
        data: {
          success: true,
          token: 'mock-token',
          data: {
            id: '123',
            name: 'Test User',
            email: 'test@example.com'
          }
        }
      };

      const mockApi = {
        post: vi.fn().mockResolvedValue(mockResponse)
      };
      
      authService.api = mockApi;

      const result = await authService.login('test@example.com', 'password123', true);

      expect(mockApi.post).toHaveBeenCalledWith('/auth/login', {
        email: 'test@example.com',
        password: 'password123',
        rememberMe: true
      });

      expect(localStorage.setItem).toHaveBeenCalledWith('token', 'mock-token');
      expect(localStorage.setItem).toHaveBeenCalledWith('user', JSON.stringify(mockResponse.data.data));
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('getMe', () => {
    it('should get current user data', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: {
            id: '123',
            name: 'Test User',
            email: 'test@example.com'
          }
        }
      };

      const mockApi = {
        get: vi.fn().mockResolvedValue(mockResponse)
      };
      
      authService.api = mockApi;

      const result = await authService.getMe();

      expect(mockApi.get).toHaveBeenCalledWith('/auth/me');
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('logout', () => {
    it('should clear localStorage on logout', () => {
      authService.logout();

      expect(localStorage.removeItem).toHaveBeenCalledWith('token');
      expect(localStorage.removeItem).toHaveBeenCalledWith('user');
    });
  });

  describe('getCurrentUser', () => {
    it('should return parsed user from localStorage', () => {
      const mockUser = { id: '123', name: 'Test User' };
      localStorageMock.getItem.mockReturnValue(JSON.stringify(mockUser));

      const result = authService.getCurrentUser();

      expect(localStorage.getItem).toHaveBeenCalledWith('user');
      expect(result).toEqual(mockUser);
    });

    it('should return null if no user in localStorage', () => {
      localStorageMock.getItem.mockReturnValue(null);

      const result = authService.getCurrentUser();

      expect(result).toBeNull();
    });
  });

  describe('getToken', () => {
    it('should return token from localStorage', () => {
      localStorageMock.getItem.mockReturnValue('mock-token');

      const result = authService.getToken();

      expect(localStorage.getItem).toHaveBeenCalledWith('token');
      expect(result).toBe('mock-token');
    });
  });

  describe('isAuthenticated', () => {
    it('should return true if token exists', () => {
      localStorageMock.getItem.mockReturnValue('mock-token');

      const result = authService.isAuthenticated();

      expect(result).toBe(true);
    });

    it('should return false if no token', () => {
      localStorageMock.getItem.mockReturnValue(null);

      const result = authService.isAuthenticated();

      expect(result).toBe(false);
    });
  });

  describe('forgotPassword', () => {
    it('should send forgot password request', async () => {
      const mockResponse = {
        data: {
          success: true,
          message: 'Password reset email sent'
        }
      };

      const mockApi = {
        post: vi.fn().mockResolvedValue(mockResponse)
      };
      
      authService.api = mockApi;

      const result = await authService.forgotPassword('test@example.com');

      expect(mockApi.post).toHaveBeenCalledWith('/auth/forgot-password', { email: 'test@example.com' });
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('resetPassword', () => {
    it('should reset password with token', async () => {
      const mockResponse = {
        data: {
          success: true,
          message: 'Password reset successful'
        }
      };

      const mockApi = {
        put: vi.fn().mockResolvedValue(mockResponse)
      };
      
      authService.api = mockApi;

      const result = await authService.resetPassword('reset-token', 'newpassword123');

      expect(mockApi.put).toHaveBeenCalledWith('/auth/reset-password/reset-token', { password: 'newpassword123' });
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('verifyEmail', () => {
    it('should verify email with token', async () => {
      const mockResponse = {
        data: {
          success: true,
          message: 'Email verified successfully!'
        }
      };

      const mockApi = {
        get: vi.fn().mockResolvedValue(mockResponse)
      };
      
      authService.api = mockApi;

      const result = await authService.verifyEmail('verification-token');

      expect(mockApi.get).toHaveBeenCalledWith('/auth/verify-email/verification-token');
      expect(result).toEqual(mockResponse.data);
    });
  });
});
