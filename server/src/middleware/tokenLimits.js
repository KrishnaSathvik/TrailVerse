// Token usage accounting for authenticated Trailie users.
//
// Product decision (2026-10-06, reaffirmed 2026-10-26): signed-in travelers
// have no daily token cap. A single legitimate planning turn can exceed the
// old 5,000-token allowance, so usage is recorded for observability only and
// is never used to refuse a request. Guest limits live in
// config/anonymousChatLimits.js + utils/guestTurnQuota.js; request-rate
// protection lives in app.js (express-rate-limit).

/**
 * Middleware to record token usage after successful legacy AI responses.
 * Accounting only — never blocks or alters the response.
 */
exports.trackTokenUsage = async (req, res, next) => {
  // Store original json method
  const originalJson = res.json;

  // Override json method to capture token usage
  res.json = function(data) {
    // Only track usage for successful AI responses with token data
    if (res.statusCode === 200 &&
        data &&
        data.success !== false &&
        data.usage &&
        req.user) {

      // Track token usage asynchronously (don't block response)
      req.user.addTokenUsage(
        data.usage.inputTokens || 0,
        data.usage.outputTokens || 0
      ).catch(error => {
        console.error('Error tracking token usage:', error);
      });
    }

    // Call original json method
    return originalJson.call(this, data);
  };

  next();
};

/**
 * Recorded token usage for the signed-in user (observability; no allowance).
 */
exports.getTokenUsage = async (req, res) => {
  try {
    const usage = req.user?.tokenUsage || {};
    const sameDay = usage.lastResetDate
      && new Date(usage.lastResetDate).toDateString() === new Date().toDateString();
    res.json({
      success: true,
      tokenUsage: {
        dailyTokensUsed: sameDay ? Number(usage.dailyTokensUsed || 0) : 0,
        totalTokensUsed: Number(usage.totalTokensUsed || 0),
        lastResetDate: usage.lastResetDate || null,
      }
    });
  } catch (error) {
    console.error('Get token usage error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get token usage information'
    });
  }
};

module.exports = {
  trackTokenUsage: exports.trackTokenUsage,
  getTokenUsage: exports.getTokenUsage,
};
