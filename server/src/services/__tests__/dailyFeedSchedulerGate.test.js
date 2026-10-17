const { isDailyFeedSchedulerEnabled } = require('../dailyFeedScheduler');

/**
 * Dev credit hygiene (2026-09-01): the daily-feed scheduler fires paid OpenAI
 * calls within seconds of every backend boot ("startup catch-up"). A local
 * dev boot must never make paid model calls just because someone started the
 * server. Production behavior is unchanged; development requires an explicit
 * opt-in.
 */

describe('isDailyFeedSchedulerEnabled', () => {
  it('production: enabled, flag or no flag (unchanged behavior)', () => {
    expect(isDailyFeedSchedulerEnabled({ NODE_ENV: 'production' })).toBe(true);
    expect(isDailyFeedSchedulerEnabled({ NODE_ENV: 'production', DAILY_FEED_SCHEDULER_ENABLED: 'false' })).toBe(true);
  });

  it('development: OFF when the flag is absent', () => {
    expect(isDailyFeedSchedulerEnabled({ NODE_ENV: 'development' })).toBe(false);
    expect(isDailyFeedSchedulerEnabled({})).toBe(false);
  });

  it('development: OFF when the flag is anything but the literal string true', () => {
    expect(isDailyFeedSchedulerEnabled({ DAILY_FEED_SCHEDULER_ENABLED: 'false' })).toBe(false);
    expect(isDailyFeedSchedulerEnabled({ DAILY_FEED_SCHEDULER_ENABLED: '1' })).toBe(false);
    expect(isDailyFeedSchedulerEnabled({ DAILY_FEED_SCHEDULER_ENABLED: '' })).toBe(false);
  });

  it('development: ON only with the explicit opt-in', () => {
    expect(isDailyFeedSchedulerEnabled({ DAILY_FEED_SCHEDULER_ENABLED: 'true' })).toBe(true);
    expect(isDailyFeedSchedulerEnabled({ NODE_ENV: 'test', DAILY_FEED_SCHEDULER_ENABLED: 'true' })).toBe(true);
  });
});
