const crypto = require('crypto');
const { randomUUID } = crypto;
const Analytics = require('../models/Analytics');

function sessionIdForRequest(req) {
  if (req.session?.sessionId) return req.session.sessionId;
  const header =
    req.get('x-session-id') ||
    req.get('x-trailverse-session') ||
    req.get('x-anonymous-id');
  if (header) return String(header).slice(0, 128);
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  return `search-${crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16)}`;
}

/**
 * Fire-and-forget park search analytics (drives admin /api/analytics/search).
 * @param {import('express').Request} req
 * @param {{
 *   query?: string|null,
 *   state?: string|null,
 *   activity?: string|null,
 *   parks: import('../catalog/canonicalPark').CanonicalPark[],
 * }} payload
 */
/**
 * @returns {string|null} searchId for funnel tracking (search → click → park view)
 */
function logParkSearch(req, { query, state, activity, parks, source }) {
  const searchTerm = query || activity || state || null;
  if (!searchTerm) return null;

  const searchId = randomUUID();
  const topParkIds = parks.slice(0, 10).map((p) => p.id || p.parkCode);
  const resolvedSource =
    source || (req?.isTrustedMcp ? 'mcp' : 'api');
  const metadata = {
    searchId,
    searchTerm,
    query: query || null,
    state: state || null,
    activity: activity || null,
    resultCount: parks.length,
    topParkIds,
    searchType: 'park_catalog',
    source: resolvedSource,
  };

  Analytics.create({
    eventType: 'search',
    eventCategory: 'engagement',
    sessionId: sessionIdForRequest(req),
    userId: req.user?._id || null,
    userAgent: req.get('User-Agent'),
    ipAddress: req.ip,
    metadata,
    parkCode: topParkIds[0] || null,
  }).catch((err) => {
    console.warn('[parkSearchAnalytics] log failed:', err.message);
  });

  return searchId;
}

function logParkSearchClick(req, { searchId, searchTerm, parkCode, parkName, surface }) {
  if (!parkCode) return;

  Analytics.create({
    eventType: 'user_action',
    eventCategory: 'engagement',
    sessionId: sessionIdForRequest(req),
    userId: req.user?._id || null,
    userAgent: req.get('User-Agent'),
    ipAddress: req.ip,
    parkCode,
    metadata: {
      action: 'search_result_click',
      searchId: searchId || null,
      searchTerm: searchTerm || null,
      parkCode,
      parkName: parkName || null,
      surface: surface || 'unknown',
      source: req.isTrustedMcp ? 'mcp' : 'api',
    },
  }).catch((err) => {
    console.warn('[parkSearchAnalytics] click log failed:', err.message);
  });
}

module.exports = { logParkSearch, logParkSearchClick };
