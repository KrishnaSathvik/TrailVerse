import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import websocketService from '../services/websocketService';

export const useWebSocket = () => {
  const { user, isAuthenticated } = useAuth();
  const listenersRef = useRef(new Map());

  // Connect when authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      const token = localStorage.getItem('token');
      if (token) {
        // Small delay to ensure server is ready
        const connectTimer = setTimeout(() => {
          websocketService.connect(token);
        }, 100);
        
        return () => clearTimeout(connectTimer);
      }
    }
    // Note: We DON'T disconnect on cleanup because WebSocket should persist
    // across component mounts/unmounts. Only disconnect on logout.
  }, [isAuthenticated, user]);

  // Subscribe to events
  const subscribe = useCallback((event, callback) => {
    websocketService.on(event, callback);
    
    // Store listener for cleanup
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, []);
    }
    listenersRef.current.get(event).push(callback);
  }, []);

  // Unsubscribe from events
  const unsubscribe = useCallback((event, callback) => {
    websocketService.off(event, callback);
    
    // Remove from stored listeners
    if (listenersRef.current.has(event)) {
      const listeners = listenersRef.current.get(event);
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }, []);

  // Send message
  const send = useCallback((message) => {
    return websocketService.send(message);
  }, []);

  // Get connection status
  const getStatus = useCallback(() => {
    return websocketService.getStatus();
  }, []);

  // Subscribe to data channels
  const subscribeToFavorites = useCallback(() => {
    websocketService.subscribeToFavorites();
  }, []);

  const subscribeToTrips = useCallback(() => {
    websocketService.subscribeToTrips();
  }, []);

  const subscribeToReviews = useCallback(() => {
    websocketService.subscribeToReviews();
  }, []);

  const subscribeToPreferences = useCallback(() => {
    websocketService.subscribeToPreferences();
  }, []);

  const subscribeToBlogs = useCallback(() => {
    websocketService.subscribeToBlogs();
  }, []);

  const subscribeToEvents = useCallback(() => {
    websocketService.subscribeToEvents();
  }, []);

  const subscribeToVisited = useCallback(() => {
    websocketService.subscribeToVisited();
  }, []);

  const subscribeToProfile = useCallback(() => {
    websocketService.subscribeToProfile();
  }, []);

  // Unsubscribe from data channels
  const unsubscribeFromFavorites = useCallback(() => {
    websocketService.unsubscribeFromFavorites();
  }, []);

  const unsubscribeFromTrips = useCallback(() => {
    websocketService.unsubscribeFromTrips();
  }, []);

  const unsubscribeFromReviews = useCallback(() => {
    websocketService.unsubscribeFromReviews();
  }, []);

  const unsubscribeFromPreferences = useCallback(() => {
    websocketService.unsubscribeFromPreferences();
  }, []);

  const unsubscribeFromBlogs = useCallback(() => {
    websocketService.unsubscribeFromBlogs();
  }, []);

  const unsubscribeFromEvents = useCallback(() => {
    websocketService.unsubscribeFromEvents();
  }, []);

  const unsubscribeFromVisited = useCallback(() => {
    websocketService.unsubscribeFromVisited();
  }, []);

  const unsubscribeFromProfile = useCallback(() => {
    websocketService.unsubscribeFromProfile();
  }, []);

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      listenersRef.current.forEach((listeners, event) => {
        listeners.forEach(callback => {
          websocketService.off(event, callback);
        });
      });
      listenersRef.current.clear();
    };
  }, []);

  return {
    subscribe,
    unsubscribe,
    send,
    getStatus,
    subscribeToFavorites,
    subscribeToTrips,
    subscribeToReviews,
    subscribeToPreferences,
    subscribeToBlogs,
    subscribeToEvents,
    subscribeToVisited,
    subscribeToProfile,
    unsubscribeFromFavorites,
    unsubscribeFromTrips,
    unsubscribeFromReviews,
    unsubscribeFromPreferences,
    unsubscribeFromBlogs,
    unsubscribeFromEvents,
    unsubscribeFromVisited,
    unsubscribeFromProfile
  };
};