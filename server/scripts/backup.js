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
    console.log('✅ MongoDB connected for backup');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const createBackupDirectory = () => {
  const backupDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  return backupDir;
};

const createTimestampedBackup = async () => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = createBackupDirectory();
    const backupPath = path.join(backupDir, `backup-${timestamp}`);
    
    console.log('🔄 Creating database backup...');
    console.log(`📁 Backup location: ${backupPath}`);
    
    // Create backup using mongodump
    const { stdout, stderr } = await execAsync(
      `mongodump --uri="${process.env.MONGODB_URI}" --out="${backupPath}"`
    );
    
    if (stderr && !stderr.includes('warning')) {
      console.error('❌ Backup error:', stderr);
      return null;
    }
    
    console.log('✅ Database backup created successfully');
    console.log(`📊 Backup size: ${getBackupSize(backupPath)}`);
    
    // Create backup info file
    const backupInfo = {
      timestamp: new Date().toISOString(),
      database: process.env.MONGODB_URI.split('/').pop(),
      collections: await getCollectionInfo(),
      size: getBackupSize(backupPath)
    };
    
    fs.writeFileSync(
      path.join(backupPath, 'backup-info.json'),
      JSON.stringify(backupInfo, null, 2)
    );
    
    return backupPath;
  } catch (error) {
    console.error('❌ Backup failed:', error.message);
    return null;
  }
};

const getBackupSize = (backupPath) => {
  try {
    const stats = fs.statSync(backupPath);
    if (stats.isDirectory()) {
      let totalSize = 0;
      const files = fs.readdirSync(backupPath, { withFileTypes: true });
      
      files.forEach(file => {
        const filePath = path.join(backupPath, file.name);
        if (file.isDirectory()) {
          totalSize += getBackupSize(filePath);
        } else {
          totalSize += fs.statSync(filePath).size;
        }
      });
      
      return formatBytes(totalSize);
    }
    return formatBytes(stats.size);
  } catch (error) {
    return 'Unknown';
  }
};

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const getCollectionInfo = async () => {
  try {
    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionInfo = {};
    
    for (const collection of collections) {
      const count = await mongoose.connection.db.collection(collection.name).countDocuments();
      collectionInfo[collection.name] = count;
    }
    
    return collectionInfo;
  } catch (error) {
    console.error('Error getting collection info:', error);
    return {};
  }
};

const listBackups = () => {
  const backupDir = createBackupDirectory();
  const backups = fs.readdirSync(backupDir, { withFileTypes: true })
    .filter(item => item.isDirectory() && item.name.startsWith('backup-'))
    .map(item => {
      const backupPath = path.join(backupDir, item.name);
      const infoPath = path.join(backupPath, 'backup-info.json');
      
      if (fs.existsSync(infoPath)) {
        const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
        return {
          name: item.name,
          path: backupPath,
          timestamp: info.timestamp,
          size: info.size,
          collections: info.collections
        };
      }
      
      return {
        name: item.name,
        path: backupPath,
        timestamp: fs.statSync(backupPath).mtime.toISOString(),
        size: getBackupSize(backupPath),
        collections: {}
      };
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  return backups;
};

const main = async () => {
  const command = process.argv[2];
  
  await connectDB();
  
  switch (command) {
    case 'create':
      await createTimestampedBackup();
      break;
      
    case 'list':
      console.log('📋 Available backups:');
      const backups = listBackups();
      if (backups.length === 0) {
        console.log('No backups found');
      } else {
        backups.forEach((backup, index) => {
          console.log(`\n${index + 1}. ${backup.name}`);
          console.log(`   📅 Created: ${new Date(backup.timestamp).toLocaleString()}`);
          console.log(`   📊 Size: ${backup.size}`);
          console.log(`   📁 Path: ${backup.path}`);
          if (Object.keys(backup.collections).length > 0) {
            console.log(`   📋 Collections: ${Object.keys(backup.collections).join(', ')}`);
          }
        });
      }
      break;
      
    default:
      console.log('Usage:');
      console.log('  node backup.js create  - Create a new backup');
      console.log('  node backup.js list    - List all backups');
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
