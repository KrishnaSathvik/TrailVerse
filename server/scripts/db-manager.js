#!/usr/bin/env node

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');

const execAsync = util.promisify(exec);

// Import all models to ensure they're registered
require('../src/models/User');
require('../src/models/TripPlan');
require('../src/models/Favorite');
require('../src/models/Review');
require('../src/models/Event');
require('../src/models/BlogPost');
require('../src/models/Comment');
require('../src/models/Testimonial');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const getDatabaseStats = async () => {
  try {
    const dbStats = await mongoose.connection.db.stats();
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    const collectionStats = {};
    for (const collection of collections) {
      const count = await mongoose.connection.db.collection(collection.name).countDocuments();
      const stats = await mongoose.connection.db.collection(collection.name).stats();
      
      collectionStats[collection.name] = {
        count,
        size: formatBytes(stats.size),
        avgObjSize: formatBytes(stats.avgObjSize),
        storageSize: formatBytes(stats.storageSize),
        indexes: stats.nindexes,
        totalIndexSize: formatBytes(stats.totalIndexSize)
      };
    }
    
    return {
      database: {
        collections: dbStats.collections,
        objects: dbStats.objects,
        dataSize: formatBytes(dbStats.dataSize),
        storageSize: formatBytes(dbStats.storageSize),
        indexes: dbStats.indexes,
        indexSize: formatBytes(dbStats.indexSize)
      },
      collections: collectionStats
    };
  } catch (error) {
    console.error('Error getting database stats:', error);
    return null;
  }
};

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const checkDatabaseHealth = async () => {
  try {
    console.log('🔍 Checking database health...\n');
    
    // Connection check
    const dbState = mongoose.connection.readyState;
    const dbStates = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    
    console.log(`📡 Connection Status: ${dbStates[dbState]}`);
    console.log(`🏠 Host: ${mongoose.connection.host}:${mongoose.connection.port}`);
    console.log(`🗄️  Database: ${mongoose.connection.name}\n`);
    
    if (dbState !== 1) {
      console.log('❌ Database is not connected');
      return false;
    }
    
    // Test basic operations
    console.log('🧪 Testing database operations...');
    
    // Test read operation
    const userCount = await mongoose.connection.db.collection('users').countDocuments();
    console.log(`✅ Read test passed - Users: ${userCount}`);
    
    // Test write operation (create a test document)
    const testCollection = mongoose.connection.db.collection('health_check_test');
    await testCollection.insertOne({ 
      test: true, 
      timestamp: new Date(),
      message: 'Health check test document'
    });
    console.log('✅ Write test passed');
    
    // Clean up test document
    await testCollection.deleteOne({ test: true });
    console.log('✅ Cleanup test passed\n');
    
    // Get database statistics
    const stats = await getDatabaseStats();
    if (stats) {
      console.log('📊 Database Statistics:');
      console.log(`   Collections: ${stats.database.collections}`);
      console.log(`   Documents: ${stats.database.objects}`);
      console.log(`   Data Size: ${stats.database.dataSize}`);
      console.log(`   Storage Size: ${stats.database.storageSize}`);
      console.log(`   Indexes: ${stats.database.indexes}`);
      console.log(`   Index Size: ${stats.database.indexSize}\n`);
      
      console.log('📋 Collection Details:');
      Object.entries(stats.collections).forEach(([name, stat]) => {
        console.log(`   ${name}:`);
        console.log(`     Documents: ${stat.count}`);
        console.log(`     Size: ${stat.size}`);
        console.log(`     Avg Object Size: ${stat.avgObjSize}`);
        console.log(`     Storage Size: ${stat.storageSize}`);
        console.log(`     Indexes: ${stat.indexes}`);
        console.log(`     Index Size: ${stat.totalIndexSize}`);
        console.log('');
      });
    }
    
    console.log('✅ Database health check completed successfully');
    return true;
    
  } catch (error) {
    console.error('❌ Database health check failed:', error.message);
    return false;
  }
};

