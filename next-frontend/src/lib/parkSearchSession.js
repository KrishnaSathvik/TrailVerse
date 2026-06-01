const STORAGE_KEY = 'tv_last_park_search';

/**
 * Persist latest catalog search for search → click → park_view funnel.
 */
export function saveParkSearchSession({
  searchTerm,
  searchId,
  resultCount,
  surface,
  clickedParkCode,
}) {
  if (typeof window === 'undefined' || !searchTerm) return;
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        searchTerm,
        searchId: searchId || null,
        resultCount: resultCount ?? 0,
        surface: surface || 'unknown',
        at: Date.now(),
      })
    );
  } catch {
    /* ignore quota */
  }
}

export function getParkSearchSession() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.searchTerm) return null;
    if (parsed.at && Date.now() - parsed.at > 30 * 60 * 1000) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearParkSearchSession() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(STORAGE_KEY);
}
