const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');

// Load env vars (only in development)
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: './.env' });
  const { ensureLocalTrailieEvidenceRefreshSecret } = require('./src/config/trailieEvidenceRefreshSecret');
  const ensured = ensureLocalTrailieEvidenceRefreshSecret();
  if (ensured.generated) {
    console.log('Generated local TRAILIE_EVIDENCE_REFRESH_HASH_SECRET in server/.env (gitignored).');
  }
}

// Validate environment variables
const validateEnv = require('./src/config/validateEnv');
validateEnv();

// NPS configuration is checked here — the real production startup seam — and
// nowhere else. Importing npsService, src/app, or any route must never require
// a key, so deterministic evaluation runs can boot with an injected adapter.
const { assertNpsConfigured } = require('./src/services/npsService');
try {
  assertNpsConfigured();
} catch (error) {
  console.error('❌ NPS is not configured (nps_not_configured)');
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
  console.warn('⚠️  Continuing in development mode; NPS-backed routes will fail.');
}

const { assertTrailieEvidenceRefreshConfigured } = require('./src/config/trailieEvidenceRefreshSecret');
try {
  assertTrailieEvidenceRefreshConfigured();
} catch (error) {
  console.error('❌ Trailie evidence refresh is not configured (evidence_refresh_hash_secret_missing)');
  console.error('Set TRAILIE_EVIDENCE_REFRESH_HASH_SECRET in the deployment environment (production) or server/.env (local). The value is never logged.');
  process.exit(1);
}

// Import app with WebSocket support
const { app, server, wsService } = require('./src/app');

// Database connection
const connectDB = require('./src/config/database');

// Scheduler services
const { startScheduler, stopScheduler } = require('./src/services/schedulerService');
const { startDailyFeedScheduler, stopDailyFeedScheduler } = require('./src/services/dailyFeedScheduler');
const { startAnalyticsSnapshotScheduler, stopAnalyticsSnapshotScheduler } = require('./src/services/analyticsSnapshotScheduler');
const { getNpsService } = require('./src/services/npsService');
const { loadDynamicMap } = require('./src/utils/parkExtractor');

// Connect to database
connectDB().then(async () => {
  // Data migrations are separate, explicitly approved operations.

  // No HTTP/WebSocket traffic until required database indexes are verified.
  const PORT = process.env.PORT || 5001;
  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
    console.log(`📡 WebSocket server ready for real-time updates`);
  });

  // Start schedulers after database connection is established
  startScheduler();
  startDailyFeedScheduler();
  startAnalyticsSnapshotScheduler();

  // Stage 9 — durable shadow-review worker. DISABLED by default; runs only when
  // TRAILIE_REVIEW_WORKER_ENABLED=true. It reviews sampled canonical responses
  // OFF the request path and can never mutate saved trip data. Requires an
  // Anthropic key to make reviewer calls; without one it stays idle.
  try {
    const { getTrailieReviewConfig } = require('./src/config/trailieReviewConfig');
    if (getTrailieReviewConfig().workerEnabled) {
      const { createReviewWorker } = require('./src/services/trailieReviewWorker');
      let anthropic = null;
      if (process.env.ANTHROPIC_API_KEY) {
        const Anthropic = require('@anthropic-ai/sdk');
        anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      }
      const reviewWorker = createReviewWorker({ anthropic });
      reviewWorker.start();
      global.__trailieReviewWorker = reviewWorker; // for graceful shutdown
      console.log('🕵️  Trailie shadow-review worker started (async, off-path)');
    }
  } catch (err) {
    console.warn('⚠️ Trailie review worker not started:', err.message);
  }

  // Only warm the parks list at startup — it's needed for the parks listing page.
  // All other NPS data (alerts, campgrounds, visitor centers, places, tours,
  // webcams, events, activities, videos, gallery photos) is fetched per-park
  // when a user visits that park, then cached for 24h. This avoids burning
  // hundreds of API calls on every deploy.
  setImmediate(async () => {
    console.log('🚀 Starting NPS parks warm-up...');
    try {
      const parks = await getNpsService().getAllParks();
      console.log(`🌲 Warmed parks snapshot with ${parks.length} parks`);
      // Build dynamic park name map — reuses the already-cached park list
      await loadDynamicMap();

      // Bulk alerts: one warm load so crawlers don't fill the 500-key endpoint cache
      getNpsService()
        .getAllAlerts()
        .then((alertsByPark) => {
          const parkCount = Object.keys(alertsByPark || {}).length;
          console.log(`🔔 Warmed bulk alerts cache (${parkCount} parks indexed)`);
        })
        .catch((err) => {
          console.warn(`⚠️ Bulk alerts warm-up skipped: ${err.message}`);
        });

      // Bulk tab snapshots (places, campgrounds, etc.) — Mongo only, no NPS calls
      getNpsService()
        .warmParkTabSnapshots()
        .catch((err) => {
          console.warn(`⚠️ Park tab snapshot warm-up skipped: ${err.message}`);
        });

      const discoverCatalogService = require('./src/services/discoverCatalogService');
      const snapshot = await getNpsService()._loadSnapshot('discover-catalog', 7 * 24 * 60 * 60 * 1000);
      const needsRebuild =
        !snapshot?.data || !discoverCatalogService.catalogIndexesLookHealthy(snapshot.data);

      if (needsRebuild) {
        console.log('🔭 Discover catalog indexes unhealthy — rebuilding in background...');
        discoverCatalogService
          .buildCatalog({ forceIndexes: true })
          .then((catalog) => {
            const zeroActivities = catalog.activities.filter((a) => a.parkCount === 0).length;
            const zeroTopics = catalog.topics.filter((t) => t.parkCount === 0).length;
            console.log(
              `🔭 Discover catalog rebuilt (${catalog.activities.length} activities, ${zeroActivities} zero; ${catalog.topics.length} topics, ${zeroTopics} zero)`
            );
          })
          .catch((err) => {
            console.warn(`⚠️ Discover catalog rebuild failed: ${err.message}`);
          });
      } else {
        console.log('🔭 Discover catalog indexes look healthy');
      }
    } catch (error) {
      console.warn(`⚠️ Parks snapshot warm-up failed: ${error.message}`);
    }
  });
}).catch((err) => {
  console.error('❌ Failed to connect to database:', err);
  process.exit(1);
});

// Graceful shutdown handler
const gracefulShutdown = (signal) => {
  console.log(`\n🛑 ${signal} received — shutting down gracefully...`);

  // Stop accepting new connections
  server.close(() => {
    console.log('✅ HTTP server closed');

    // Stop schedulers
    stopScheduler();
    stopDailyFeedScheduler();
    stopAnalyticsSnapshotScheduler();

    // Stop the shadow-review worker (drains any in-flight tick).
    if (global.__trailieReviewWorker) {
      Promise.resolve(global.__trailieReviewWorker.stop()).catch(() => {});
    }

    // Stop WebSocket service
    if (wsService) {
      wsService.shutdown();
    }

    // Close database connection
    mongoose.connection.close(false).then(() => {
      console.log('✅ MongoDB connection closed');
      process.exit(0);
    }).catch(() => {
      process.exit(0);
    });
  });

  // Force exit after 10s if graceful shutdown stalls
  setTimeout(() => {
    console.error('⚠️ Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.log(`Error: ${err.message}`);
  server.close(() => process.exit(1));
});
