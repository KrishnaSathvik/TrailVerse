/**
 * /plan-ai welcome chips ("Try asking…").
 *
 * These are ordinary live prompts, not a demo mode and not /trailie-demo.
 * /trailie-demo plays captured fixtures from `trailieDemoPlayback.json` and
 * must not import this module. A chip click calls the same `handleSendMessage`
 * the composer calls.
 *
 * Keep this set short and general. Heavy planning / comparison / constraint
 * questions belong on `/trailie-demo`, not on the welcome row.
 *
 * `promptRequestsLiveData` still blocks inventory/open-now phrasing that would
 * turn every chip into a live-web roll.
 */

/** Icon keys resolved by the consumer — this module stays render-free. */
export const DEMO_PROMPT_ICONS = ['sparkles', 'mapPin', 'compare', 'calendar'];

/**
 * Default /plan-ai starters. The chip shows `text` (no short marketing label).
 * Order matches the welcome grid: left-to-right, top-to-bottom.
 */
export const TRAILIE_DEMO_PROMPTS = [
  {
    id: 'itinerary-yellowstone-family',
    icon: 'sparkles',
    capability: 'itinerary',
    text: 'Plan a 5-day trip to Yellowstone for a family',
  },
  {
    id: 'discovery-stargazing-southwest',
    icon: 'mapPin',
    capability: 'discovery',
    text: 'Best national parks for stargazing in the Southwest',
  },
  {
    id: 'weekend-denver-budget',
    icon: 'calendar',
    capability: 'itinerary',
    text: 'Weekend hiking trip from Denver under $500',
  },
  {
    id: 'compare-zion-bryce',
    icon: 'compare',
    capability: 'comparison',
    text: 'Compare Zion and Bryce Canyon for beginners',
  },
];

/** Shown instead of the default set in My Recommendations (personalized) mode. */
export const TRAILIE_PERSONALIZED_PROMPTS = [
  {
    id: 'personalized-next-trip',
    icon: 'sparkles',
    capability: 'recommendation',
    text: 'Suggest my next park trip based on the parks I have already visited',
  },
  {
    id: 'personalized-unvisited',
    icon: 'mapPin',
    capability: 'recommendation',
    text: "Suggest a park I haven't visited yet that matches my style",
  },
  {
    id: 'personalized-weekend',
    icon: 'calendar',
    capability: 'itinerary',
    text: 'Plan a weekend trip based on what I usually enjoy',
  },
  {
    id: 'personalized-saved-trips',
    icon: 'compare',
    capability: 'recommendation',
    text: 'Which park should I plan next based on the trips I have saved?',
  },
];

/**
 * Phrases that flip the server's fetch planner into a live-web fetch for
 * inventory / open-now questions. Comparison chips may still request web
 * through other planner signals; those are intentional.
 */
export const LIVE_DATA_PROMPT_PATTERNS = [
  /\bright now\b/i,
  /\btoday\b/i,
  /\bthis (?:week|weekend|month|season)\b/i,
  /\bcurrent(?:ly)?\b/i,
  /\bopen\b/i,
  /\bclos(?:ed|ure|ures)\b/i,
  /\bhotels?\b/i,
  /\blodging\b/i,
  /\bwhere (?:should|can) (?:we|i) stay\b/i,
  /\brestaurants?\b/i,
  /\bwhere to eat\b/i,
  /\btrending\b/i,
  /\bweather\b/i,
  /\bforecast\b/i,
  /\bunder \$?\d/i,
];

/** True when a prompt would pull the demo into live-web territory. */
export function promptRequestsLiveData(text) {
  const value = String(text || '');
  return LIVE_DATA_PROMPT_PATTERNS.some((pattern) => pattern.test(value));
}
