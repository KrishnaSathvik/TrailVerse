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

// Connect to database
connectDB();

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
