// Marks requests from the trusted MCP server so the rate limiter can skip them.
// Must be registered BEFORE the rate limiter in app.js.

const crypto = require('crypto');

const HEADER = 'x-trailverse-mcp-key';

module.exports = function mcpBypass(req, res, next) {
  const presented = req.headers[HEADER];
  const expected = process.env.MCP_BYPASS_KEY;

  if (expected && presented && presented.length === expected.length) {
    const presentedBuf = Buffer.from(presented, 'utf8');
    const expectedBuf = Buffer.from(expected, 'utf8');

    if (crypto.timingSafeEqual(presentedBuf, expectedBuf)) {
      req.isTrustedMcp = true;
      req.skipAnonymousRateLimit = true;
    }
  }
  next();
};
