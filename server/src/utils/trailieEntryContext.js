'use strict';

const ENTRY_SOURCES = new Set([
  'direct', 'park_cta', 'quick_fill', 'compare', 'intent_guide',
  'personalized', 'saved_trip', 'guest_resume',
]);

function text(value, max = 240) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}

function destination(raw = {}) {
  const name = text(raw.name || raw.parkName, 160);
  const parkCode = text(raw.parkCode, 16).toLowerCase();
  if (!name && !parkCode) return null;
  const lat = Number(raw.lat ?? raw.latitude);
  const lon = Number(raw.lon ?? raw.longitude);
  return {
    ...(parkCode ? { parkCode } : {}),
    ...(name ? { name } : {}),
    ...(Number.isFinite(lat) ? { lat } : {}),
    ...(Number.isFinite(lon) ? { lon } : {}),
  };
}

function destinations(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).slice(0, 12).flatMap((raw) => {
    const value = destination(raw);
    if (!value) return [];
    const key = `${value.parkCode || ''}:${String(value.name || '').toLowerCase()}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [value];
  });
}

function formData(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const allowed = ['parkCode', 'coordinates', 'startDate', 'endDate', 'groupSize', 'budget', 'interests', 'fitnessLevel', 'accommodation', 'origin', 'mobility'];
  return Object.fromEntries(allowed.filter((key) => raw[key] != null).map((key) => [key, raw[key]]));
}

function travelerPreferences(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const result = {};
  if (Array.isArray(raw.interests)) result.interests = raw.interests.map((v) => text(v, 48)).filter(Boolean).slice(0, 12);
  for (const key of ['homeCity', 'origin', 'pace', 'hikingPreference', 'fitnessLevel', 'accessibilityPreference']) {
    const value = text(raw[key], 120);
    if (value) result[key] = value;
  }
  const budgetPreference = text(raw.budgetPreference, 48);
  if (budgetPreference) result.budgetPreference = budgetPreference;
  if (Array.isArray(raw.favoriteParkCodes)) {
    result.favoriteParkCodes = raw.favoriteParkCodes.map((v) => text(v, 16).toLowerCase()).filter(Boolean).slice(0, 8);
  }
  return Object.keys(result).length ? result : null;
}

function intentGuide(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const path = text(raw.path, 120);
  const searchQuery = text(raw.searchQuery, 240);
  if (!path && !searchQuery) return null;
  return {
    ...(path ? { path } : {}),
    ...(text(raw.title, 180) ? { title: text(raw.title, 180) } : {}),
    ...(searchQuery ? { searchQuery } : {}),
    ...(text(raw.quickAnswer, 400) ? { quickAnswer: text(raw.quickAnswer, 400) } : {}),
    featuredParkCodes: (Array.isArray(raw.featuredParkCodes) ? raw.featuredParkCodes : [])
      .map((v) => text(v, 16).toLowerCase()).filter(Boolean).slice(0, 12),
    rankedParks: destinations(raw.rankedParks).slice(0, 12),
  };
}

function normalizeTrailieEntryContext(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: true, context: { version: 1, source: 'direct', requestedDestinations: [], comparisonTargets: [] } };
  }
  const source = ENTRY_SOURCES.has(raw.source) ? raw.source : 'direct';
  const context = {
    version: 1,
    source,
    requestedDestinations: destinations(raw.requestedDestinations),
    comparisonTargets: destinations(raw.comparisonTargets),
  };
  const guide = intentGuide(raw.intentGuide);
  const form = formData(raw.formData);
  const prefs = travelerPreferences(raw.travelerPreferences);
  if (guide) context.intentGuide = guide;
  if (form) context.formData = form;
  if (prefs) context.travelerPreferences = prefs;
  if (raw.activeTripContext && typeof raw.activeTripContext === 'object') context.activeTripContext = raw.activeTripContext;
  const seedReason = text(raw.seedReason, 160);
  if (seedReason) context.seedReason = seedReason;
  return { ok: true, context };
}

function entryState(context) {
  const requested = context.requestedDestinations[0] || null;
  const form = context.formData || {};
  const coords = form.coordinates || {};
  const destinationValue = requested || destination({
    parkCode: form.parkCode,
    name: context.activeTripContext?.primaryDestination?.name,
    lat: coords.lat,
    lon: coords.lon,
  });
  const result = {};
  if (destinationValue) result.destination = destinationValue;
  if (form.startDate || form.endDate) result.dates = { startDate: form.startDate || null, endDate: form.endDate || null };
  if (form.groupSize != null) result.travelers = { partySize: Number(form.groupSize) || 1 };
  if (form.budget) result.budget = { level: form.budget };
  if (form.interests?.length || form.fitnessLevel || context.travelerPreferences) {
    result.preferences = {
      ...(context.travelerPreferences || {}),
      ...(form.interests?.length ? { interests: form.interests } : {}),
      ...(form.fitnessLevel ? { fitnessLevel: form.fitnessLevel } : {}),
    };
  }
  if (context.comparisonTargets.length) result.comparisonTargets = context.comparisonTargets;
  if (context.intentGuide) result.intentGuide = context.intentGuide;
  return result;
}

function mergeObjects(base, overlay) {
  if (!overlay || typeof overlay !== 'object') return base || {};
  const next = { ...(base || {}) };
  for (const [key, value] of Object.entries(overlay)) {
    if (value === undefined) continue;
    next[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? mergeObjects(next[key], value)
      : value;
  }
  return next;
}

/** Entry fills blanks; persisted server state supersedes it; current-message patch wins last. */
function mergeTrailieEntryContext({ entryContext, persistedPlanningState, currentPatch } = {}) {
  const normalized = normalizeTrailieEntryContext(entryContext).context;
  return mergeObjects(mergeObjects(entryState(normalized), persistedPlanningState), currentPatch);
}

function hasSemanticTrailieEntryContext(raw) {
  const context = normalizeTrailieEntryContext(raw).context;
  return Boolean(
    context.requestedDestinations.length
    || context.comparisonTargets.length
    || context.intentGuide
    || context.travelerPreferences
    || context.formData
    || context.activeTripContext
  );
}

function shouldStartFreshGuestEntry({ incoming, persisted } = {}) {
  const next = normalizeTrailieEntryContext(incoming).context;
  if (!['park_cta', 'compare', 'intent_guide', 'personalized'].includes(next.source)) return false;
  if (!hasSemanticTrailieEntryContext(next)) return false;
  // Legacy guest sessions predate EntryContext. Treat an explicit semantic
  // launch as a clean boundary so their unknown destination/plan cannot leak.
  if (!hasSemanticTrailieEntryContext(persisted)) return true;
  return JSON.stringify(next) !== JSON.stringify(normalizeTrailieEntryContext(persisted).context);
}

module.exports = {
  ENTRY_SOURCES,
  normalizeTrailieEntryContext,
  mergeTrailieEntryContext,
  hasSemanticTrailieEntryContext,
  shouldStartFreshGuestEntry,
};
