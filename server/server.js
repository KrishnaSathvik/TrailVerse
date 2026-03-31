const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

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

// Scheduler service for scheduled blog posts
const { startScheduler } = require('./src/services/schedulerService');
const npsService = require('./src/services/npsService');

// Connect to database
connectDB().then(() => {
  // Start the scheduler after database connection is established
  startScheduler();

  // Warm all NPS caches in the background so user/build requests don't
  // depend on the first request succeeding against the NPS API.
  setImmediate(async () => {
    try {
      const parks = await npsService.getAllParks();
      console.log(`🌲 Warmed parks snapshot with ${parks.length} parks`);
    } catch (error) {
      console.warn(`⚠️ Parks snapshot warm-up failed: ${error.message}`);
    }

    // Warm events cache (after parks so we don't burst the API)
    try {
      const events = await npsService.getAllEvents();
      console.log(`📅 Warmed events cache with ${events.length} events`);
    } catch (error) {
      console.warn(`⚠️ Events cache warm-up failed: ${error.message}`);
    }

    // Warm activities cache
    try {
      const activities = await npsService.getAllActivities();
      console.log(`🎯 Warmed activities cache with ${activities.length} activities`);
    } catch (error) {
      console.warn(`⚠️ Activities cache warm-up failed: ${error.message}`);
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

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.log(`Error: ${err.message}`);
  server.close(() => process.exit(1));
});
