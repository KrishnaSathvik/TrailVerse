const { rollupDay, rollupMonth, utcDayBounds } = require('./analyticsSnapshotService');

const HOUR_MS = 60 * 60 * 1000;
let _intervalId = null;

async function tick() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await rollupDay(yesterday);
  await rollupMonth(yesterday);
}

const startAnalyticsSnapshotScheduler = () => {
  if (_intervalId) return;
  tick().catch((error) => {
    console.error('Analytics snapshot scheduler initial rollup failed:', error.message);
  });
  _intervalId = setInterval(() => {
    tick().catch((error) => {
      console.error('Analytics snapshot scheduler tick failed:', error.message);
    });
  }, HOUR_MS);
  console.log('Analytics snapshot scheduler started (hourly; durable day/month rows)');
};

const stopAnalyticsSnapshotScheduler = () => {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
};

module.exports = {
  startAnalyticsSnapshotScheduler,
  stopAnalyticsSnapshotScheduler,
  tick,
  utcDayBounds,
};
