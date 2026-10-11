export const TRIP_ENTRY = { NEW: 'START_NEW_TRIP', CONTINUE: 'CONTINUE_CURRENT_TRIP' };

// Entry semantics come from navigation controls, never from interpreting prose.
export function resolveTripEntryIntent(params, tripId = null) {
  if (tripId || params?.get('entry') === 'continue') return TRIP_ENTRY.CONTINUE;
  if (params?.get('entry') === 'new-trip' ||
      ['ask', 'park', 'suggest', 'newchat', 'personalized'].some(key => params?.has(key)) ||
      params?.get('from') === 'intent') return TRIP_ENTRY.NEW;
  return TRIP_ENTRY.CONTINUE;
}
