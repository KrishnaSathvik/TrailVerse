/**
 * Trip History Service - MIGRATED TO DATABASE-ONLY
 * 
 * IMPORTANT: This service now uses the database (via tripService) as the single source of truth.
 * localStorage is ONLY used temporarily for:
 * 1. Current unsaved chat session state (auto-cleared after save)
 * 2. Migration of legacy localStorage trips to database
 * 
 * DO NOT use this service for persistent trip storage - use tripService instead.
 */

import tripService from './tripService';

const LEGACY_TRIP_HISTORY_KEY = 'npe_usa_trip_history';
const TEMP_CHAT_STATE_KEY = 'planai-chat-state';
const USER_PREFERENCES_KEY = 'npe_usa_user_preferences';
const MIGRATION_FLAG_KEY = 'trips_migrated_to_db';

/**
 * Migrate legacy localStorage trips to database
 * This should be called once per user on app initialization
 */
export const migrateLegacyTrips = async (userId) => {
  // Check if already migrated
  const migrated = localStorage.getItem(`${MIGRATION_FLAG_KEY}_${userId}`);
  if (migrated === 'true') {
    console.log('[TripHistory] Already migrated to database');
    return { success: true, migrated: 0, message: 'Already migrated' };
  }

  try {
    // Get legacy trips from localStorage
    const legacyTrips = JSON.parse(localStorage.getItem(LEGACY_TRIP_HISTORY_KEY) || '[]');
    const userTrips = legacyTrips.filter(trip => trip.userId === userId && trip.status !== 'temp');
    
    if (userTrips.length === 0) {
      console.log('[TripHistory] No legacy trips to migrate');
      localStorage.setItem(`${MIGRATION_FLAG_KEY}_${userId}`, 'true');
      return { success: true, migrated: 0, message: 'No trips to migrate' };
    }

    console.log(`[TripHistory] Migrating ${userTrips.length} legacy trips to database...`);
    
    let migratedCount = 0;
    const errors = [];

    for (const legacyTrip of userTrips) {
      try {
        // Check if trip already exists in database by checking for conversationId
        if (legacyTrip.conversationId) {
          // Skip if already in database
          continue;
        }

        // Create trip in database
        await tripService.createTrip({
          userId: userId,
          parkCode: legacyTrip.parkCode,
          parkName: legacyTrip.parkName,
          title: `${legacyTrip.parkName} Trip Plan`,
          formData: legacyTrip.formData || {},
          plan: legacyTrip.plan || null,
          provider: legacyTrip.provider || 'claude',
          status: legacyTrip.status || 'active',
          conversation: [] // Legacy trips don't have full conversation history
        });
        
        migratedCount++;
      } catch (error) {
        console.error(`[TripHistory] Error migrating trip ${legacyTrip.id}:`, error);
        errors.push({ tripId: legacyTrip.id, error: error.message });
      }
    }

    // Mark as migrated
    localStorage.setItem(`${MIGRATION_FLAG_KEY}_${userId}`, 'true');
    
    // Clear legacy trips from localStorage after successful migration
    if (errors.length === 0) {
      localStorage.removeItem(LEGACY_TRIP_HISTORY_KEY);
      console.log('[TripHistory] ✅ Successfully migrated all trips and cleared localStorage');
    }

    return {
      success: true,
      migrated: migratedCount,
      errors: errors.length,
      message: `Migrated ${migratedCount} trips${errors.length > 0 ? `, ${errors.length} errors` : ''}`
    };
  } catch (error) {
    console.error('[TripHistory] Migration error:', error);
    return {
      success: false,
      migrated: 0,
      errors: 1,
      message: error.message
    };
  }
};

/**
 * Save temporary chat state (for unsaved conversations)
 * This is only for the current session and is cleared when trip is saved
 */
export const saveTempChatState = (chatState) => {
  try {
    localStorage.setItem(TEMP_CHAT_STATE_KEY, JSON.stringify(chatState));
  } catch (error) {
    console.error('[TripHistory] Error saving temp chat state:', error);
  }
};

/**
 * Get temporary chat state
 */
export const getTempChatState = () => {
  try {
    const state = localStorage.getItem(TEMP_CHAT_STATE_KEY);
    return state ? JSON.parse(state) : null;
  } catch (error) {
    console.error('[TripHistory] Error getting temp chat state:', error);
    return null;
  }
};

/**
 * Clear temporary chat state (call after saving trip)
 */
export const clearTempChatState = () => {
  try {
    localStorage.removeItem(TEMP_CHAT_STATE_KEY);
  } catch (error) {
    console.error('[TripHistory] Error clearing temp chat state:', error);
  }
};

/**
 * Update user preferences (for AI context)
 * These are lightweight user preferences, not trip data
 */
