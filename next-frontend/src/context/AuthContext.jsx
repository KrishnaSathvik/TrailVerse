"use client";
import React, { createContext, useState, useContext, useEffect } from 'react';
import authService, { AUTH_SESSION_EXPIRED_EVENT, AUTH_TOKEN_COOKIE } from '../services/authService';
import { migrateLegacyTrips } from '../services/tripHistoryService';
import { invalidateCache } from '../utils/cacheUtils';
import { logAnonymousChatMigrated, logEvent, logLoginPromptShown } from '../utils/analytics';
import LoginModal from '../components/auth/LoginModal';

const AuthContext = createContext();
const ANONYMOUS_CHAT_MIGRATION_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const SESSION_EXPIRED_MESSAGE = 'Your session expired. Please sign in again.';

const extractAuthUser = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    return payload.data;
  }
  return payload;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children, initialAuthHint = false }) => {
  // Start null on server and first client paint — localStorage is read in useEffect only (SSR/hydration safe).
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userDataLoaded, setUserDataLoaded] = useState(false);
  const [authModal, setAuthModal] = useState({ isOpen: false, message: '' });
  const [authTransition, setAuthTransition] = useState({ active: false, message: '' });

  const showLoginPrompt = (message = 'Please sign in to continue') => {
    logLoginPromptShown(message);
    setAuthModal({ isOpen: true, message });
  };
  
  const closeLoginPrompt = () => {
    setAuthModal({ isOpen: false, message: '' });
  };

  const clearAuthTransition = () => {
    setAuthTransition({ active: false, message: '' });
  };

  const migrateAnonymousChat = async (token) => {
    const redirectToTrip = (tripId) => {
      window.location.href = `/plan-ai/${tripId}?chat=true`;
    };

    const tryMigration = async (anonymousId, storageKey, successMessage) => {
      setAuthTransition({
        active: true,
        message: 'Saving your chat to your account...'
      });

      const migrationResponse = await fetch('/api/auth/migrate-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ anonymousId })
      });

      if (!migrationResponse.ok) {
        clearAuthTransition();
        return false;
      }

      const migrationData = await migrationResponse.json();
      localStorage.removeItem(storageKey);
      localStorage.removeItem('anonymousSession');
      logAnonymousChatMigrated();
      console.log(successMessage, migrationData.data.tripId);
      redirectToTrip(migrationData.data.tripId);
      return true;
    };

    const returnToChat = localStorage.getItem('returnToChat');
    if (returnToChat) {
      try {
        const chatContext = JSON.parse(returnToChat);
        if (chatContext?.anonymousId) {
          return await tryMigration(
            chatContext.anonymousId,
            'returnToChat',
            '✅ Migrated chat context to user account:'
          );
        }
        localStorage.removeItem('returnToChat');
      } catch (error) {
        console.error('Error reading returnToChat context:', error);
        localStorage.removeItem('returnToChat');
        clearAuthTransition();
      }
    }

    try {
      const anonymousSession = localStorage.getItem('anonymousSession');
      if (!anonymousSession) {
        clearAuthTransition();
        return false;
      }

      const sessionData = JSON.parse(anonymousSession);
      const sessionAge = Date.now() - sessionData.timestamp;
      const maxAge = ANONYMOUS_CHAT_MIGRATION_MAX_AGE_MS;

      if (sessionAge < maxAge && sessionData.anonymousId) {
        return await tryMigration(
          sessionData.anonymousId,
          'anonymousSession',
          '✅ Migrated anonymous session to user account:'
        );
      }

      localStorage.removeItem('anonymousSession');
    } catch (error) {
      console.error('Error checking/migrating anonymous session:', error);
      localStorage.removeItem('anonymousSession');
    }

    clearAuthTransition();
    return false;
  };


  useEffect(() => {
    const handleSessionExpired = () => {
      authService.logout();
      setUser(null);
      setUserDataLoaded(false);
      setAuthModal({ isOpen: true, message: SESSION_EXPIRED_MESSAGE });
    };

    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => {
      window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);
    };
  }, []);

  useEffect(() => {
    // Sync auth state across tabs via localStorage events
    const handleStorageChange = (e) => {
      if (e.key === 'token') {
        if (!e.newValue) {
          // Token removed in another tab — log out here too
          setUser(null);
          setUserDataLoaded(false);
        }
      }
      if (e.key === 'user') {
        if (e.newValue) {
          try {
            const updatedUser = JSON.parse(e.newValue);
            setUser(updatedUser);
            setUserDataLoaded(true);
          } catch { /* ignore parse errors */ }
        } else {
          // User removed in another tab — log out here too
          setUser(null);
          setUserDataLoaded(false);
        }
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // Check if user is logged in on mount
    const validateToken = async () => {

      
      const token = authService.getToken();
      const storedUser = authService.getCurrentUser();
      



      
      if (token && storedUser) {
        if (!user) {
          console.log('✅ AuthContext: Restoring user from localStorage');
          setUser(storedUser);
        }
        setUserDataLoaded(!!storedUser.createdAt);
        
        // Then validate token with server in background
        try {

          const response = await authService.getMe();
          console.log('✅ AuthContext: Server validation successful');
          const freshUser = extractAuthUser(response);
          if (freshUser) {
            console.log('✅ AuthContext: Full server response:', response);
            // Update user with fresh data from server
            setUser(freshUser);
            // Mark as fully loaded with server data
            setUserDataLoaded(true);
            // Update localStorage with fresh data
            localStorage.setItem('user', JSON.stringify(freshUser));
            console.log('✅ AuthContext: Updated localStorage with fresh user data');
          
            // Invalidate daily feed cache to ensure fresh data for the restored user
            if (freshUser?._id) {
              console.log('🔄 AuthContext: Invalidating daily feed cache for restored user');
              invalidateCache.dailyFeed(freshUser._id);
            }
          
            // Migrate legacy localStorage trips to database
            if (freshUser._id || freshUser.id) {
              const userId = freshUser._id || freshUser.id;
              migrateLegacyTrips(userId).then(result => {
                if (result.migrated > 0) {
                  console.log(`✅ AuthContext: Migrated ${result.migrated} legacy trips to database`);
                }
              }).catch(err => {
                console.error('❌ AuthContext: Error migrating trips:', err);
              });
            }
          }
        } catch (error) {
          console.log('❌ AuthContext: Server validation failed');
          console.log('❌ AuthContext: Error message:', error.message);
          console.log('❌ AuthContext: Error status:', error.response?.status);
          console.log('❌ AuthContext: Error response:', error.response?.data);
          console.log('❌ AuthContext: Full error object:', error);
          
          // Clear stale session — don't keep sending an invalid token as anonymous
          if (error.response?.status === 401) {
            authService.logout();
            setUser(null);
            setUserDataLoaded(false);
            setAuthModal({ isOpen: true, message: SESSION_EXPIRED_MESSAGE });
          } else {
            // For other errors (network, server down, etc.), keep user logged in
            console.warn('⚠️ AuthContext: Failed to validate token with server, but keeping user logged in:', error.message);
            // Still mark as loaded if we have localStorage data
            setUserDataLoaded(!!storedUser.createdAt);
          }
        }
      } else {
        console.log('❌ AuthContext: No valid token or user data found');
        if (!token) console.log('❌ AuthContext: No token in localStorage');
        if (!storedUser) console.log('❌ AuthContext: No user data in localStorage');
        setUserDataLoaded(false);
      }
      

      setLoading(false);
    };

    validateToken();
    
    // Cleanup
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const signup = async (firstName, lastName, email, password) => {
    const response = await authService.signup(firstName, lastName, email, password);
    // Don't set user state during signup - email verification is required
    // User will be logged in after verification or manual login
    console.log('✅ AuthContext: Signup successful, verification email sent');
    return response;
  };

  const login = async (email, password, rememberMe = false) => {
    const response = await authService.login(email, password, rememberMe);
    const loggedInUser = extractAuthUser(response);

    if (loggedInUser) {
      setUser(loggedInUser);
      setUserDataLoaded(true);
      setLoading(false);
      if (loggedInUser?._id) {
        console.log('🔄 AuthContext: Invalidating daily feed cache for new user');
        invalidateCache.dailyFeed(loggedInUser._id);
      }
    }

    const redirectedToChat = await migrateAnonymousChat(response.token);
    return {
      ...response,
      redirectedToChat
    };
  };

  const logout = () => {
    logEvent('Auth', 'logout', 'manual');
    authService.logout();
    setUser(null);
  };

  const updateUser = (updatedUserData) => {

    setUser(prevUser => ({
      ...prevUser,
      ...updatedUserData
    }));
    // Also update localStorage
    const currentUser = { ...user, ...updatedUserData };
    localStorage.setItem('user', JSON.stringify(currentUser));
    console.log('✅ AuthContext: User data updated in state and localStorage');
  };

  // Method to set user after email verification
  const setUserAfterVerification = async (userData, token) => {
    console.log('✅ AuthContext: Setting user after email verification');
    console.log('✅ AuthContext: User data:', userData);
    console.log('✅ AuthContext: Token:', token ? `${token.substring(0, 30)}...` : 'null');
    
    // Store in localStorage and Set dual-strategy cookie
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    document.cookie = `${AUTH_TOKEN_COOKIE}=${token}; path=/; max-age=604800; SameSite=Lax`;
    
    // Update state immediately
    setUser(userData);
    setUserDataLoaded(true);
    setLoading(false);

    const redirectedToChat = await migrateAnonymousChat(token);
    if (redirectedToChat) {
      return { redirectedToChat: true };
    }
    
    console.log('✅ AuthContext: User authenticated after verification');
    clearAuthTransition();
    return { redirectedToChat: false };
  };

  const value = {
    user,
    loading,
    userDataLoaded,
    signup,
    login,
    logout,
    updateUser,
    setUserAfterVerification,
    authTransition,
    clearAuthTransition,
    // Optimistic while validating: local user and/or auth cookie from SSR (keeps Home in header on refresh).
    isAuthenticated: !!user || (loading && initialAuthHint),
    // User-specific chrome (admin link, logout) — only after client has resolved user (avoids SSR hydration mismatch).
    authReady: !loading && !!user,
    showLoginPrompt,
    closeLoginPrompt
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      <LoginModal 
        isOpen={authModal.isOpen} 
        onClose={closeLoginPrompt} 
        message={authModal.message} 
      />
    </AuthContext.Provider>
  );
};
