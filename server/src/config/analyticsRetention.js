/** How long Analytics events are kept (matches admin dashboard max period). */
const ANALYTICS_RETENTION_DAYS = 90;
const ANALYTICS_RETENTION_SECONDS = ANALYTICS_RETENTION_DAYS * 24 * 60 * 60;

module.exports = {
  ANALYTICS_RETENTION_DAYS,
  ANALYTICS_RETENTION_SECONDS,
};
