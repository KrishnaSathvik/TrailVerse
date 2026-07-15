const NodeCache = require('node-cache');
const { safeCacheSet } = require('../utils/safeCacheSet');

// Create cache instance
const cache = new NodeCache({
  stdTTL: 300, // 5 minutes default
  checkperiod: 60, // Check for expired keys every 60 seconds
  maxKeys: 1000 // Headroom for park/detail traffic on Standard
});

// Cache middleware
const cacheMiddleware = (duration = 300) => {
  return (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const key = `cache:${req.originalUrl}`;
    const cachedResponse = cache.get(key);

    if (cachedResponse) {
      return res.json(cachedResponse);
    }

    // Store original res.json
    const originalJson = res.json.bind(res);

    // Override res.json — never cache error / failure payloads (they replay as HTTP 200)
    res.json = (body) => {
      const statusCode = res.statusCode || 200;
      const isFailure =
        statusCode >= 400 ||
        (body && typeof body === 'object' && body.success === false);

      if (!isFailure) {
        safeCacheSet(cache, key, body, duration);
      }
      return originalJson(body);
    };

    next();
  };
};

// Clear cache function
const clearCache = (pattern) => {
  if (pattern) {
    const keys = cache.keys();
    keys.forEach(key => {
      if (key.includes(pattern)) {
        cache.del(key);
      }
    });
  } else {
    cache.flushAll();
  }
};

module.exports = { cacheMiddleware, clearCache };
