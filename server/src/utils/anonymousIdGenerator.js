const crypto = require('crypto');

const GUEST_SESSION_ID_PREFIX = 'guest_v2_';
const GUEST_SESSION_ID_MAX_LENGTH = GUEST_SESSION_ID_PREFIX.length + 36;
const GUEST_SESSION_ID_PATTERN = /^guest_v2_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEGACY_GUEST_SESSION_ID_PATTERN = /^anon_[0-9a-f]{16}_[0-9a-f]{6}$/i;

/**
 * Guest IDs are bearer secrets for anonymous Trailie state. Their authority
 * comes only from cryptographic randomness, never from network/browser traits.
 */
function mintGuestSessionId() {
  return `${GUEST_SESSION_ID_PREFIX}${crypto.randomUUID()}`;
}

function isValidGuestSessionId(value) {
  return (
    typeof value === 'string' &&
    value.length <= GUEST_SESSION_ID_MAX_LENGTH &&
    GUEST_SESSION_ID_PATTERN.test(value)
  );
}

function isLegacyGuestSessionId(value) {
  return typeof value === 'string' && LEGACY_GUEST_SESSION_ID_PATTERN.test(value);
}

/**
 * Extract IP address from request
 * @param {Object} req - Express request object
 * @returns {string} - IP address
 */
function getClientIP(req) {
  return req.ip || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
         req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         'unknown';
}

/**
 * Generate browser fingerprint from request headers
 * @param {Object} req - Express request object
 * @returns {string} - Browser fingerprint
 */
function generateBrowserFingerprint(req) {
  const headers = req.headers;
  
  // Collect fingerprint data
  const fingerprintData = {
    userAgent: headers['user-agent'] || '',
    acceptLanguage: headers['accept-language'] || '',
    acceptEncoding: headers['accept-encoding'] || '',
    accept: headers['accept'] || '',
    connection: headers['connection'] || '',
    upgradeInsecureRequests: headers['upgrade-insecure-requests'] || '',
    secFetchSite: headers['sec-fetch-site'] || '',
    secFetchMode: headers['sec-fetch-mode'] || '',
    secFetchUser: headers['sec-fetch-user'] || '',
    secFetchDest: headers['sec-fetch-dest'] || ''
  };
  
  // Create a consistent string from the fingerprint data
  const fingerprintString = Object.values(fingerprintData).join('|');
  
  // Hash the fingerprint string for consistency
  return crypto.createHash('md5').update(fingerprintString).digest('hex');
}

/**
 * Collect request traits for operational metadata only. None of these fields
 * may select a conversation, quota ledger, pending turn, or active trip.
 * @param {Object} req - Express request object
 * @returns {Object} - Anonymous ID and related data
 */
function getAnonymousRequestMetadata(req) {
  const ipAddress = getClientIP(req);
  const userAgent = req.headers['user-agent'] || '';
  const browserFingerprint = generateBrowserFingerprint(req);

  return {
    ipAddress,
    userAgent,
    browserFingerprint
  };
}

/**
 * Accept one valid V2 bearer ID or mint a fresh isolated identity. Missing,
 * malformed, oversized, and legacy deterministic IDs all fail closed to a new
 * random session; request fingerprints remain metadata only.
 */
function resolveAnonymousRequestIdentity(req, clientAnonymousId) {
  const acceptedClientId = isValidGuestSessionId(clientAnonymousId);
  return {
    ...getAnonymousRequestMetadata(req),
    anonymousId: acceptedClientId ? clientAnonymousId : mintGuestSessionId(),
    acceptedClientId,
  };
}

module.exports = {
  GUEST_SESSION_ID_MAX_LENGTH,
  GUEST_SESSION_ID_PREFIX,
  getClientIP,
  generateBrowserFingerprint,
  getAnonymousRequestMetadata,
  isLegacyGuestSessionId,
  isValidGuestSessionId,
  mintGuestSessionId,
  resolveAnonymousRequestIdentity,
};
