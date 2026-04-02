"use client";
import React, { createContext, useState, useContext, useEffect } from 'react';
import authService from '../services/authService';
import { migrateLegacyTrips } from '../services/tripHistoryService';
import { invalidateCache } from '../utils/cacheUtils';
import LoginModal from '../components/auth/LoginModal';

const AuthContext = createContext();
const ANONYMOUS_CHAT_MIGRATION_MAX_AGE_MS = 48 * 60 * 60 * 1000;

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userDataLoaded, setUserDataLoaded] = useState(false);
  const [authModal, setAuthModal] = useState({ isOpen: false, message: '' });
  const [authTransition, setAuthTransition] = useState({ active: false, message: '' });

  const showLoginPrompt = (message = 'Please sign in to continue') => {
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
    // Add localStorage event listener to track changes
    const handleStorageChange = (e) => {
      if (e.key === 'user' || e.key === 'token') {

      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // Check if user is logged in on mount
    const validateToken = async () => {

      
      const token = authService.getToken();
      const storedUser = authService.getCurrentUser();
      



      
      if (token && storedUser) {
        console.log('✅ AuthContext: Restoring user from localStorage');
        // Immediately restore user from localStorage for better UX
        setUser(storedUser);
        // Mark as loaded if storedUser has createdAt
        setUserDataLoaded(!!storedUser.createdAt);
        
        // Then validate token with server in background
        try {

          const response = await authService.getMe();
          console.log('✅ AuthContext: Server validation successful');
          console.log('✅ AuthContext: Full server response:', response);
          console.log('✅ AuthContext: Server response data:', response.data);
          console.log('✅ AuthContext: Server response data.data:', response.data.data);
          // Update user with fresh data from server
          setUser(response.data);
          // Mark as fully loaded with server data
          setUserDataLoaded(true);
          // Update localStorage with fresh data
          localStorage.setItem('user', JSON.stringify(response.data));
          console.log('✅ AuthContext: Updated localStorage with fresh user data');
          
          // Invalidate daily feed cache to ensure fresh data for the restored user
          if (response.data?._id) {
            console.log('🔄 AuthContext: Invalidating daily feed cache for restored user');
            invalidateCache.dailyFeed(response.data._id);
          }
          
          // Migrate legacy localStorage trips to database
          if (response.data._id || response.data.id) {
            const userId = response.data._id || response.data.id;
            migrateLegacyTrips(userId).then(result => {
              if (result.migrated > 0) {
                console.log(`✅ AuthContext: Migrated ${result.migrated} legacy trips to database`);
              }
            }).catch(err => {
              console.error('❌ AuthContext: Error migrating trips:', err);
            });
          }
        } catch (error) {
          console.log('❌ AuthContext: Server validation failed');
          console.log('❌ AuthContext: Error message:', error.message);
          console.log('❌ AuthContext: Error status:', error.response?.status);
          console.log('❌ AuthContext: Error response:', error.response?.data);
          console.log('❌ AuthContext: Full error object:', error);
          
          // Only clear token if server returns 401 (unauthorized)
          if (error.response?.status === 401) {

            authService.logout();
            setUser(null);
            setUserDataLoaded(false);
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

    setUser(response.data);
    
    // Invalidate daily feed cache to ensure fresh data for the logged-in user
    if (response.data?._id) {
      console.log('🔄 AuthContext: Invalidating daily feed cache for new user');
      invalidateCache.dailyFeed(response.data._id);
    }

    const redirectedToChat = await migrateAnonymousChat(response.token);
    return {
      ...response,
      redirectedToChat
    };
  };

  const logout = () => {
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
    document.cookie = `trailverse_auth_token=${token}; path=/; max-age=604800; SameSite=Lax`;
    
    // Update state immediately
    setUser(userData);
    
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
    isAuthenticated: !!user,
    showLoginPrompt,
    closeLoginPrompt
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
      <LoginModal 
        isOpen={authModal.isOpen} 
        onClose={closeLoginPrompt} 
        message={authModal.message} 
      />
    </AuthContext.Provider>
  );
};
