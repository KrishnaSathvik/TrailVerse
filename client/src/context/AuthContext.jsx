import React, { createContext, useState, useContext, useEffect } from 'react';
import authService from '../services/authService';
import { migrateLegacyTrips } from '../services/tripHistoryService';
import { invalidateCache } from '../utils/cacheUtils';

const AuthContext = createContext();

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

    // Check if user came from AI chat
    const returnToChat = localStorage.getItem('returnToChat');
    if (returnToChat) {
      try {
        const chatContext = JSON.parse(returnToChat);
        
        // Migrate anonymous conversation
        const migrationResponse = await fetch('/api/auth/migrate-chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${response.data.token}`
          },
          body: JSON.stringify({
            anonymousId: chatContext.anonymousId
          })
        });
        
        if (migrationResponse.ok) {
          const migrationData = await migrationResponse.json();
          // Clear the stored context
          localStorage.removeItem('returnToChat');
          // Redirect to chat with migrated conversation
          window.location.href = `/plan-ai/${migrationData.data.tripId}?chat=true`;
          return response;
        }
      } catch (error) {
        console.error('Error migrating chat:', error);
        // Clear context on error and continue with normal flow
        localStorage.removeItem('returnToChat');
      }
    } else {
      // Check for any anonymous session to migrate (even if not from chat)
      try {
        const anonymousSession = localStorage.getItem('anonymousSession');
        if (anonymousSession) {
          const sessionData = JSON.parse(anonymousSession);
          
          // Check if session is not too old (24 hours)
          const sessionAge = Date.now() - sessionData.timestamp;
          const maxAge = 24 * 60 * 60 * 1000; // 24 hours
          
          if (sessionAge < maxAge && sessionData.anonymousId) {
            // Migrate anonymous conversation
            const migrationResponse = await fetch('/api/auth/migrate-chat', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${response.data.token}`
              },
              body: JSON.stringify({
                anonymousId: sessionData.anonymousId
              })
            });
            
            if (migrationResponse.ok) {
              const migrationData = await migrationResponse.json();
              // Clear the anonymous session
              localStorage.removeItem('anonymousSession');
              console.log('✅ Migrated anonymous session to user account');
              // Redirect to the migrated trip
              window.location.href = `/plan-ai/${migrationData.data.tripId}?chat=true`;
              return response;
            }
          } else {
            // Session too old, clear it
            localStorage.removeItem('anonymousSession');
          }
        }
      } catch (error) {
        console.error('Error checking/migrating anonymous session:', error);
        // Clear session on error
        localStorage.removeItem('anonymousSession');
      }
    }

    return response;
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
    
    // Store in localStorage
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    
    // Update state immediately
    setUser(userData);
    
    // Check if user came from AI chat
    const returnToChat = localStorage.getItem('returnToChat');
    if (returnToChat) {
      try {
        const chatContext = JSON.parse(returnToChat);
        
        // Migrate anonymous conversation
        const migrationResponse = await fetch('/api/auth/migrate-chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            anonymousId: chatContext.anonymousId
          })
        });
        
        if (migrationResponse.ok) {
          const migrationData = await migrationResponse.json();
          // Clear the stored context
          localStorage.removeItem('returnToChat');
          // Redirect to chat with migrated conversation
          window.location.href = `/plan-ai/${migrationData.data.tripId}?chat=true`;
          return;
        }
      } catch (error) {
        console.error('Error migrating chat after verification:', error);
        // Clear context on error and continue with normal flow
        localStorage.removeItem('returnToChat');
      }
    } else {
      // Check for any anonymous session to migrate (even if not from chat)
      try {
        const anonymousSession = localStorage.getItem('anonymousSession');
        if (anonymousSession) {
          const sessionData = JSON.parse(anonymousSession);
          
          // Check if session is not too old (24 hours)
          const sessionAge = Date.now() - sessionData.timestamp;
          const maxAge = 24 * 60 * 60 * 1000; // 24 hours
          
          if (sessionAge < maxAge && sessionData.anonymousId) {
            // Migrate anonymous conversation
            const migrationResponse = await fetch('/api/auth/migrate-chat', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                anonymousId: sessionData.anonymousId
              })
            });
            
            if (migrationResponse.ok) {
              const migrationData = await migrationResponse.json();
              // Clear the anonymous session
              localStorage.removeItem('anonymousSession');
              console.log('✅ Migrated anonymous session to user account after verification');
              // Redirect to the migrated trip
              window.location.href = `/plan-ai/${migrationData.data.tripId}?chat=true`;
              return;
            }
          } else {
            // Session too old, clear it
            localStorage.removeItem('anonymousSession');
          }
        }
      } catch (error) {
        console.error('Error checking/migrating anonymous session after verification:', error);
        // Clear session on error
        localStorage.removeItem('anonymousSession');
      }
    }
    
    console.log('✅ AuthContext: User authenticated after verification');
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
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
