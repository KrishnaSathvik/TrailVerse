import { useEffect } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';
import authService from '../../services/authService';
import * as tripPaths from '../../lib/tripSurfacePath';

vi.mock('../../services/authService', () => ({
  AUTH_SESSION_EXPIRED_EVENT: 'authSessionExpired',
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

vi.mock('../../utils/analytics', () => ({
  logAnonymousChatMigrated: vi.fn(),
  logEvent: vi.fn(),
  logLoginPromptShown: vi.fn(),
  logUserLogin: vi.fn(),
  logUserLogout: vi.fn(),
  logUserSignup: vi.fn(),
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
  it.each(['http', 'network'])('retains handoff context on %s failure and retries the same conversation', async failure => {
    const anonymousId = 'guest_v2_12345678-1234-4123-8123-123456789abc';
    const context = { anonymousId, conversationId: 'same-trip', surface: 'itinerary' };
    localStorage.setItem('returnToChat', JSON.stringify(context));
    authService.login.mockResolvedValue({ data: { id: '123' }, token: 'offline-token' });
    const fetch = vi.fn();
    if (failure === 'http') fetch.mockResolvedValueOnce({ ok: false });
    else fetch.mockRejectedValueOnce(new Error('offline'));
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: { tripId: 'same-trip' } }) });
    vi.stubGlobal('fetch', fetch);
    const destination = vi.spyOn(tripPaths, 'tripSurfacePath').mockReturnValue('#itinerary');
    let performLogin;
    function RetryHarness() {
      const { login } = useAuth();
      useEffect(() => { performLogin = login; }, [login]);
      return null;
    }
    render(<AuthProvider><RetryHarness /></AuthProvider>);
    await act(async () => { await expect(performLogin('test@example.com', 'password')).rejects.toThrow(); });
    expect(JSON.parse(localStorage.getItem('returnToChat'))).toMatchObject(context);
    expect(destination).not.toHaveBeenCalled();
    await act(async () => { await performLogin('test@example.com', 'password'); });
    expect(fetch.mock.calls.map(call => JSON.parse(call[1].body))).toEqual([
      { anonymousId, conversationId: 'same-trip' }, { anonymousId, conversationId: 'same-trip' },
    ]);
    expect(destination).toHaveBeenCalledWith('same-trip', 'itinerary');
  });
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    authService.getCurrentUser.mockReturnValue(null);
    authService.getToken.mockReturnValue(null);
    authService.getMe.mockResolvedValue({ data: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each(['itinerary', 'map'])('migrates the guest conversation and resumes the requested %s surface after login', async surface => {
    const anonymousId = 'guest_v2_12345678-1234-4123-8123-123456789abc';
    localStorage.setItem('returnToChat', JSON.stringify({ anonymousId, surface, timestamp: Date.now() }));
    authService.login.mockResolvedValue({ success: true, data: { id: '123', name: 'Traveler' }, token: 'offline-token' });
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { tripId: 'migrated-trip' } }) });
    vi.stubGlobal('fetch', fetch);
    // A same-document hash is navigable in jsdom; assert the real routing input.
    const destination = vi.spyOn(tripPaths, 'tripSurfacePath').mockReturnValue(`#${surface}`);
    render(<AuthProvider><TestComponent /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('Not Loading'));
    await act(async () => { screen.getByText('Login').click(); });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toMatch(/\/auth\/migrate-chat$/);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ anonymousId, conversationId: null });
    expect(destination).toHaveBeenCalledWith('migrated-trip', surface);
    expect(localStorage.getItem('returnToChat')).toBeNull();
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
    authService.getMe.mockResolvedValue({ success: true, data: storedUser });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent(JSON.stringify(storedUser));
      expect(screen.getByTestId('authenticated')).toHaveTextContent('Authenticated');
    });

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('Not Loading');
    });
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
    authService.login.mockResolvedValue({ success: true, data: user, token: 'mock-token' });

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

  it('does not migrate a potentially collided legacy guest session into an account', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    localStorage.setItem('anonymousSession', JSON.stringify({
      anonymousId: 'anon_0123456789abcdef_012345',
      messageCount: 3,
      timestamp: Date.now(),
      activeTripContext: { parkName: 'Olympic National Park' },
    }));
    authService.login.mockResolvedValue({
      success: true,
      data: { id: '123', name: 'Test User' },
      token: 'mock-token',
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('Not Loading'));

    await act(async () => {
      screen.getByText('Login').click();
    });

    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('Authenticated'));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem('anonymousSession')).toBeNull();
  });

  it('logs the user out and clears state', async () => {
    const user = { id: '123', name: 'Test User' };
    authService.getCurrentUser.mockReturnValue(user);
    authService.getToken.mockReturnValue('mock-token');
    authService.getMe.mockResolvedValue({ success: true, data: user });

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
