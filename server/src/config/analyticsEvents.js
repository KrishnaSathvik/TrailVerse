/**
 * Canonical product analytics.
 * Dashboard queries and client emitters must agree on these names.
 *
 * `eventType` is the Mongo Analytics.enum value.
 * `vercelName` is the Vercel/GA custom event.
 * `action` is metadata.action when eventType is user_action.
 */
const CANONICAL_EVENTS = {
  page_view: { eventType: 'page_view', eventCategory: 'content' },
  park_view: { eventType: 'park_view', eventCategory: 'content' },
  signup_success: { eventType: 'user_signup', eventCategory: 'business', vercelName: 'signup_success' },
  login_success: { eventType: 'user_login', eventCategory: 'business', vercelName: 'login_success' },
  trailie_session_start: { eventType: 'user_action', eventCategory: 'engagement', action: 'trailie_session_start' },
  trailie_message: { eventType: 'ai_chat', eventCategory: 'engagement', vercelName: 'trailie_message' },
  trip_created: { eventType: 'conversation_create', eventCategory: 'engagement' },
  trip_shared: { eventType: 'user_action', eventCategory: 'engagement', action: 'trip_shared' },
  pdf_export: { eventType: 'user_action', eventCategory: 'engagement', action: 'pdf_export' },
  voice_session_start: { eventType: 'user_action', eventCategory: 'engagement', action: 'voice_session_start' },
  compare_view: { eventType: 'user_action', eventCategory: 'engagement', action: 'compare_view' },
  map_view: { eventType: 'user_action', eventCategory: 'engagement', action: 'map_view' },
  crowd_calendar_view: { eventType: 'crowd_calendar_view', eventCategory: 'content' },
  where_next_pick: { eventType: 'user_action', eventCategory: 'engagement', action: 'where_next_destination_selected' },
};

/** Legacy aliases the dashboard still accepts. */
const EVENT_ALIASES = {
  user_signup: 'signup_success',
  user_login: 'login_success',
  auth_signup_success: 'signup_success',
  auth_login_success: 'login_success',
  conversation_create: 'trip_created',
  ai_chat: 'trailie_message',
  plan_ai_session_start: 'trailie_session_start',
  trip_share_created: 'trip_shared',
};

function resolveCanonicalName(name) {
  if (!name) return null;
  if (CANONICAL_EVENTS[name]) return name;
  return EVENT_ALIASES[name] || null;
}

module.exports = { CANONICAL_EVENTS, EVENT_ALIASES, resolveCanonicalName };
