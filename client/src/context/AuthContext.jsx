import React, { createContext, useState, useContext, useEffect } from 'react';
import authService from '../services/authService';
import { migrateLegacyTrips } from '../services/tripHistoryService';

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
  
  console.log('🔄 AuthContext: AuthProvider initialized/re-rendered');

  useEffect(() => {
    // Add localStorage event listener to track changes
    const handleStorageChange = (e) => {
      if (e.key === 'user' || e.key === 'token') {
        console.log('🔔 AuthContext: localStorage change detected:', e.key, e.oldValue, '->', e.newValue);
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // Check if user is logged in on mount
    const validateToken = async () => {
      console.log('🔍 AuthContext: Starting token validation...');
      console.log('🔍 AuthContext: Page loaded at:', new Date().toISOString());
      
      const token = authService.getToken();
      const storedUser = authService.getCurrentUser();
      
      console.log('🔍 AuthContext: Token exists:', !!token);
      console.log('🔍 AuthContext: Token value:', token ? `${token.substring(0, 30)}...` : 'null');
      console.log('🔍 AuthContext: Stored user exists:', !!storedUser);
      console.log('🔍 AuthContext: Stored user data:', storedUser);
      
      if (token && storedUser) {
        console.log('✅ AuthContext: Restoring user from localStorage');
        // Immediately restore user from localStorage for better UX
        setUser(storedUser);
        
        // Then validate token with server in background
        try {
          console.log('🔄 AuthContext: Validating token with server...');
          const response = await authService.getMe();
          console.log('✅ AuthContext: Server validation successful');
          console.log('✅ AuthContext: Full server response:', response);
          console.log('✅ AuthContext: Server response data:', response.data);
          console.log('✅ AuthContext: Server response data.data:', response.data.data);
          // Update user with fresh data from server
          setUser(response.data);
          // Update localStorage with fresh data
          localStorage.setItem('user', JSON.stringify(response.data));
          console.log('✅ AuthContext: Updated localStorage with fresh user data');
          
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
            console.log('🚪 AuthContext: Token expired or invalid, logging out');
            authService.logout();
            setUser(null);
          } else {
            // For other errors (network, server down, etc.), keep user logged in
            console.warn('⚠️ AuthContext: Failed to validate token with server, but keeping user logged in:', error.message);
          }
        }
      } else {
        console.log('❌ AuthContext: No valid token or user data found');
        if (!token) console.log('❌ AuthContext: No token in localStorage');
        if (!storedUser) console.log('❌ AuthContext: No user data in localStorage');
      }
      
      console.log('🏁 AuthContext: Token validation complete, setting loading to false');
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
    console.log('🔐 AuthContext: login() called');
    const response = await authService.login(email, password, rememberMe);
    console.log('🔐 AuthContext: Setting user state with:', response.data);
    setUser(response.data);
    console.log('🔐 AuthContext: User state set, login complete');
    return response;
  };

  const logout = () => {
    authService.logout();
    setUser(null);
  };

  const updateUser = (updatedUserData) => {
    console.log('🔄 AuthContext: Updating user data:', updatedUserData);
    setUser(prevUser => ({
      ...prevUser,
      ...updatedUserData
    }));
    // Also update localStorage
    const currentUser = { ...user, ...updatedUserData };
    localStorage.setItem('user', JSON.stringify(currentUser));
    console.log('✅ AuthContext: User data updated in state and localStorage');
  };

  const value = {
    user,
    loading,
    signup,
    login,
    logout,
    updateUser,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
