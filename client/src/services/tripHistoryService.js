// Trip History Service - handles saving/loading trip conversations
// Note: Trips are only saved when user explicitly clicks the Save button

const TRIP_HISTORY_KEY = 'npe_usa_trip_history';
const USER_PREFERENCES_KEY = 'npe_usa_user_preferences';

export const tripHistoryService = {
  // Save a new trip conversation
  saveTrip: (userId, tripData) => {
    const history = tripHistoryService.getTripHistory(userId);
    const trip = {
      id: Date.now().toString(),
      userId,
      parkName: tripData.parkName,
      parkCode: tripData.parkCode,
      formData: tripData.formData,
      summary: tripData.summary || null, // Trip summary instead of full messages
      plan: tripData.plan || null,
      provider: tripData.provider || null,
      conversationId: tripData.conversationId || null, // Reference to full conversation
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active' // active, archived, deleted
    };
    
    history.push(trip);
    localStorage.setItem(TRIP_HISTORY_KEY, JSON.stringify(history));
    
    // Update user preferences with this trip
    tripHistoryService.updateUserPreferences(userId, tripData);
    
    return trip;
  },

  // Update existing trip
  updateTrip: (tripId, updates) => {
    const allHistory = JSON.parse(localStorage.getItem(TRIP_HISTORY_KEY) || '[]');
    const index = allHistory.findIndex(t => t.id === tripId);
    
    if (index !== -1) {
      allHistory[index] = {
        ...allHistory[index],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      localStorage.setItem(TRIP_HISTORY_KEY, JSON.stringify(allHistory));
      return allHistory[index];
    }
    return null;
  },

  // Get all trips for a user
  getTripHistory: (userId) => {
    const allHistory = JSON.parse(localStorage.getItem(TRIP_HISTORY_KEY) || '[]');
    return allHistory.filter(trip => trip.userId === userId && trip.status === 'active');
  },

  // Get single trip by ID
  getTrip: (tripId) => {
    const allHistory = JSON.parse(localStorage.getItem(TRIP_HISTORY_KEY) || '[]');
    return allHistory.find(t => t.id === tripId);
  },

  // Delete trip
  deleteTrip: (tripId) => {
    const allHistory = JSON.parse(localStorage.getItem(TRIP_HISTORY_KEY) || '[]');
    const updated = allHistory.filter(t => t.id !== tripId);
    localStorage.setItem(TRIP_HISTORY_KEY, JSON.stringify(updated));
  },

  // Archive trip
  archiveTrip: (tripId) => {
    return tripHistoryService.updateTrip(tripId, { status: 'archived' });
  },

  // Update user preferences (for AI memory)
  updateUserPreferences: (userId, tripData) => {
    const prefs = tripHistoryService.getUserPreferences(userId);
    
    // Track preferences
    if (!prefs.parks) prefs.parks = {};
    if (!prefs.parks[tripData.parkCode]) {
      prefs.parks[tripData.parkCode] = { visits: 0, lastVisit: null };
    }
    prefs.parks[tripData.parkCode].visits++;
    prefs.parks[tripData.parkCode].lastVisit = new Date().toISOString();

    // Track interests
    if (!prefs.interests) prefs.interests = {};
    tripData.formData.interests.forEach(interest => {
      prefs.interests[interest] = (prefs.interests[interest] || 0) + 1;
    });

    // Track budget preference
    if (!prefs.budgetLevels) prefs.budgetLevels = {};
    const budget = tripData.formData.budget;
    prefs.budgetLevels[budget] = (prefs.budgetLevels[budget] || 0) + 1;

    // Track fitness level
    if (!prefs.fitnessLevels) prefs.fitnessLevels = {};
    const fitness = tripData.formData.fitnessLevel;
    prefs.fitnessLevels[fitness] = (prefs.fitnessLevels[fitness] || 0) + 1;

    localStorage.setItem(`${USER_PREFERENCES_KEY}_${userId}`, JSON.stringify(prefs));
  },

  // Get user preferences (for AI context)
  getUserPreferences: (userId) => {
    const prefs = localStorage.getItem(`${USER_PREFERENCES_KEY}_${userId}`);
    return prefs ? JSON.parse(prefs) : {};
  },

  // Get AI context for user
  getAIContext: (userId) => {
    const history = tripHistoryService.getTripHistory(userId);
    const prefs = tripHistoryService.getUserPreferences(userId);
    
    // Build context summary
    const context = {
      totalTrips: history.length,
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
      recentParks: history
        .slice(-5)
        .map(t => ({ name: t.parkName, code: t.parkCode }))
    };

    return context;
  }
};
