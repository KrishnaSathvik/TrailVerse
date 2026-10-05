'use strict';

/**
 * Stage 14.7F6 §18 — an EXPLICIT model-readiness barrier for suites that issue
 * real authenticated writes.
 *
 * `mongoose.connect` resolving does not mean the models are usable. Indexes are
 * built in the background on first model use, and `tripController` LAZILY
 * requires the prose-recovery lease model INSIDE the request path — so the first
 * authenticated write of a process both compiles that model and starts a unique
 * + TTL index build while the request is in flight. Later writes do neither,
 * which is exactly the asymmetry a first-run-only flake needs.
 *
 * Deliberately opt-in rather than global: most suites mock their models, and
 * calling `init()` on a mocked model never resolves.
 */
async function awaitModelReadiness() {
  await Promise.all([
    require('../models/TripPlan').init(),
    require('../models/User').init(),
    require('../models/TrailieProseRecoveryLease').init(),
  ]);
}

module.exports = { awaitModelReadiness };
