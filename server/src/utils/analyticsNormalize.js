/**
 * Promote common metadata fields to top-level Analytics schema fields
 * so aggregations (popular parks, errors, API perf) match client payloads.
 */
const VALID_EVENT_CATEGORIES = new Set(['user', 'content', 'engagement', 'technical', 'business']);

function hoistAnalyticsFields(doc) {
  const metadata = doc.metadata && typeof doc.metadata === 'object' ? doc.metadata : {};
  doc.metadata = metadata;

  const pairs = [
    ['parkCode', 'parkCode'],
    ['blogId', 'blogId'],
    ['eventId', 'eventId'],
    ['errorCode', 'errorCode'],
    ['errorMessage', 'errorMessage'],
    ['responseTime', 'responseTime'],
    ['duration', 'duration'],
  ];

  for (const [key, topKey] of pairs) {
    if ((doc[topKey] == null || doc[topKey] === '') && metadata[key] != null && metadata[key] !== '') {
      doc[topKey] = metadata[key];
    }
  }

  if (!doc.pageUrl && metadata.page) {
    doc.pageUrl = metadata.page;
  }
  if (!doc.pageUrl && doc.path) {
    doc.pageUrl = doc.path;
  }

  return doc;
}

function normalizeClientEvent(event, reqContext) {
  const { sessionId, userId, ipAddress, userAgent } = reqContext;
  const eventCategory = VALID_EVENT_CATEGORIES.has(event.eventCategory)
    ? event.eventCategory
    : 'content';

  const doc = hoistAnalyticsFields({
    ...event,
    eventCategory,
    sessionId: event.sessionId || sessionId,
    userId: event.userId || userId,
    ipAddress: ipAddress || event.ipAddress,
    userAgent: userAgent || event.userAgent,
    timestamp: new Date(event.timestamp || Date.now()),
  });

  if (doc.device && !doc.device.type) {
    delete doc.device;
  }

  delete doc.url;
  return doc;
}

module.exports = { hoistAnalyticsFields, normalizeClientEvent };
