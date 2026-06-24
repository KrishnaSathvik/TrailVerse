const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

/** NPS catalog tabs — static NPS payloads; rarely change after first fetch. */
export const STATIC_EXPLORE_TAB_STALE_MS = SEVEN_DAYS_MS;

/** explore-index tab counts — same cadence as catalog tabs. */
export const EXPLORE_INDEX_STALE_MS = SEVEN_DAYS_MS;

/** React Query gcTime for cached tab payloads (browser memory, not Vercel). */
export const STATIC_TAB_GC_MS = SEVEN_DAYS_MS;

/** Only tabs with in-app seasonal/schedule data need short client staleTime. */
const LIVE_TAB_STALE_MS = {
  transit: 15 * 60 * 1000,
};

const LIVE_TAB_GC_MS = ONE_HOUR_MS;

/**
 * Client-side staleTime for a park explore tab fetch.
 * Alerts/permits/reviews/weather use separate endpoints — not covered here.
 * @param {string} tabId
 */
export function getParkTabStaleTimeMs(tabId) {
  return LIVE_TAB_STALE_MS[tabId] ?? STATIC_EXPLORE_TAB_STALE_MS;
}

export function getParkTabGcTimeMs(tabId) {
  return LIVE_TAB_STALE_MS[tabId] ? LIVE_TAB_GC_MS : STATIC_TAB_GC_MS;
}
