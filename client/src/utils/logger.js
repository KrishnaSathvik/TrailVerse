/**
 * Production-safe logging utility
 * Automatically disables console logs in production builds
 */

const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

// Create a logger that respects environment
const logger = {
  // Always log errors, even in production
  error: (...args) => {
    if (isDevelopment || isProduction) {
      console.error(...args);
    }
  },
  
  // Log warnings in development only
  warn: (...args) => {
    if (isDevelopment) {
      console.warn(...args);
    }
  },
  
  // Log info in development only
  info: (...args) => {
    if (isDevelopment) {
      console.info(...args);
    }
  },
  
  // Log debug in development only
  log: (...args) => {
    if (isDevelopment) {

    }
  },
  
  // Debug logging (development only)
  debug: (...args) => {
    if (isDevelopment) {
      console.debug(...args);
    }
  },
  
  // Performance logging (always enabled for monitoring)
  performance: (...args) => {
    if (isDevelopment || isProduction) {

    }
  },
  
  // Analytics logging (always enabled)
  analytics: (...args) => {
    if (isDevelopment || isProduction) {

    }
  }
};

// Override global console in production
if (isProduction) {
  // Keep error logging for production debugging
  console.error = logger.error;
  
  // Disable other console methods in production
  console.log = () => {};
  console.warn = () => {};
  console.info = () => {};
  console.debug = () => {};
  
  // Keep console.table for debugging if needed
  // console.table = () => {};
}

export default logger;
