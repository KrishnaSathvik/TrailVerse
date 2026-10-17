const NodeCache = require('node-cache');
const { safeCacheSet } = require('../utils/safeCacheSet');

// Create cache instance
const cache = new NodeCache({
  stdTTL: 300, // 5 minutes default
  checkperiod: 60, // Check for expired keys every 60 seconds
  maxKeys: 1000 // Headroom for park/detail traffic on Standard
});

// Only public, anonymous responses can enter this shared process cache.
const cacheMiddleware = (duration = 300, { cacheControl } = {}) => {
  return (req, res, next) => {
    if (req.method !== 'GET') return next();
    const privateRequest = Boolean(req.user || req.headers?.authorization || req.headers?.cookie);
    const originalJson = res.json.bind(res);
    if (privateRequest) {
      res.set('Cache-Control', 'private, no-store');
      res.json = body => {
        res.set('Cache-Control', 'private, no-store');
        return originalJson(body);
      };
      return next();
    }

    const key = `cache:${req.originalUrl}`;
    const cached = cache.get(key);
    if (cached) {
      if (cached.cacheControl) res.set('Cache-Control', cached.cacheControl);
      res.set('Age', String(Math.max(0, Math.floor((Date.now() - cached.storedAt) / 1000))));
      return originalJson(cached.body);
    }

    res.json = body => {
      const status = res.statusCode || 200;
      if (status !== 200 || body?.success === false) {
        res.set('Cache-Control', 'no-store');
        return originalJson(body);
      }
      const policy = res.get('Cache-Control') || cacheControl;
      const vary = String(res.get('Vary') || '').toLowerCase().split(',').map(v => v.trim()).filter(Boolean);
      const unsafe = res.get('Set-Cookie') || /private|no-store|no-cache/i.test(policy || '') ||
        vary.some(v => !['origin', 'accept-encoding'].includes(v));
      if (res.get('Set-Cookie') || vary.some(v => !['origin', 'accept-encoding'].includes(v))) {
        res.set('Cache-Control', 'private, no-store');
      }
      if (!unsafe) {
        if (policy) res.set('Cache-Control', policy);
        safeCacheSet(cache, key, { body, cacheControl: policy, storedAt: Date.now() }, duration);
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
