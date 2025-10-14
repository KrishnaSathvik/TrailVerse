import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import userPreferencesService from '../services/userPreferencesService';

export const useUserPreferences = () => {
  const { user, isAuthenticated } = useAuth();
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastSyncAt, setLastSyncAt] = useState(null);

  // Load preferences from server
  const loadPreferences = useCallback(async () => {
    if (!isAuthenticated || !user) return;

    setLoading(true);
    setError(null);
    
    try {
      const response = await userPreferencesService.getPreferences();
      setPreferences(response.data);
      setLastSyncAt(response.data.lastSyncAt);
      
      // Register device
      await userPreferencesService.registerDevice();
    } catch (err) {
      console.error('Error loading preferences:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user]);

  // Sync preferences across devices
  const syncPreferences = useCallback(async () => {
    if (!isAuthenticated || !user) return;

    try {
      const response = await userPreferencesService.syncPreferences(lastSyncAt);
      
      if (response.data.needsSync) {
        setPreferences(response.data.preferences);
        setLastSyncAt(response.data.lastSyncAt);
        return true; // Data was synced
      }
      
      return false; // No sync needed
    } catch (err) {
      console.error('Error syncing preferences:', err);
      return false;
    }
  }, [isAuthenticated, user, lastSyncAt]);

  // Update preferences
  const updatePreferences = useCallback(async (newPreferences) => {
    if (!isAuthenticated || !user) return;

    try {
      const response = await userPreferencesService.updatePreferences(newPreferences);
      setPreferences(response.data);
      setLastSyncAt(response.data.lastSyncAt);
      return response.data;
    } catch (err) {
      console.error('Error updating preferences:', err);
      throw err;
    }
  }, [isAuthenticated, user]);

  // Update map state
  const updateMapState = useCallback(async (mapState) => {
    if (!isAuthenticated || !user) return;

    try {
      const response = await userPreferencesService.updateMapState(mapState);
      
      // Update local state
      setPreferences(prev => ({
        ...prev,
        mapState: response.data
      }));
      
      return response.data;
    } catch (err) {
      console.error('Error updating map state:', err);
      throw err;
    }
  }, [isAuthenticated, user]);

  // Update navigation state
  const updateNavigation = useCallback(async (navigation) => {
    if (!isAuthenticated || !user) return;

    try {
      const response = await userPreferencesService.updateNavigation(navigation);
      
      // Update local state
      setPreferences(prev => ({
        ...prev,
        navigation: response.data
      }));
      
      return response.data;
    } catch (err) {
      console.error('Error updating navigation:', err);
      throw err;
    }
  }, [isAuthenticated, user]);

  // Get active devices
  const getActiveDevices = useCallback(async () => {
    if (!isAuthenticated || !user) return [];

    try {
      const response = await userPreferencesService.getActiveDevices();
      return response.data;
    } catch (err) {
      console.error('Error getting active devices:', err);
      return [];
    }
  }, [isAuthenticated, user]);

  // Load preferences on mount and when user changes
  useEffect(() => {
    if (isAuthenticated && user) {
      loadPreferences();
    } else {
      setPreferences(null);
      setLastSyncAt(null);
    }
  }, [isAuthenticated, user, loadPreferences]);

  // Visibility-based sync (reduced polling for better performance)
  // Syncs when user returns to tab instead of constant polling
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const handleVisibilityChange = () => {
      if (!document.hidden && isAuthenticated) {
        console.log('[Visibility] Syncing preferences after tab became visible...');
        syncPreferences();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, user, syncPreferences]);

  return {
    preferences,
    loading,
    error,
    lastSyncAt,
    loadPreferences,
    syncPreferences,
    updatePreferences,
    updateMapState,
    updateNavigation,
    getActiveDevices
  };
};
