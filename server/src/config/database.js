const mongoose = require('mongoose');
const { assessMongoTarget } = require('./mongoTargetGuard');

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
    process.exit(1);
  }

  try {
    const options = {
      // This application release never creates collections or changes live indexes.
      autoIndex: false,
      autoCreate: false,
      maxPoolSize: 10, // Maximum number of connections
      minPoolSize: 2,  // Minimum number of connections
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 5000,
      family: 4 // Use IPv4
    };

    const conn = await mongoose.connect(process.env.MONGODB_URI, options);

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
    process.exit(1);
  }
};

module.exports = connectDB;
