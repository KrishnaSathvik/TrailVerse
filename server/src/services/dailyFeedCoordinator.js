// One coordinator per process, shared by HTTP and scheduler. No provider retry
// is triggered by a persistence failure: retain the draft and retry only saves.
function createDailyFeedCoordinator({ read, generate, save, isFresh, now = Date.now,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  baseBackoffMs = 60000, maxBackoffMs = 3600000 } = {}) {
  let inFlight = null;
  let lastFeed = null;
  let lastGeneratedDate = null;
  let pending = null;
  let failures = 0;
  let retryAt = 0;

  const unavailable = () => Object.assign(new Error('Daily feed temporarily unavailable'), {
    code: 'DAILY_FEED_UNAVAILABLE', retryAfter: Math.max(1, Math.ceil((retryAt - now()) / 1000)),
  });
  const fallback = date => {
    // Never present yesterday's weather/astronomy as today's briefing.
    if (lastFeed?.date === date) return lastFeed;
    throw unavailable();
  };
  const backoff = () => {
    failures = Math.min(failures + 1, 10);
    retryAt = now() + Math.min(maxBackoffMs, baseBackoffMs * 2 ** (failures - 1));
  };

  async function persistDraft() {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const saved = await save(pending);
        lastFeed = saved || pending;
        pending = null;
        failures = 0;
        retryAt = 0;
        return;
      } catch (error) {
        // Quota/auth/validation failures won't heal in a subsecond retry.
        const transient = /Network|ServerSelection|Timeout/.test(error?.name || '') ||
          [6, 7, 89, 91, 11600, 11602].includes(error?.code);
        if (!transient || attempt === 2) throw error;
        await sleep(250 * 2 ** attempt);
      }
    }
  }

  async function run({ feedDate, force = false }) {
    if (now() < retryAt) return fallback(feedDate);
    try {
      // Even across a date rollover, repair the failed save before new AI work.
      if (pending) await persistDraft();
      if (lastGeneratedDate === feedDate && lastFeed?.date === feedDate) return lastFeed;
      if (!force && lastFeed?.date === feedDate && isFresh(lastFeed, feedDate)) return lastFeed;
      const existing = await read(feedDate); // A failed DB read never starts AI.
      if (existing) lastFeed = existing;
      if (!force && isFresh(existing, feedDate)) {
        failures = 0;
        retryAt = 0;
        return existing;
      }
      pending = await generate(feedDate);
      lastGeneratedDate = feedDate;
      lastFeed = pending;
      await persistDraft();
      failures = 0;
      retryAt = 0;
      return lastFeed;
    } catch (error) {
      backoff();
      console.warn('[daily-feed] operation failed; retries paused', {
        code: typeof error?.code === 'number' ? error.code : 'unavailable',
        retryAt: new Date(retryAt).toISOString(),
      });
      return fallback(feedDate);
    }
  }

  return {
    async get(options) {
      if (inFlight) {
        await inFlight.catch(() => {});
        return fallback(options.feedDate);
      }
      inFlight = run(options);
      try { return await inFlight; } finally { inFlight = null; }
    },
    status() { return { persistencePending: Boolean(pending), retryAt }; },
  };
}

module.exports = { createDailyFeedCoordinator };
