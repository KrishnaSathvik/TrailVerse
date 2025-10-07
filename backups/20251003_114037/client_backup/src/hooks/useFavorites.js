import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import favoriteService from '../services/favoriteService';

export const useFavorites = () => {
  const { user, isAuthenticated } = useAuth();
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isAuthenticated && user) {
      loadFavorites();
    }
  }, [isAuthenticated, user]);

  const loadFavorites = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const response = await favoriteService.getUserFavorites(user.id);
      setFavorites(response.data || []);
    } catch (err) {
      console.error('Error loading favorites:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const addFavorite = async (parkData) => {
    try {
      const response = await favoriteService.addFavorite(parkData);
      setFavorites(prev => [...prev, response.data]);
      return response;
    } catch (err) {
      console.error('Error adding favorite:', err);
      throw err;
    }
  };

  const removeFavorite = async (parkCode) => {
    try {
      await favoriteService.removeFavorite(parkCode);
      setFavorites(prev => prev.filter(fav => fav.parkCode !== parkCode));
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

  const isParkFavorited = (parkCode) => {
    return favorites.some(fav => fav.parkCode === parkCode);
  };

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