const optimizeDatabase = async () => {
  try {
    console.log('🔧 Optimizing database...\n');
    
    // Reindex all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    for (const collection of collections) {
      console.log(`🔄 Reindexing ${collection.name}...`);
      try {
        await mongoose.connection.db.collection(collection.name).reIndex();
        console.log(`✅ ${collection.name} reindexed successfully`);
      } catch (error) {
        console.log(`⚠️  ${collection.name} reindex failed: ${error.message}`);
      }
    }
    
    // Compact database (if supported)
    try {
      console.log('\n🗜️  Compacting database...');
      await mongoose.connection.db.admin().command({ compact: mongoose.connection.name });
      console.log('✅ Database compacted successfully');
    } catch (error) {
      console.log('⚠️  Database compaction not supported or failed:', error.message);
    }
    
    console.log('\n✅ Database optimization completed');
    
  } catch (error) {
    console.error('❌ Database optimization failed:', error.message);
  }
};

const cleanDatabase = async () => {
  try {
    console.log('🧹 Cleaning database...\n');
    
    // Remove old test documents
    const testCollections = ['health_check_test', 'test_collection'];
    
    for (const collectionName of testCollections) {
      try {
        const result = await mongoose.connection.db.collection(collectionName).deleteMany({});
        if (result.deletedCount > 0) {
          console.log(`🗑️  Removed ${result.deletedCount} test documents from ${collectionName}`);
        }
      } catch (error) {
        // Collection might not exist, which is fine
      }
    }
    
    // Remove expired tokens (if any)
    const expiredTokens = await mongoose.connection.db.collection('users').updateMany(
      {
        $or: [
          { resetPasswordExpire: { $lt: new Date() } },
          { emailVerificationExpire: { $lt: new Date() } }
        ]
      },
      {
        $unset: {
          resetPasswordToken: '',
          resetPasswordExpire: '',
          emailVerificationToken: '',
          emailVerificationExpire: ''
        }
      }
    );
    
    if (expiredTokens.modifiedCount > 0) {
      console.log(`🗑️  Cleaned ${expiredTokens.modifiedCount} expired tokens`);
    }
    
    console.log('✅ Database cleanup completed');
    
  } catch (error) {
    console.error('❌ Database cleanup failed:', error.message);
  }
};

const showHelp = () => {
  console.log('🗄️  Database Management Tool');
  console.log('');
  console.log('Usage: node db-manager.js <command>');
  console.log('');
  console.log('Commands:');
  console.log('  health     - Check database health and statistics');
  console.log('  optimize   - Optimize database (reindex, compact)');
  console.log('  clean      - Clean up test data and expired tokens');
  console.log('  stats      - Show detailed database statistics');
  console.log('  backup     - Create a database backup');
  console.log('  restore    - Restore from backup (interactive)');
  console.log('  migrate    - Run database migrations');
  console.log('  seed       - Seed database with sample data');
  console.log('  help       - Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  node db-manager.js health');
  console.log('  node db-manager.js backup');
  console.log('  node db-manager.js optimize');
};

const main = async () => {
  const command = process.argv[2] || 'help';
  
  await connectDB();
  
  switch (command) {
    case 'health':
      await checkDatabaseHealth();
      break;
      
    case 'optimize':
      await optimizeDatabase();
      break;
      
    case 'clean':
      await cleanDatabase();
      break;
      
    case 'stats':
      const stats = await getDatabaseStats();
      if (stats) {
        console.log('📊 Database Statistics:\n');
        console.log(JSON.stringify(stats, null, 2));
      }
      break;
      
    case 'backup':
      console.log('🔄 Creating backup...');
      exec('node scripts/backup.js create', (error, stdout, stderr) => {
        if (error) {
          console.error('❌ Backup failed:', error);
        } else {
          console.log(stdout);
        }
      });
      break;
      
    case 'restore':
      console.log('🔄 Starting restore...');
      exec('node scripts/restore.js restore', (error, stdout, stderr) => {
        if (error) {
          console.error('❌ Restore failed:', error);
        } else {
          console.log(stdout);
        }
      });
      break;
      
    case 'migrate':
      console.log('🔄 Running migrations...');
      exec('node scripts/migrate.js up', (error, stdout, stderr) => {
        if (error) {
          console.error('❌ Migration failed:', error);
        } else {
          console.log(stdout);
        }
      });
      break;
      
    case 'seed':
      console.log('🌱 Seeding database...');
      exec('node scripts/seed.js', (error, stdout, stderr) => {
        if (error) {
          console.error('❌ Seeding failed:', error);
        } else {
          console.log(stdout);
        }
      });
      break;
      
    case 'help':
    default:
      showHelp();
      break;
  }
  
  await mongoose.connection.close();
  console.log('✅ Database connection closed');
};

// Handle errors
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled rejection:', err);
  process.exit(1);
});

main();
