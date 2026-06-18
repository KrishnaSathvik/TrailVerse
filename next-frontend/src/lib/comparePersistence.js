/** Session fallback when compare URL has not synced yet (e.g. refresh before router.replace). */
export const COMPARE_SELECTION_KEY = 'trailverse-compare-selection';

export const COMPARE_MAX_PARKS = 4;

/**
 * @param {string | null | undefined} raw
 * @returns {string[]}
 */
export function parseCompareParkCodes(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return [...new Set(raw.split(',').map((code) => code.trim().toLowerCase()).filter(Boolean))].slice(
    0,
    COMPARE_MAX_PARKS
  );
}

/**
 * @param {Array<{ parkCode?: string }>} parks
 */
export function saveCompareSelection(parks) {
  if (typeof window === 'undefined') return;
  try {
    if (!parks?.length) {
      sessionStorage.removeItem(COMPARE_SELECTION_KEY);
      return;
    }
    sessionStorage.setItem(
      COMPARE_SELECTION_KEY,
      parks.map((p) => p.parkCode).filter(Boolean).join(',')
    );
  } catch {
    // Private mode / quota — URL is still the primary source of truth
  }
}

/**
 * @returns {string[]}
 */
export function loadCompareSelectionCodes() {
  if (typeof window === 'undefined') return [];
  try {
    return parseCompareParkCodes(sessionStorage.getItem(COMPARE_SELECTION_KEY));
  } catch {
    return [];
  }
}
