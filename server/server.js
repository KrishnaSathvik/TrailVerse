const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

// Load env vars
dotenv.config({ path: './.env.development' });

// Validate environment variables
const validateEnv = require('./src/config/validateEnv');
validateEnv();

// Import app
const app = require('./src/app');

// Import WebSocket service
const websocketService = require('./src/services/websocketService');

// Database connection (we'll create this next)
const connectDB = require('./src/config/database');

// Connect to database
connectDB();

const PORT = process.env.PORT || 5001;

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
});

// Initialize WebSocket
websocketService.initialize(server);

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.log(`Error: ${err.message}`);
  server.close(() => process.exit(1));
});
