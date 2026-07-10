/**
 * NodeCache throws when maxKeys is reached. Evict the oldest key and retry
 * so weather/crowd/HTTP caches degrade gracefully instead of erroring.
 */
function safeCacheSet(cache, key, value, ttl) {
  try {
    if (ttl === undefined) {
      return cache.set(key, value);
    }
    return cache.set(key, value, ttl);
  } catch (err) {
    if (!/max keys/i.test(err?.message || '')) throw err;
    const keys = cache.keys();
    if (keys.length > 0) {
      cache.del(keys[0]);
    }
    if (ttl === undefined) {
      return cache.set(key, value);
    }
    return cache.set(key, value, ttl);
  }
}

module.exports = { safeCacheSet };
