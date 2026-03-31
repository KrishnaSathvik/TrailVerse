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

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.log(`Error: ${err.message}`);
  server.close(() => process.exit(1));
});
