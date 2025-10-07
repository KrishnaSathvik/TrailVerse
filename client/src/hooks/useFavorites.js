import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import favoriteService from '../services/favoriteService';

export const useFavorites = () => {
  const { user, isAuthenticated } = useAuth();
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load favorites from API - simplified version
  const loadFavorites = useCallback(async () => {
    console.log('useFavorites - loadFavorites called:', { user: !!user, isAuthenticated, userId: user?.id || user?._id });
    
    if (!user || !isAuthenticated) {
      console.log('useFavorites - No user or not authenticated, clearing favorites');
      setFavorites([]);
      return;
    }
    
    // Prevent multiple simultaneous calls
    if (loading) {
      console.log('useFavorites - Already loading, skipping duplicate call');
      return;
    }
    
    // Get user ID - handle both _id and id properties
    const userId = user.id || user._id;
    if (!userId) {
      console.error('No user ID found in user object:', user);
      setError('User ID not found');
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      console.log('useFavorites - Fetching favorites for userId:', userId);
      const response = await favoriteService.getUserFavorites(userId);
      // The API returns the favorites array directly in response.data
      // Check if response.data is an array (direct favorites) or has a data property
      const favoritesData = Array.isArray(response.data) ? response.data : (response.data?.data || []);
      console.log('useFavorites - Received favorites:', favoritesData.length, 'items');
      setFavorites(favoritesData);
    } catch (err) {
      console.error('Error loading favorites:', err);
      setError(err.message);
      setFavorites([]);
    } finally {
      setLoading(false);
    }
  }, [user, isAuthenticated]);

  // Load favorites on mount and when user changes
  useEffect(() => {
    if (user && isAuthenticated) {
      loadFavorites();
    }
  }, [user, isAuthenticated]); // Removed loadFavorites from dependencies to prevent infinite loops

  const addFavorite = async (parkData) => {
    try {
      const response = await favoriteService.addFavorite(parkData);
      
      // Optimistically update the state instead of reloading
      if (response.data) {
        setFavorites(prevFavorites => [...prevFavorites, response.data]);
      }
      
      return response;
    } catch (err) {
      console.error('Error adding favorite:', err);
      console.error('Error details:', {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data
      });
      throw err;
    }
  };

  const removeFavorite = async (parkCode) => {
    try {
      await favoriteService.removeFavorite(parkCode);
      
      // Optimistically update the state instead of reloading
      setFavorites(prevFavorites => prevFavorites.filter(fav => fav.parkCode !== parkCode));
    } catch (err) {
      console.error('Error removing favorite:', err);
      throw err;
    }
  };

  const updateFavorite = async (favoriteId, favoriteData) => {
    try {
      const response = await favoriteService.updateFavorite(favoriteId, favoriteData);
      setFavorites(prev => 
        prev.map(fav => fav._id === favoriteId ? response.data : fav)
      );
      return response;
    } catch (err) {
      console.error('Error updating favorite:', err);
      throw err;
    }
  };

  const isParkFavorited = useCallback((parkCode) => {
    return favorites.some(fav => fav.parkCode === parkCode);
  }, [favorites]);

  const getFavorite = (parkCode) => {
    return favorites.find(fav => fav.parkCode === parkCode);
  };

  return {
    favorites,
    loading,
    error,
    addFavorite,
    removeFavorite,
    updateFavorite,
    isParkFavorited,
    getFavorite,
    refreshFavorites: loadFavorites
  };
};
