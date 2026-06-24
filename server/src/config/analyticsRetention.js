/** How long most Analytics events are kept (matches admin dashboard max period). */
const ANALYTICS_RETENTION_DAYS = 90;
const ANALYTICS_RETENTION_SECONDS = ANALYTICS_RETENTION_DAYS * 24 * 60 * 60;

/** High-volume api_call rows expire sooner to control Atlas storage. */
const API_CALL_RETENTION_DAYS = 7;
const API_CALL_RETENTION_SECONDS = API_CALL_RETENTION_DAYS * 24 * 60 * 60;

/** Event types that use the 90-day retention window (everything except api_call). */
const NON_API_CALL_EVENT_TYPES = [
  'page_view', 'user_action', 'search', 'download',
  'park_view', 'park_save', 'park_visit', 'review_create', 'review_helpful',
  'blog_view', 'blog_share', 'event_register', 'event_view',
  'ai_chat', 'conversation_create', 'image_upload', 'user_signup',
  'user_login', 'user_logout', 'error', 'performance', 'mcp_tool_call',
];

module.exports = {
  ANALYTICS_RETENTION_DAYS,
  ANALYTICS_RETENTION_SECONDS,
  API_CALL_RETENTION_DAYS,
  API_CALL_RETENTION_SECONDS,
  NON_API_CALL_EVENT_TYPES,
};
