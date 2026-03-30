import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';
import authService from '../../services/authService';

vi.mock('../../services/authService', () => ({
  default: {
    getCurrentUser: vi.fn(),
    getToken: vi.fn(),
    signup: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    getMe: vi.fn()
  }
}));

vi.mock('../../components/auth/LoginModal', () => ({
  default: () => null
}));

vi.mock('../../services/tripHistoryService', () => ({
  migrateLegacyTrips: vi.fn().mockResolvedValue({ migrated: 0 })
}));

vi.mock('../../utils/cacheUtils', () => ({
  invalidateCache: {
    dailyFeed: vi.fn()
  }
}));

const TestComponent = () => {
  const { user, loading, signup, login, logout, isAuthenticated } = useAuth();

  return (
    <div>
      <div data-testid="loading">{loading ? 'Loading...' : 'Not Loading'}</div>
      <div data-testid="user">{user ? JSON.stringify(user) : 'No User'}</div>
      <div data-testid="authenticated">{isAuthenticated ? 'Authenticated' : 'Not Authenticated'}</div>
      <button onClick={() => signup('Test', 'User', 'test@example.com', 'password')}>
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
    authService.getCurrentUser.mockReturnValue(null);
    authService.getToken.mockReturnValue(null);
    authService.getMe.mockResolvedValue({ data: null });
  });

  it('provides unauthenticated state by default', async () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('Not Loading');
    });

    expect(screen.getByTestId('user')).toHaveTextContent('No User');
    expect(screen.getByTestId('authenticated')).toHaveTextContent('Not Authenticated');
  });

  it('restores a stored user while validating with the server', async () => {
    const storedUser = { id: '123', name: 'Stored User', createdAt: '2024-01-01T00:00:00Z' };
    authService.getCurrentUser.mockReturnValue(storedUser);
    authService.getToken.mockReturnValue('mock-token');
    authService.getMe.mockResolvedValue({ data: storedUser });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('Authenticated');
    });

    expect(screen.getByTestId('user')).toHaveTextContent(JSON.stringify(storedUser));
  });

  it('delegates signup without authenticating the user', async () => {
    authService.signup.mockResolvedValue({ success: true });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('Not Loading');
    });

    await act(async () => {
      screen.getByText('Signup').click();
    });

    expect(authService.signup).toHaveBeenCalledWith('Test', 'User', 'test@example.com', 'password');
    expect(screen.getByTestId('authenticated')).toHaveTextContent('Not Authenticated');
  });

  it('logs the user in and updates authentication state', async () => {
    const user = { id: '123', name: 'Test User' };
    authService.login.mockResolvedValue({ data: user, token: 'mock-token' });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('Not Loading');
    });

    await act(async () => {
      screen.getByText('Login').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('Authenticated');
    });

    expect(screen.getByTestId('user')).toHaveTextContent(JSON.stringify(user));
  });

  it('logs the user out and clears state', async () => {
    const user = { id: '123', name: 'Test User' };
    authService.getCurrentUser.mockReturnValue(user);
    authService.getToken.mockReturnValue('mock-token');
    authService.getMe.mockResolvedValue({ data: user });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('Authenticated');
    });

    await act(async () => {
      screen.getByText('Logout').click();
    });

    expect(authService.logout).toHaveBeenCalled();
    expect(screen.getByTestId('user')).toHaveTextContent('No User');
    expect(screen.getByTestId('authenticated')).toHaveTextContent('Not Authenticated');
  });

  it('throws when useAuth is used outside the provider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<TestComponent />)).toThrow('useAuth must be used within AuthProvider');

    consoleSpy.mockRestore();
  });
});
