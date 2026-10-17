const User = require('../models/User');

// Daily token limits
const DAILY_TOKEN_LIMITS = {
  user: 5000,    // 5,000 tokens per day for regular users
  admin: 50000   // 50,000 tokens per day for admin users
};

// Explicit local demo allowance; never changes deployed product policy.
function dailyTokenLimitFor(user, env = process.env) {
  const standard = DAILY_TOKEN_LIMITS[user?.role] || DAILY_TOKEN_LIMITS.user;
  if (env.NODE_ENV !== 'development' || !env.TRAILIE_DAILY_TOKEN_LIMIT_EMAIL ||
      user?.email?.toLowerCase() !== env.TRAILIE_DAILY_TOKEN_LIMIT_EMAIL.toLowerCase()) return standard;
  try {
    const target = new URL(env.MONGODB_URI);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) return standard;
  } catch { return standard; }
  const override = Number(env.TRAILIE_DAILY_TOKEN_LIMIT);
  return Number.isSafeInteger(override) && override > 0 ? override : standard;
}

/**
 * Middleware to check if user has exceeded their daily token limit
 */
exports.checkTokenLimit = async (req, res, next) => {
  try {
    // Skip token limit check for admin users
    if (req.user && req.user.role === 'admin') {
      return next();
    }

    // Get user's token limit based on role
    const dailyLimit = dailyTokenLimitFor(req.user);

    // Check if user has exceeded their daily limit
    if (req.user && await req.user.hasExceededTokenLimit(dailyLimit)) {
      const remainingTokens = await req.user.getRemainingDailyTokens(dailyLimit);
      
      return res.status(429).json({
        success: false,
        error: 'Daily token limit exceeded',
        details: {
          dailyLimit,
          tokensUsed: req.user.tokenUsage.dailyTokensUsed,
          remainingTokens,
          resetTime: 'Daily limits reset at midnight'
        }
      });
    }

    next();
  } catch (error) {
    console.error('Token limit check error:', error);
    // Don't block the request if there's an error checking limits
    next();
  }
};

/**
 * Middleware to track token usage after successful API calls
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
 * Get token usage information for a user
 */
exports.getTokenUsage = async (req, res) => {
  try {
    const user = req.user;
    const dailyLimit = dailyTokenLimitFor(user);
    
    const remainingTokens = await user.getRemainingDailyTokens(dailyLimit);
    
    res.json({
      success: true,
      tokenUsage: {
        dailyLimit,
        dailyTokensUsed: user.tokenUsage.dailyTokensUsed,
        remainingTokens,
        totalTokensUsed: user.tokenUsage.totalTokensUsed,
        lastResetDate: user.tokenUsage.lastResetDate,
        resetTime: 'Daily limits reset at midnight'
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
  checkTokenLimit: exports.checkTokenLimit,
  trackTokenUsage: exports.trackTokenUsage,
  getTokenUsage: exports.getTokenUsage,
  DAILY_TOKEN_LIMITS,
  dailyTokenLimitFor
};
