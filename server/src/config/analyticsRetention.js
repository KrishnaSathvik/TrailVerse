/** Raw analytics retention. Live TTL changes require the separately approved migration. */
const ANALYTICS_RETENTION_DAYS = 30;
const ANALYTICS_RETENTION_SECONDS = ANALYTICS_RETENTION_DAYS * 24 * 60 * 60;

/** High-volume api_call rows expire sooner to control Atlas storage. */
const API_CALL_RETENTION_DAYS = 7;
const API_CALL_RETENTION_SECONDS = API_CALL_RETENTION_DAYS * 24 * 60 * 60;

/** Event types that use the general retention window (everything except api_call). */
const NON_API_CALL_EVENT_TYPES = [
  'page_view', 'user_action', 'search', 'download',
  'park_view', 'park_save', 'park_visit', 'review_create', 'review_helpful',
  'blog_view', 'blog_share', 'event_register', 'event_view',
  'ai_chat', 'conversation_create', 'image_upload', 'user_signup',
  'user_login', 'user_logout', 'error', 'performance', 'mcp_tool_call',
  'crowd_calendar_view',
];

// Preserve the existing production TTL scope; adding event types is a migration.
const GENERAL_TTL_EVENT_TYPES = NON_API_CALL_EVENT_TYPES.filter(type => type !== 'crowd_calendar_view');

module.exports = {
  GENERAL_TTL_EVENT_TYPES,
  ANALYTICS_RETENTION_DAYS,
  ANALYTICS_RETENTION_SECONDS,
  API_CALL_RETENTION_DAYS,
  API_CALL_RETENTION_SECONDS,
  NON_API_CALL_EVENT_TYPES,
};
