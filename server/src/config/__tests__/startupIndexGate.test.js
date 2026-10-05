const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Execute the real startup module with inert IO/services. No env loading, model
// providers, sockets, schedulers or database writes occur in this ordering test.
function boot(connectDB) {
  const listen = jest.fn();
  const startScheduler = jest.fn();
  const exit = jest.fn();
  const modules = {
    './src/config/validateEnv': () => {},
    './src/config/trailieEvidenceRefreshSecret': { assertTrailieEvidenceRefreshConfigured() {} },
    './src/services/npsService': { assertNpsConfigured() {} },
    './src/app': { server: { listen }, wsService: {} },
    './src/config/database': connectDB,
    './src/services/schedulerService': { startScheduler },
    './src/services/dailyFeedScheduler': { startDailyFeedScheduler: jest.fn() },
    './src/services/analyticsSnapshotScheduler': { startAnalyticsSnapshotScheduler: jest.fn() },
    './src/config/trailieReviewConfig': { getTrailieReviewConfig: () => ({ workerEnabled: false }) },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../../server.js'), 'utf8'), {
    require: (name) => modules[name] || {},
    process: { env: { NODE_ENV: 'production' }, on() {}, exit },
    console: { log() {}, warn() {}, error() {} },
    setImmediate: jest.fn(), setTimeout: jest.fn(), global: {},
  });
  return { listen, startScheduler, exit };
}

test('HTTP listener and schedulers wait for database/index readiness', async () => {
  let ready;
  const state = boot(() => new Promise((resolve) => { ready = resolve; }));
  expect(state.listen).not.toHaveBeenCalled();
  expect(state.startScheduler).not.toHaveBeenCalled();
  ready();
  await new Promise(setImmediate);
  expect(state.listen).toHaveBeenCalledTimes(1);
  expect(state.startScheduler).toHaveBeenCalledTimes(1);
  expect(state.exit).not.toHaveBeenCalled();
});

test('missing/conflicting indexes prevent listening and scheduler startup', async () => {
  const state = boot(() => Promise.reject(new Error('APPLICATION_INDEXES_NOT_READY')));
  await new Promise(setImmediate);
  expect(state.listen).not.toHaveBeenCalled();
  expect(state.startScheduler).not.toHaveBeenCalled();
  expect(state.exit).toHaveBeenCalledWith(1);
});
