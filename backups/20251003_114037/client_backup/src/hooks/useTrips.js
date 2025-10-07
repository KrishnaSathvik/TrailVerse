import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import tripService from '../services/tripService';

export const useTrips = () => {
  const { user, isAuthenticated } = useAuth();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isAuthenticated && user) {
      loadTrips();
    }
  }, [isAuthenticated, user]);

  const loadTrips = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const response = await tripService.getUserTrips(user.id);
      setTrips(response.data || []);
    } catch (err) {
      console.error('Error loading trips:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const createTrip = async (tripData) => {
    try {
      const response = await tripService.createTrip(tripData);
      setTrips(prev => [response.data, ...prev]);
      return response;
    } catch (err) {
      console.error('Error creating trip:', err);
      throw err;
    }
  };

  const updateTrip = async (tripId, tripData) => {
    try {
      const response = await tripService.updateTrip(tripId, tripData);
      setTrips(prev => 
        prev.map(trip => trip._id === tripId ? response.data : trip)
      );
      return response;
    } catch (err) {
      console.error('Error updating trip:', err);
      throw err;
    }
  };

  const deleteTrip = async (tripId) => {
    try {
      await tripService.deleteTrip(tripId);
      setTrips(prev => prev.filter(trip => trip._id !== tripId));
    } catch (err) {
      console.error('Error deleting trip:', err);
      throw err;
    }
  };

  const addMessage = async (tripId, messageData) => {
    try {
      const response = await tripService.addMessage(tripId, messageData);
      setTrips(prev => 
        prev.map(trip => trip._id === tripId ? response.data : trip)
      );
      return response;
    } catch (err) {
      console.error('Error adding message:', err);
      throw err;
    }
  };

  const getTrip = (tripId) => {
    return trips.find(trip => trip._id === tripId);
  };

  return {
    trips,
    loading,
    error,
    createTrip,
    updateTrip,
    deleteTrip,
    addMessage,
    getTrip,
    refreshTrips: loadTrips
  };
};
