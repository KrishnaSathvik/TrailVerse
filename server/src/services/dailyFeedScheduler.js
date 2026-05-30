const { generateAndSaveDailyFeed } = require('../controllers/dailyFeedController');
const DailyFeed = require('../models/DailyFeed');
const {
  FEED_TIMEZONE,
  FEED_GENERATION_HOUR,
  getFeedDateKey,
  isPastFeedWindowStart,
  isScheduledGenerationMinute,
  shouldGenerateFeed,
} = require('../utils/dailyFeedDate');

let generating = false;
let _intervalId = null;
let _lastScheduledFeedDate = null;

/**
 * Generate today's feed when the 7 AM Chicago window opens (or on startup catch-up).
 */
const ensureTodaysFeed = async ({ force = false, reason = 'scheduler' } = {}) => {
  if (generating) {
    console.log('🌅 Daily feed generation already in progress, skipping');
    return;
  }

  const feedDate = getFeedDateKey();
  const existing = await DailyFeed.findOne({ date: feedDate, isShared: true });

  if (!shouldGenerateFeed({ feedDoc: existing, feedDate, force })) {
    return;
  }

  generating = true;
  try {
    console.log(`🌅 Generating daily feed (${reason}) for ${feedDate} @ ${FEED_GENERATION_HOUR}:00 ${FEED_TIMEZONE}…`);
    const feed = await generateAndSaveDailyFeed({ force: true, feedDate });
    console.log(`🌅 Daily feed ready — ${feed?.parkOfDay?.name || 'unknown park'} (${feedDate})`);
    _lastScheduledFeedDate = feedDate;
  } catch (error) {
    console.error('❌ Daily feed generation failed:', error.message);
  } finally {
    generating = false;
  }
};

const tick = async () => {
  if (!isScheduledGenerationMinute()) {
    return;
  }

  const feedDate = getFeedDateKey();
  if (_lastScheduledFeedDate === feedDate) {
    return;
  }

  await ensureTodaysFeed({ force: true, reason: '7am CST window' });
};

/**
 * Start the daily feed scheduler.
 * - Runs at 7:00 AM America/Chicago every day (not UTC midnight).
 * - On startup, backfills if today's 7 AM generation was missed.
 */
const startDailyFeedScheduler = () => {
  console.log(`🌅 Starting daily feed scheduler (${FEED_GENERATION_HOUR}:00 AM ${FEED_TIMEZONE} daily)…`);

  setTimeout(async () => {
    if (isPastFeedWindowStart()) {
      await ensureTodaysFeed({ force: false, reason: 'startup catch-up' });
    } else {
      console.log(`🌅 Before ${FEED_GENERATION_HOUR}:00 ${FEED_TIMEZONE} — serving previous feed until today's run`);
    }
  }, 5000);

  _intervalId = setInterval(() => {
    tick().catch((error) => {
      console.error('❌ Daily feed scheduler tick failed:', error.message);
    });
  }, 60 * 1000);

  console.log(`✅ Daily feed scheduler started (fires at ${FEED_GENERATION_HOUR}:00 AM ${FEED_TIMEZONE})`);
};

const stopDailyFeedScheduler = () => {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
    console.log('🛑 Daily feed scheduler stopped');
  }
};

module.exports = { startDailyFeedScheduler, stopDailyFeedScheduler, ensureTodaysFeed };