export const updateUserPreferences = (userId, tripData) => {
  try {
    const prefs = getUserPreferences(userId);
    
    // Track preferences
    if (!prefs.parks) prefs.parks = {};
    if (!prefs.parks[tripData.parkCode]) {
      prefs.parks[tripData.parkCode] = { visits: 0, lastVisit: null };
    }
    prefs.parks[tripData.parkCode].visits++;
    prefs.parks[tripData.parkCode].lastVisit = new Date().toISOString();

    // Track interests
    if (!prefs.interests) prefs.interests = {};
    if (tripData.formData && tripData.formData.interests) {
      tripData.formData.interests.forEach(interest => {
        prefs.interests[interest] = (prefs.interests[interest] || 0) + 1;
      });
    }

    // Track budget preference
    if (!prefs.budgetLevels) prefs.budgetLevels = {};
    if (tripData.formData && tripData.formData.budget) {
      const budget = tripData.formData.budget;
      prefs.budgetLevels[budget] = (prefs.budgetLevels[budget] || 0) + 1;
    }

    // Track fitness level
    if (!prefs.fitnessLevels) prefs.fitnessLevels = {};
    if (tripData.formData && tripData.formData.fitnessLevel) {
      const fitness = tripData.formData.fitnessLevel;
      prefs.fitnessLevels[fitness] = (prefs.fitnessLevels[fitness] || 0) + 1;
    }

    localStorage.setItem(`${USER_PREFERENCES_KEY}_${userId}`, JSON.stringify(prefs));
  } catch (error) {
    console.error('[TripHistory] Error updating user preferences:', error);
  }
};

/**
 * Get user preferences (for AI context)
 */
export const getUserPreferences = (userId) => {
  try {
    const prefs = localStorage.getItem(`${USER_PREFERENCES_KEY}_${userId}`);
    return prefs ? JSON.parse(prefs) : {};
  } catch (error) {
    console.error('[TripHistory] Error getting user preferences:', error);
    return {};
  }
};

/**
 * Get AI context for user based on their preferences
 */
export const getAIContext = async (userId) => {
  try {
    // Get trip history from database
    const tripsResponse = await tripService.getUserTrips(userId);
    const trips = tripsResponse.data || tripsResponse || [];
    
    // Get preferences from localStorage
    const prefs = getUserPreferences(userId);
    
    // Build context summary
    const context = {
      totalTrips: trips.length,
      favoriteParks: Object.entries(prefs.parks || {})
        .sort((a, b) => b[1].visits - a[1].visits)
        .slice(0, 3)
        .map(([code, _data]) => code),
      topInterests: Object.entries(prefs.interests || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([interest]) => interest),
      preferredBudget: Object.entries(prefs.budgetLevels || {})
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'moderate',
      preferredFitness: Object.entries(prefs.fitnessLevels || {})
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'moderate',
      recentParks: trips
        .slice(-5)
        .map(t => ({ name: t.parkName, code: t.parkCode }))
    };

    return context;
  } catch (error) {
    console.error('[TripHistory] Error getting AI context:', error);
    return {
      totalTrips: 0,
      favoriteParks: [],
      topInterests: [],
      preferredBudget: 'moderate',
      preferredFitness: 'moderate',
      recentParks: []
    };
  }
};

// ===== DEPRECATED FUNCTIONS =====
// These functions are kept for backwards compatibility but should not be used
// They will be removed in a future version

/**
 * @deprecated Use tripService.createTrip() instead
 */
export const saveTrip = async (userId, tripData) => {
  console.warn('[TripHistory] saveTrip() is deprecated. Use tripService.createTrip() instead.');
  return await tripService.createTrip({
    userId,
    parkCode: tripData.parkCode,
    parkName: tripData.parkName,
    title: `${tripData.parkName} Trip Plan`,
    formData: tripData.formData || {},
    plan: tripData.plan || null,
    provider: tripData.provider || 'claude',
    conversation: tripData.conversation || []
  });
};

/**
 * @deprecated Use tripService.getUserTrips() instead
 */
export const getTripHistory = async (userId) => {
  console.warn('[TripHistory] getTripHistory() is deprecated. Use tripService.getUserTrips() instead.');
  const response = await tripService.getUserTrips(userId);
  return response.data || response || [];
};

/**
 * @deprecated Use tripService.getUserTrips() with status filter instead
 */
export const getActiveTripHistory = async (userId) => {
  console.warn('[TripHistory] getActiveTripHistory() is deprecated. Use tripService.getUserTrips() instead.');
  const response = await tripService.getUserTrips(userId);
  const trips = response.data || response || [];
  return trips.filter(trip => trip.status === 'active');
};

/**
 * @deprecated Use tripService.getTrip() instead
 */
export const getTrip = async (tripId) => {
  console.warn('[TripHistory] getTrip() is deprecated. Use tripService.getTrip() instead.');
  const response = await tripService.getTrip(tripId);
  return response.data || response;
};

/**
 * @deprecated Use tripService.deleteTrip() instead
 */
export const deleteTrip = async (tripId) => {
  console.warn('[TripHistory] deleteTrip() is deprecated. Use tripService.deleteTrip() instead.');
  return await tripService.deleteTrip(tripId);
};

/**
 * @deprecated Use tripService.archiveTrip() instead
 */
export const archiveTrip = async (tripId) => {
  console.warn('[TripHistory] archiveTrip() is deprecated. Use tripService.archiveTrip() instead.');
  return await tripService.archiveTrip(tripId);
};

/**
 * @deprecated Use tripService.updateTrip() instead
 */
export const updateTrip = async (tripId, updates) => {
  console.warn('[TripHistory] updateTrip() is deprecated. Use tripService.updateTrip() instead.');
  return await tripService.updateTrip(tripId, updates);
};

// Export the service with new functions
export const tripHistoryService = {
  // New database-backed functions
  migrateLegacyTrips,
  saveTempChatState,
  getTempChatState,
  clearTempChatState,
  updateUserPreferences,
  getUserPreferences,
  getAIContext,
  
  // Deprecated functions (backwards compatibility)
  saveTrip,
  getTripHistory,
  getActiveTripHistory,
  getTrip,
  deleteTrip,
  archiveTrip,
  updateTrip
};

export default tripHistoryService;
