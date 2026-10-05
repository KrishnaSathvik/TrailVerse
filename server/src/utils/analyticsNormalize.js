/**
 * Promote common metadata fields to top-level Analytics schema fields
 * so aggregations (popular parks, errors, API perf) match client payloads.
 */
const VALID_EVENT_CATEGORIES = new Set(['user', 'content', 'engagement', 'technical', 'business']);
const { classifyBot } = require('./botClassifier');

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
    ['browserId', 'browserId'],
    ['userType', 'userType'],
    ['ctaId', 'ctaId'],
    ['source', 'source'],
  ];

  for (const [key, topKey] of pairs) {
    if ((doc[topKey] == null || doc[topKey] === '') && metadata[key] != null && metadata[key] !== '') {
      doc[topKey] = metadata[key];
    }
  }

  if (!doc.pageUrl && metadata.page) {
    doc.pageUrl = metadata.page;
  }
  if (!doc.pageUrl && metadata.path) {
    doc.pageUrl = metadata.path;
  }
  if (!doc.pageUrl && doc.path) {
    doc.pageUrl = doc.path;
  }
  if (!doc.referrer && metadata.referrer) {
    doc.referrer = metadata.referrer;
  }

  return doc;
}

function normalizeClientEvent(event, reqContext) {
  const { sessionId, userId, ipAddress, userAgent, browserId } = reqContext;
  const eventCategory = VALID_EVENT_CATEGORIES.has(event.eventCategory)
    ? event.eventCategory
    : 'content';

  const bot = classifyBot(userAgent || event.userAgent);
  const resolvedUserId = event.userId || userId || null;
  const resolvedUserType = resolvedUserId
    ? 'authenticated'
    : (event.userType === 'authenticated' ? 'authenticated' : 'anonymous');

  const doc = hoistAnalyticsFields({
    ...event,
    eventCategory,
    sessionId: event.sessionId || sessionId,
    browserId: event.browserId || browserId || event.metadata?.browserId || null,
    userId: resolvedUserId,
    userType: resolvedUserType,
    isBot: bot.isBot,
    ipAddress: ipAddress || event.ipAddress,
    userAgent: userAgent || event.userAgent,
    timestamp: new Date(event.timestamp || Date.now()),
  });

  if (bot.isBot) {
    doc.metadata = { ...doc.metadata, botName: bot.botName };
  }

  if (doc.device && !doc.device.type) {
    delete doc.device;
  }

  delete doc.url;
  delete doc.path;
  return doc;
}

module.exports = { hoistAnalyticsFields, normalizeClientEvent };
