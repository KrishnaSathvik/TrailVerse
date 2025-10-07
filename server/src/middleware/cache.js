const NodeCache = require('node-cache');

// Create cache instance
const cache = new NodeCache({
  stdTTL: 300, // 5 minutes default
  checkperiod: 60 // Check for expired keys every 60 seconds
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

    // Override res.json
    res.json = (body) => {
      cache.set(key, body, duration);
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
