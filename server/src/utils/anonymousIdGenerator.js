const crypto = require('crypto');

/**
 * Generate a consistent anonymous ID based on IP address and browser fingerprint
 * This ensures the same user gets the same ID across different tabs/devices
 * @param {string} ipAddress - User's IP address
 * @param {string} userAgent - User's browser user agent
 * @param {string} browserFingerprint - Additional browser fingerprint data
 * @returns {string} - Unique anonymous ID
 */
function generateAnonymousId(ipAddress, userAgent, browserFingerprint = '') {
  // Combine all identifying information
  const combinedData = `${ipAddress}-${userAgent}-${browserFingerprint}`;
  
  // Create a hash of the combined data
  const hash = crypto.createHash('sha256').update(combinedData).digest('hex');
  
  // Take first 16 characters for a shorter, more manageable ID
  const shortHash = hash.substring(0, 16);
  
  // Add a deterministic session identifier based on the hash
  // This ensures the same user gets the same ID across requests
  const sessionId = hash.substring(16, 22);
  
  return `anon_${shortHash}_${sessionId}`;
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
 * Generate anonymous ID from request
 * @param {Object} req - Express request object
 * @returns {Object} - Anonymous ID and related data
 */
function generateAnonymousIdFromRequest(req) {
  const ipAddress = getClientIP(req);
  const userAgent = req.headers['user-agent'] || '';
  const browserFingerprint = generateBrowserFingerprint(req);
  
  const anonymousId = generateAnonymousId(ipAddress, userAgent, browserFingerprint);
  
  return {
    anonymousId,
    ipAddress,
    userAgent,
    browserFingerprint
  };
}

module.exports = {
  generateAnonymousId,
  getClientIP,
  generateBrowserFingerprint,
  generateAnonymousIdFromRequest
};
