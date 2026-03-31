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
  // Stagger calls with delays so we don't burst the rate limit window.
  setImmediate(async () => {
    try {
      const parks = await npsService.getAllParks();
      console.log(`🌲 Warmed parks snapshot with ${parks.length} parks`);
    } catch (error) {
      console.warn(`⚠️ Parks snapshot warm-up failed: ${error.message}`);
    }

    // Wait 5s before hitting events to let the rate limit window breathe
    await new Promise(resolve => setTimeout(resolve, 5000));

    try {
      const events = await npsService.getAllEvents();
      console.log(`📅 Warmed events cache with ${events.length} events`);
    } catch (error) {
      console.warn(`⚠️ Events cache warm-up failed: ${error.message}`);
    }

    // Wait another 5s before activities
    await new Promise(resolve => setTimeout(resolve, 5000));

    try {
      const activities = await npsService.getAllActivities();
      console.log(`🎯 Warmed activities cache with ${activities.length} activities`);
    } catch (error) {
      console.warn(`⚠️ Activities cache warm-up failed: ${error.message}`);
    }

    // Wait another 5s before alerts
    await new Promise(resolve => setTimeout(resolve, 5000));

    try {
      const alerts = await npsService.getAllAlerts();
      const parkCount = Object.keys(alerts).length;
      const totalAlerts = Object.values(alerts).reduce((sum, a) => sum + a.length, 0);
      console.log(`🚨 Warmed alerts cache with ${totalAlerts} alerts across ${parkCount} parks`);
    } catch (error) {
      console.warn(`⚠️ Alerts cache warm-up failed: ${error.message}`);
    }

    // Wait another 5s before campgrounds
    await new Promise(resolve => setTimeout(resolve, 5000));

    try {
      const campgrounds = await npsService.getAllCampgrounds();
      const parkCount = Object.keys(campgrounds).length;
      const total = Object.values(campgrounds).reduce((sum, a) => sum + a.length, 0);
      console.log(`⛺ Warmed campgrounds cache with ${total} campgrounds across ${parkCount} parks`);
    } catch (error) {
      console.warn(`⚠️ Campgrounds cache warm-up failed: ${error.message}`);
    }

    // Wait another 5s before visitor centers
    await new Promise(resolve => setTimeout(resolve, 5000));

    try {
      const vcs = await npsService.getAllVisitorCenters();
      const parkCount = Object.keys(vcs).length;
      const total = Object.values(vcs).reduce((sum, a) => sum + a.length, 0);
      console.log(`🏛️ Warmed visitor centers cache with ${total} visitor centers across ${parkCount} parks`);
    } catch (error) {
      console.warn(`⚠️ Visitor centers cache warm-up failed: ${error.message}`);
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
