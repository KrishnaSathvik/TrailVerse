const mongoose = require('mongoose');
const { assessMongoTarget } = require('./mongoTargetGuard');
const { ensureApplicationIndexes, provisionLocalIndexes } = require('./applicationIndexes');

const connectDB = async () => {
  // Refuse remote databases outside production BEFORE connecting — local dev
  // must never write to a shared cluster by accident (audit 2026-08-31).
  const target = assessMongoTarget({
    uri: process.env.MONGODB_URI,
    nodeEnv: process.env.NODE_ENV,
    allowRemoteHosts: process.env.MONGODB_DANGEROUSLY_ALLOW_REMOTE_HOSTS,
  });
  if (!target.allowed) {
    console.error(`🛑 Refusing to start: ${target.reason}`);
    throw new Error(target.reason);
  }

  try {
    const options = {
      // Explicit provisioning owns indexes; normal runtime never builds them implicitly.
      autoIndex: false,
      autoCreate: false,
      maxPoolSize: 10, // Maximum number of connections
      minPoolSize: 2,  // Minimum number of connections
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 5000,
      family: 4 // Use IPv4
    };

    const conn = await mongoose.connect(process.env.MONGODB_URI, options);

    await ensureApplicationIndexes({ apply: provisionLocalIndexes() });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('MongoDB connection closed through app termination');
      process.exit(0);
    });

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    await mongoose.disconnect();
    throw error;
  }
};

module.exports = connectDB;
