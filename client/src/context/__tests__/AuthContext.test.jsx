import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';
import authService from '../../services/authService';

// Mock authService
vi.mock('../../services/authService', () => ({
  default: {
    getCurrentUser: vi.fn(),
    getToken: vi.fn(),
    isAuthenticated: vi.fn(),
    signup: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    getMe: vi.fn()
  }
}));

// Test component that uses the auth context
const TestComponent = () => {
  const { user, loading, error, signup, login, logout, isAuthenticated } = useAuth();
  
  return (
    <div>
      <div data-testid="loading">{loading ? 'Loading...' : 'Not Loading'}</div>
      <div data-testid="user">{user ? JSON.stringify(user) : 'No User'}</div>
      <div data-testid="error">{error || 'No Error'}</div>
      <div data-testid="authenticated">{isAuthenticated() ? 'Authenticated' : 'Not Authenticated'}</div>
      <button onClick={() => signup('Test User', 'test@example.com', 'password')}>
        Signup
      </button>
      <button onClick={() => login('test@example.com', 'password')}>
        Login
      </button>
      <button onClick={logout}>
        Logout
      </button>
    </div>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial state', () => {
    it('should provide initial state when no user is authenticated', () => {
      authService.getCurrentUser.mockReturnValue(null);
      authService.getToken.mockReturnValue(null);
      authService.isAuthenticated.mockReturnValue(false);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      expect(screen.getByTestId('user')).toHaveTextContent('No User');
      expect(screen.getByTestId('authenticated')).toHaveTextContent('Not Authenticated');
      expect(screen.getByTestId('error')).toHaveTextContent('No Error');
    });

    it('should load existing user from localStorage', async () => {
      const mockUser = { id: '123', name: 'Test User', email: 'test@example.com' };
      authService.getCurrentUser.mockReturnValue(mockUser);
      authService.getToken.mockReturnValue('mock-token');
      authService.isAuthenticated.mockReturnValue(true);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent(JSON.stringify(mockUser));
        expect(screen.getByTestId('authenticated')).toHaveTextContent('Authenticated');
      });
    });
  });

  describe('Signup', () => {
    it('should handle successful signup', async () => {
      const mockResponse = {
        success: true,
        data: { id: '123', name: 'Test User', email: 'test@example.com' },
        token: 'mock-token'
      };

      authService.signup.mockResolvedValue(mockResponse);
      authService.getCurrentUser.mockReturnValue(mockResponse.data);
      authService.isAuthenticated.mockReturnValue(true);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      const signupButton = screen.getByText('Signup');
      
      await act(async () => {
        signupButton.click();
      });

      expect(authService.signup).toHaveBeenCalledWith('Test User', 'test@example.com', 'password');
      
      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent(JSON.stringify(mockResponse.data));
        expect(screen.getByTestId('authenticated')).toHaveTextContent('Authenticated');
      });
    });

    it('should handle signup errors', async () => {
      const mockError = new Error('Signup failed');
      authService.signup.mockRejectedValue(mockError);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      const signupButton = screen.getByText('Signup');
      
      await act(async () => {
        signupButton.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Signup failed');
      });
    });
  });

  describe('Login', () => {
    it('should handle successful login', async () => {
      const mockResponse = {
        success: true,
        data: { id: '123', name: 'Test User', email: 'test@example.com' },
        token: 'mock-token'
      };

      authService.login.mockResolvedValue(mockResponse);
      authService.getCurrentUser.mockReturnValue(mockResponse.data);
      authService.isAuthenticated.mockReturnValue(true);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      const loginButton = screen.getByText('Login');
      
      await act(async () => {
        loginButton.click();
      });

      expect(authService.login).toHaveBeenCalledWith('test@example.com', 'password');
      
      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent(JSON.stringify(mockResponse.data));
        expect(screen.getByTestId('authenticated')).toHaveTextContent('Authenticated');
      });
    });

    it('should handle login errors', async () => {
      const mockError = new Error('Login failed');
      authService.login.mockRejectedValue(mockError);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      const loginButton = screen.getByText('Login');
      
      await act(async () => {
        loginButton.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Login failed');
      });
    });
  });

  describe('Logout', () => {
    it('should handle logout', async () => {
      const mockUser = { id: '123', name: 'Test User', email: 'test@example.com' };
      authService.getCurrentUser.mockReturnValue(mockUser);
      authService.getToken.mockReturnValue('mock-token');
      authService.isAuthenticated.mockReturnValue(true);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      const logoutButton = screen.getByText('Logout');
      
      await act(async () => {
        logoutButton.click();
      });

      expect(authService.logout).toHaveBeenCalled();
      
      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('No User');
        expect(screen.getByTestId('authenticated')).toHaveTextContent('Not Authenticated');
      });
    });
  });

  describe('Loading states', () => {
    it('should show loading state during authentication', async () => {
      authService.getCurrentUser.mockReturnValue(null);
      authService.getToken.mockReturnValue(null);
      authService.isAuthenticated.mockReturnValue(false);

      // Mock a slow signup
      authService.signup.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({
          success: true,
          data: { id: '123', name: 'Test User' },
          token: 'mock-token'
        }), 100))
      );

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      const signupButton = screen.getByText('Signup');
      
      act(() => {
        signupButton.click();
      });

      // Should show loading state
      expect(screen.getByTestId('loading')).toHaveTextContent('Loading...');

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('Not Loading');
      });
    });
  });

  describe('Error handling', () => {
    it('should clear errors on successful operations', async () => {
      const mockError = new Error('Initial error');
      authService.signup.mockRejectedValueOnce(mockError);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      const signupButton = screen.getByText('Signup');
      
      await act(async () => {
        signupButton.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Initial error');
      });

      // Now mock successful signup
      const mockResponse = {
        success: true,
        data: { id: '123', name: 'Test User' },
        token: 'mock-token'
      };
      authService.signup.mockResolvedValue(mockResponse);
      authService.getCurrentUser.mockReturnValue(mockResponse.data);
      authService.isAuthenticated.mockReturnValue(true);

      await act(async () => {
        signupButton.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('No Error');
      });
    });
  });

  describe('Context provider', () => {
    it('should throw error when useAuth is used outside AuthProvider', () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<TestComponent />);
      }).toThrow('useAuth must be used within an AuthProvider');

      consoleSpy.mockRestore();
    });
  });

  describe('Token refresh', () => {
    it('should refresh user data when token is available', async () => {
      const mockUser = { id: '123', name: 'Test User', email: 'test@example.com' };
      const mockResponse = { success: true, data: mockUser };

      authService.getToken.mockReturnValue('mock-token');
      authService.getMe.mockResolvedValue(mockResponse);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(authService.getMe).toHaveBeenCalled();
      });
    });

    it('should handle token refresh errors', async () => {
      authService.getToken.mockReturnValue('invalid-token');
      authService.getMe.mockRejectedValue(new Error('Token expired'));

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('No User');
        expect(screen.getByTestId('authenticated')).toHaveTextContent('Not Authenticated');
      });
    });
  });
});
