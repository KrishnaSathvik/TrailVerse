const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// Import all models to ensure they're registered
const User = require('../models/User');
const TripPlan = require('../models/TripPlan');
const Favorite = require('../models/Favorite');
const Review = require('../models/ParkReview');
const Event = require('../models/Event');
const BlogPost = require('../models/BlogPost');
const Comment = require('../models/Comment');
const Testimonial = require('../models/Testimonial');

// Health check endpoint
router.get('/', async (req, res) => {
  const startTime = Date.now();
  const healthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    checks: {}
  };

  try {
    // Database connection check
    const dbStartTime = Date.now();
    const dbState = mongoose.connection.readyState;
    const dbStates = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    
    healthCheck.checks.database = {
      status: dbState === 1 ? 'healthy' : 'unhealthy',
      state: dbStates[dbState] || 'unknown',
      responseTime: Date.now() - dbStartTime,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name
    };

    // Collection statistics
    if (dbState === 1) {
      const collections = await mongoose.connection.db.listCollections().toArray();
      const collectionStats = {};
      
      for (const collection of collections) {
        try {
          const count = await mongoose.connection.db.collection(collection.name).countDocuments();
          const stats = await mongoose.connection.db.collection(collection.name).stats();
          
          collectionStats[collection.name] = {
            count,
            size: stats.size,
            avgObjSize: stats.avgObjSize,
            storageSize: stats.storageSize,
            indexes: stats.nindexes,
            totalIndexSize: stats.totalIndexSize
          };
        } catch (error) {
          collectionStats[collection.name] = {
            error: error.message
          };
        }
      }
      
      healthCheck.checks.database.collections = collectionStats;
    }

    // Memory usage
    const memUsage = process.memoryUsage();
    healthCheck.checks.memory = {
      status: 'healthy',
      rss: Math.round(memUsage.rss / 1024 / 1024), // MB
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      external: Math.round(memUsage.external / 1024 / 1024) // MB
    };

    // CPU usage (basic)
    const cpuUsage = process.cpuUsage();
    healthCheck.checks.cpu = {
      status: 'healthy',
      user: cpuUsage.user,
      system: cpuUsage.system
    };

    // Overall response time
    healthCheck.responseTime = Date.now() - startTime;

    // Determine overall status
    const hasUnhealthyChecks = Object.values(healthCheck.checks).some(check => 
      check.status === 'unhealthy'
    );
    
    if (hasUnhealthyChecks) {
      healthCheck.status = 'unhealthy';
      return res.status(503).json(healthCheck);
    }

    res.json(healthCheck);

  } catch (error) {
    healthCheck.status = 'unhealthy';
    healthCheck.error = error.message;
    healthCheck.responseTime = Date.now() - startTime;
    
    res.status(503).json(healthCheck);
  }
});

// Detailed database health check
router.get('/database', async (req, res) => {
  try {
    const dbState = mongoose.connection.readyState;
    const dbStates = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };

    if (dbState !== 1) {
      return res.status(503).json({
        status: 'unhealthy',
        message: 'Database is not connected',
        state: dbStates[dbState] || 'unknown'
      });
    }

    // Get detailed database information
    const admin = mongoose.connection.db.admin();
    const serverStatus = await admin.serverStatus();
    const dbStats = await mongoose.connection.db.stats();

    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      connection: {
        host: mongoose.connection.host,
        port: mongoose.connection.port,
        name: mongoose.connection.name,
        state: dbStates[dbState]
      },
      server: {
        version: serverStatus.version,
        uptime: serverStatus.uptime,
        connections: serverStatus.connections,
        memory: serverStatus.mem,
        network: serverStatus.network
      },
      database: {
        collections: dbStats.collections,
        objects: dbStats.objects,
        dataSize: dbStats.dataSize,
        storageSize: dbStats.storageSize,
        indexes: dbStats.indexes,
        indexSize: dbStats.indexSize
      },
      collections: {}
    };

    // Get collection details
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    for (const collection of collections) {
      try {
        const count = await mongoose.connection.db.collection(collection.name).countDocuments();
        const stats = await mongoose.connection.db.collection(collection.name).stats();
        const indexes = await mongoose.connection.db.collection(collection.name).indexes();
        
        healthData.collections[collection.name] = {
          count,
          size: stats.size,
          avgObjSize: stats.avgObjSize,
          storageSize: stats.storageSize,
          indexes: indexes.length,
          indexDetails: indexes.map(idx => ({
            name: idx.name,
            key: idx.key,
            unique: idx.unique || false,
            sparse: idx.sparse || false
          }))
        };
      } catch (error) {
        healthData.collections[collection.name] = {
          error: error.message
        };
      }
    }

    res.json(healthData);

  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      message: 'Database health check failed',
      error: error.message
    });
  }
});

// Simple ping endpoint
router.get('/ping', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Readiness check (for Kubernetes/Docker)
router.get('/ready', async (req, res) => {
  try {
    // Check if database is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        status: 'not ready',
        message: 'Database not connected'
      });
    }

    // Simple database query to ensure it's responsive
    await mongoose.connection.db.admin().ping();

    res.json({
      status: 'ready',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      message: 'Database not responsive',
      error: error.message
    });
  }
});

// Liveness check (for Kubernetes/Docker)
router.get('/live', (req, res) => {
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

module.exports = router;
