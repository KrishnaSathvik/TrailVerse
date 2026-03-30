const SAVED_EVENTS_KEY = 'savedEvents';

export const savedEventsService = {
  // Get all saved events from localStorage
  getSavedEvents: () => {
    try {
      const saved = localStorage.getItem(SAVED_EVENTS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.error('Error getting saved events:', error);
      return [];
    }
  },

  // Save an event to localStorage
  saveEvent: (event) => {
    try {
      const savedEvents = savedEventsService.getSavedEvents();
      const eventExists = savedEvents.some(savedEvent => savedEvent.id === event.id);
      
      if (!eventExists) {
        const updatedEvents = [...savedEvents, {
          ...event,
          savedAt: new Date().toISOString()
        }];
        localStorage.setItem(SAVED_EVENTS_KEY, JSON.stringify(updatedEvents));
        
        // Dispatch custom event for cross-tab sync
        window.dispatchEvent(new CustomEvent('savedEventsChanged', { 
          detail: { action: 'add', event, count: updatedEvents.length } 
        }));
        console.log('[SavedEvents] Event saved, dispatched cross-tab event');
        
        return true;
      }
      return false; // Event already saved
    } catch (error) {
      console.error('Error saving event:', error);
      return false;
    }
  },

  // Remove an event from saved events
  unsaveEvent: (eventId) => {
    try {
      const savedEvents = savedEventsService.getSavedEvents();
      const updatedEvents = savedEvents.filter(event => event.id !== eventId);
      localStorage.setItem(SAVED_EVENTS_KEY, JSON.stringify(updatedEvents));
      
      // Dispatch custom event for cross-tab sync
      window.dispatchEvent(new CustomEvent('savedEventsChanged', { 
        detail: { action: 'remove', eventId, count: updatedEvents.length } 
      }));
      console.log('[SavedEvents] Event removed, dispatched cross-tab event');
      
      return true;
    } catch (error) {
      console.error('Error unsaving event:', error);
      return false;
    }
  },

  // Check if an event is saved
  isEventSaved: (eventId) => {
    try {
      const savedEvents = savedEventsService.getSavedEvents();
      return savedEvents.some(event => event.id === eventId);
    } catch (error) {
      console.error('Error checking if event is saved:', error);
      return false;
    }
  },

  // Clear all saved events
  clearAllSavedEvents: () => {
    try {
      localStorage.removeItem(SAVED_EVENTS_KEY);
      return true;
    } catch (error) {
      console.error('Error clearing saved events:', error);
      return false;
    }
  }
};
