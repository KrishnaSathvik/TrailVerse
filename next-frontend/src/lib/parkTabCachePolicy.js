const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

/** NPS catalog tabs — counts and payloads change rarely. */
export const STATIC_EXPLORE_TAB_STALE_MS = ONE_DAY_MS;

/** explore-index counts — same cadence as static tabs. */
export const EXPLORE_INDEX_STALE_MS = ONE_DAY_MS;

/** React Query gcTime for cached tab payloads. */
export const STATIC_TAB_GC_MS = SEVEN_DAYS_MS;

/** Only tabs with in-app seasonal/schedule data need short client staleTime. */
const LIVE_TAB_STALE_MS = {
  transit: 15 * 60 * 1000,
};

const LIVE_TAB_GC_MS = ONE_HOUR_MS;

/**
 * Client-side staleTime for a park explore tab fetch.
 * Alerts/permits/reviews use separate endpoints — not covered here.
 * Only transit uses a short staleTime (in-app schedules); parking/webcams are catalog link-outs.
 * @param {string} tabId
 */
export function getParkTabStaleTimeMs(tabId) {
  return LIVE_TAB_STALE_MS[tabId] ?? STATIC_EXPLORE_TAB_STALE_MS;
}

export function getParkTabGcTimeMs(tabId) {
  return LIVE_TAB_STALE_MS[tabId] ? LIVE_TAB_GC_MS : STATIC_TAB_GC_MS;
}
