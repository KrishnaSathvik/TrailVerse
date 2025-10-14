import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from './useWebSocket';
import tripService from '../services/tripService';

export const useTrips = () => {
  const { user, isAuthenticated } = useAuth();
  const { subscribe, unsubscribe, subscribeToTrips } = useWebSocket();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isAuthenticated && user) {
      loadTrips();
    }
  }, [isAuthenticated, user]);

  // Setup WebSocket real-time sync
  useEffect(() => {
    if (!user || !isAuthenticated) return;

    // Subscribe to trips channel
    subscribeToTrips();

    // Handle trip created from another device/tab
    const handleTripCreated = (trip) => {
      console.log('[Real-Time] Trip created:', trip);
      setTrips(prev => {
        // Avoid duplicates
        if (prev.some(t => t._id === trip._id)) return prev;
        return [trip, ...prev];
      });
    };

    // Handle trip updated from another device/tab
    const handleTripUpdated = (trip) => {
      console.log('[Real-Time] Trip updated:', trip);
      setTrips(prev => prev.map(t => t._id === trip._id ? trip : t));
    };

    // Handle trip deleted from another device/tab
    const handleTripDeleted = (data) => {
      console.log('[Real-Time] Trip deleted:', data);
      setTrips(prev => prev.filter(t => t._id !== data.tripId));
    };

    // Subscribe to WebSocket events
    subscribe('tripCreated', handleTripCreated);
    subscribe('tripUpdated', handleTripUpdated);
    subscribe('tripDeleted', handleTripDeleted);

    // Cleanup
    return () => {
      unsubscribe('tripCreated', handleTripCreated);
      unsubscribe('tripUpdated', handleTripUpdated);
      unsubscribe('tripDeleted', handleTripDeleted);
    };
  }, [user, isAuthenticated, subscribe, unsubscribe, subscribeToTrips]);

  const loadTrips = async () => {
    if (!user) return;
    
    // Get user ID - handle both _id and id properties
    const userId = user.id || user._id;
    if (!userId) {
      console.error('No user ID found in user object:', user);
      setError('User ID not found');
      return;
    }
    
    setLoading(true);
    try {
      const response = await tripService.getUserTrips(userId);
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
