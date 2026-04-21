const { generateAndSaveDailyFeed } = require('../controllers/dailyFeedController');

let generating = false;
let _intervalId = null;

/**
 * Attempt to generate today's daily feed if it doesn't already exist.
 * Guards against concurrent runs.
 */
const ensureTodaysFeed = async () => {
  if (generating) {
    console.log('🌅 Daily feed generation already in progress, skipping');
    return;
  }

  generating = true;
  try {
    const feed = await generateAndSaveDailyFeed();
    console.log(`🌅 Daily feed ready — ${feed?.parkOfDay?.name || 'unknown park'}`);
  } catch (error) {
    console.error('❌ Daily feed generation failed:', error.message);
  } finally {
    generating = false;
  }
};

/**
 * Start the daily feed scheduler.
 * - Generates immediately on startup (if not already cached for today).
 * - Re-checks every hour to handle day transitions.
 */
const startDailyFeedScheduler = () => {
  console.log('🌅 Starting daily feed scheduler…');

  // Generate after a short delay so the server finishes booting first
  setTimeout(() => {
    ensureTodaysFeed();
  }, 5000);

  // Re-check every minute (catches midnight day transitions quickly)
  _intervalId = setInterval(() => {
    ensureTodaysFeed();
  }, 60 * 1000);

  console.log('✅ Daily feed scheduler started (checks every minute)');
};

const stopDailyFeedScheduler = () => {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
    console.log('🛑 Daily feed scheduler stopped');
  }
};

module.exports = { startDailyFeedScheduler, stopDailyFeedScheduler, ensureTodaysFeed };
