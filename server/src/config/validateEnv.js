/**
 * Environment Variable Validation
 * Ensures all required environment variables are present and valid
 */

const requiredEnvVars = [
  'MONGODB_URI',
  'JWT_SECRET',
  'NPS_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'EMAIL_USER',
  'EMAIL_PASS',
  'WEBSITE_URL'
];

const optionalEnvVars = [
  'PORT',
  'CLIENT_URL',
  'OPENWEATHER_API_KEY',
  'RATE_LIMIT_WINDOW_MS',
  'RATE_LIMIT_MAX_REQUESTS',
  'RATE_LIMIT_AUTH_MAX'
];

function validateEnvironment() {
  const missing = [];
  const invalid = [];

  // Check required variables
  requiredEnvVars.forEach(varName => {
    const value = process.env[varName];
    
    if (!value) {
      missing.push(varName);
    } else if (value.includes('your-') || value.includes('example') || value === 'your_nps_api_key_here') {
      invalid.push(`${varName} (contains placeholder value)`);
    }
  });

  // Validate JWT_SECRET strength
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    invalid.push('JWT_SECRET (must be at least 32 characters)');
  }

  // Validate MongoDB URI format
  if (process.env.MONGODB_URI && !process.env.MONGODB_URI.startsWith('mongodb')) {
    invalid.push('MONGODB_URI (must start with mongodb:// or mongodb+srv://)');
  }

  // Validate email configuration
  if (process.env.EMAIL_USER && !process.env.EMAIL_USER.includes('@')) {
    invalid.push('EMAIL_USER (must be a valid email address)');
  }

  // Report results
  if (missing.length > 0 || invalid.length > 0) {
    console.error('❌ Environment validation failed:');
    
    if (missing.length > 0) {
      console.error('Missing required variables:', missing.join(', '));
    }
    
    if (invalid.length > 0) {
      console.error('Invalid variables:', invalid.join(', '));
    }
    
    console.error('\n📋 Required environment variables:');
    requiredEnvVars.forEach(varName => {
      console.error(`  - ${varName}`);
    });
    
    console.error('\n📋 Optional environment variables:');
    optionalEnvVars.forEach(varName => {
      console.error(`  - ${varName}`);
    });
    
    console.error('\n💡 Please check your .env file and ensure all required variables are set correctly.');
    
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    } else {
      console.warn('⚠️  Running in development mode despite validation errors.');
    }
  } else {
    console.log('✅ Environment variables validated successfully');
  }
}

module.exports = validateEnvironment;
