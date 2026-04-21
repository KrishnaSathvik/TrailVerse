const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');

// Load env vars (only in development)
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: './.env' });
}

// Validate environment variables
const validateEnv = require('./src/config/validateEnv');
validateEnv();

// Import app with WebSocket support
const { app, server, wsService } = require('./src/app');

// Database connection
const connectDB = require('./src/config/database');

// Scheduler services
const { startScheduler, stopScheduler } = require('./src/services/schedulerService');
const { startDailyFeedScheduler, stopDailyFeedScheduler } = require('./src/services/dailyFeedScheduler');
const npsService = require('./src/services/npsService');

// Connect to database
connectDB().then(() => {
  // Start schedulers after database connection is established
  startScheduler();
  startDailyFeedScheduler();

  // Only warm the parks list at startup — it's needed for the parks listing page.
  // All other NPS data (alerts, campgrounds, visitor centers, places, tours,
  // webcams, events, activities, videos, gallery photos) is fetched per-park
  // when a user visits that park, then cached for 24h. This avoids burning
  // hundreds of API calls on every deploy.
  setImmediate(async () => {
    console.log('🚀 Starting NPS parks warm-up...');
    try {
      const parks = await npsService.getAllParks();
      console.log(`🌲 Warmed parks snapshot with ${parks.length} parks`);
    } catch (error) {
      console.warn(`⚠️ Parks snapshot warm-up failed: ${error.message}`);
    }
  });
}).catch((err) => {
  console.error('❌ Failed to connect to database:', err);
  process.exit(1);
});

const PORT = process.env.PORT || 5001;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
  console.log(`📡 WebSocket server ready for real-time updates`);
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
