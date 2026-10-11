import { resolveTripEntryIntent } from './tripEntryIntent';
const SOURCES = new Set(['direct', 'park_cta', 'quick_fill', 'compare', 'intent_guide', 'personalized', 'saved_trip', 'guest_resume']);

const clean = (value, max = 240) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';

function splitCompareTargets(value) {
  return clean(value, 500).split(/\s+(?:and|vs\.?|versus)\s+|\s*,\s*/i)
    .map((name) => clean(name, 160)).filter(Boolean).slice(0, 12).map((name) => ({ name }));
}

function boundedIntentGuide(raw) {
  if (!raw?.path) return null;
  return {
    path: clean(raw.path, 120),
    title: clean(raw.title, 180),
    searchQuery: clean(raw.searchQuery, 240),
    quickAnswer: clean(raw.quickAnswer, 400),
    featuredParkCodes: (raw.featuredParkCodes || []).map((v) => clean(v, 16).toLowerCase()).filter(Boolean).slice(0, 12),
    rankedParks: (raw.rankedParks || []).slice(0, 12).map((park) => ({ parkCode: clean(park.parkCode, 16).toLowerCase(), name: clean(park.fullName || park.name, 160) })).filter((park) => park.name),
  };
}

export function buildPlanAiEntryContext({ searchParams, tripId = null, coordinates = null, formData = null, intentContext = null, source = null } = {}) {
  const parkCode = clean(searchParams?.get?.('park'), 16).toLowerCase();
  const parkName = clean(searchParams?.get?.('name'), 160);
  const suggest = clean(searchParams?.get?.('suggest'), 500);
  let resolvedSource = source;
  if (!resolvedSource) {
    if (searchParams?.has?.('newchat')) resolvedSource = 'direct';
    else if (searchParams?.has?.('personalized')) resolvedSource = 'personalized';
    else if (suggest) resolvedSource = 'compare';
    else if (intentContext?.path || searchParams?.get?.('from') === 'intent') resolvedSource = 'intent_guide';
    else if (parkCode || parkName) resolvedSource = 'park_cta';
    else if (tripId) resolvedSource = 'saved_trip';
    else resolvedSource = 'direct';
  }
  if (!SOURCES.has(resolvedSource)) resolvedSource = 'direct';
  const requestedDestinations = parkCode || parkName ? [{
    ...(parkCode ? { parkCode } : {}), ...(parkName ? { name: parkName } : {}),
    ...(Number.isFinite(coordinates?.lat) ? { lat: coordinates.lat } : {}),
    ...(Number.isFinite(coordinates?.lon) ? { lon: coordinates.lon } : {}),
  }] : [];
  return {
    version: 1,
    tripEntryIntent: resolveTripEntryIntent(searchParams, tripId),
    guestConversationId: searchParams?.get?.('conversation') || null,
    source: resolvedSource,
    requestedDestinations,
    comparisonTargets: suggest ? splitCompareTargets(suggest) : [],
    ...(formData ? { formData } : {}),
    ...(boundedIntentGuide(intentContext) ? { intentGuide: boundedIntentGuide(intentContext) } : {}),
  };
}

export function withPersonalization(context, aiContext) {
  const raw = aiContext?.preferences || aiContext || {};
  const preferences = {};
  const interests = raw.interests || raw.topInterests;
  if (Array.isArray(interests)) preferences.interests = interests.map((v) => clean(v, 48)).filter(Boolean).slice(0, 12);
  for (const key of ['homeCity', 'origin', 'pace', 'hikingPreference', 'fitnessLevel', 'accessibilityPreference']) {
    const value = clean(key === 'fitnessLevel' ? (raw[key] || raw.preferredFitness) : raw[key], 120);
    if (value) preferences[key] = value;
  }
  const budgetPreference = clean(raw.budgetPreference || raw.preferredBudget, 48);
  if (budgetPreference) preferences.budgetPreference = budgetPreference;
  if (Array.isArray(raw.favoriteParkCodes || raw.favoriteParks)) {
    preferences.favoriteParkCodes = (raw.favoriteParkCodes || raw.favoriteParks)
      .map((value) => clean(value, 16).toLowerCase()).filter(Boolean).slice(0, 8);
  }
  return { ...context, source: 'personalized', ...(Object.keys(preferences).length ? { travelerPreferences: preferences } : {}) };
}

export function withEntryFormData(context, formData, source = null) {
  return { ...context, ...(source ? { source } : {}), formData };
}

export function shouldRestorePlanAiSession({
  isAuthenticated,
  existingTripId = null,
  isNewChat = false,
  isPersonalized = false,
  isStartingFresh = false,
  initialAskMessage = null,
  entryContext = null,
} = {}) {
  if (!isAuthenticated || existingTripId || isNewChat || isPersonalized || isStartingFresh || initialAskMessage) return false;
  return !entryContext?.source || entryContext.source === 'direct';
}

export function shouldRestoreAnonymousPlanAiSession({ entryContext = null, hasCompletedSession = false } = {}) {
  if (!hasCompletedSession) return false;
  return !entryContext?.source || ['direct', 'guest_resume'].includes(entryContext.source);
}
