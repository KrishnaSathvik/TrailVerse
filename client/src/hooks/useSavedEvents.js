import { useState, useEffect, useCallback } from 'react';
import { savedEventsService } from '../services/savedEventsService';

export const useSavedEvents = () => {
  const [savedEvents, setSavedEvents] = useState([]);
  const [loading, setLoading] = useState(false);

  // Load saved events from localStorage
  const loadSavedEvents = useCallback(() => {
    try {
      const events = savedEventsService.getSavedEvents();
      setSavedEvents(events);
    } catch (error) {
      console.error('Error loading saved events:', error);
    }
  }, []);

  // Save an event
  const saveEvent = useCallback((event) => {
    setLoading(true);
    try {
      const success = savedEventsService.saveEvent(event);
      if (success) {
        loadSavedEvents(); // Reload to get updated list
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error saving event:', error);
      return false;
    } finally {
      setLoading(false);
    }
  }, [loadSavedEvents]);

  // Unsave an event
  const unsaveEvent = useCallback((eventId) => {
    setLoading(true);
    try {
      const success = savedEventsService.unsaveEvent(eventId);
      if (success) {
        loadSavedEvents(); // Reload to get updated list
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error unsaving event:', error);
      return false;
    } finally {
      setLoading(false);
    }
  }, [loadSavedEvents]);

  // Check if an event is saved
  const isEventSaved = useCallback((eventId) => {
    return savedEventsService.isEventSaved(eventId);
  }, []);

  // Clear all saved events
  const clearAllSavedEvents = useCallback(() => {
    setLoading(true);
    try {
      const success = savedEventsService.clearAllSavedEvents();
      if (success) {
        setSavedEvents([]);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error clearing saved events:', error);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // Load saved events on mount
  useEffect(() => {
    loadSavedEvents();
  }, [loadSavedEvents]);

  return {
    savedEvents,
    loading,
    saveEvent,
    unsaveEvent,
    isEventSaved,
    clearAllSavedEvents,
    loadSavedEvents
  };
};
