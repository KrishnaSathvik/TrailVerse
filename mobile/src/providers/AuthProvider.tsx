import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { User } from '@trailverse/api';
import { isApiError } from '@trailverse/api';
import {
  clearAnonymousId,
  clearStoredAuth,
  getApi,
  getOrCreateAnonymousId,
  getStoredToken,
  getStoredUser,
  setStoredToken,
  setStoredUser,
  setUnauthorizedHandler,
} from '@/src/lib/api';

type AuthContextValue = {
  user: User | null;
  token: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (firstName: string, lastName: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  migrateAnonymousChat: (anonymousId: string) => Promise<string | null>;
  showLoginPrompt: (message?: string) => void;
  loginPrompt: { visible: boolean; message: string };
  closeLoginPrompt: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginPrompt, setLoginPrompt] = useState({ visible: false, message: '' });

  const logout = useCallback(async () => {
    await clearStoredAuth();
    await clearAnonymousId();
    setUser(null);
    setToken(null);
    queryClient.clear();
  }, [queryClient]);

  const refreshUser = useCallback(async () => {
    const api = getApi();
    const me = await api.auth.getMe();
    setUser(me);
    await setStoredUser(me);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout();
    });
  }, [logout]);

  useEffect(() => {
    (async () => {
      try {
        const storedToken = await getStoredToken();
        const storedUser = await getStoredUser();
        if (!storedToken) {
          setLoading(false);
          return;
        }
        setToken(storedToken);
        if (storedUser) setUser(storedUser);
        try {
          await refreshUser();
        } catch (error) {
          if (isApiError(error) && error.status === 401) {
            await logout();
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [logout, refreshUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      const api = getApi();
      const result = await api.auth.login(email, password, true);
      await setStoredToken(result.token);
      await setStoredUser(result.data);
      setToken(result.token);
      setUser(result.data);
      queryClient.invalidateQueries();
    },
    [queryClient],
  );

  const signup = useCallback(async (firstName: string, lastName: string, email: string, password: string) => {
    const api = getApi();
    await api.auth.signup(firstName, lastName, email, password);
  }, []);

  const migrateAnonymousChat = useCallback(async (anonymousId: string) => {
    const api = getApi();
    const result = await api.auth.migrateChat(anonymousId);
    await clearAnonymousId();
    return result.tripId;
  }, []);

  const showLoginPrompt = useCallback((message = 'Please sign in to continue') => {
    setLoginPrompt({ visible: true, message });
  }, []);

  const closeLoginPrompt = useCallback(() => {
    setLoginPrompt({ visible: false, message: '' });
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: !!token,
      login,
      signup,
      logout,
      refreshUser,
      migrateAnonymousChat,
      showLoginPrompt,
      loginPrompt,
      closeLoginPrompt,
    }),
    [
      user,
      token,
      loading,
      login,
      signup,
      logout,
      refreshUser,
      migrateAnonymousChat,
      showLoginPrompt,
      loginPrompt,
      closeLoginPrompt,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export { getOrCreateAnonymousId };
