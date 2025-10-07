require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const readline = require('readline');

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
    console.log('✅ MongoDB connected for restore');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const createRestoreDirectory = () => {
  const restoreDir = path.join(__dirname, '..', 'restores');
  if (!fs.existsSync(restoreDir)) {
    fs.mkdirSync(restoreDir, { recursive: true });
  }
  return restoreDir;
};

const listBackups = () => {
  const backupDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) {
    return [];
  }
  
  return fs.readdirSync(backupDir, { withFileTypes: true })
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
        size: 'Unknown',
        collections: {}
      };
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
};

const askQuestion = (question) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
};

const confirmRestore = async (backupPath) => {
  console.log('\n⚠️  WARNING: This will replace ALL data in the database!');
  console.log(`📁 Restoring from: ${backupPath}`);
  
  const confirm = await askQuestion('Are you sure you want to continue? (yes/no): ');
  return confirm.toLowerCase() === 'yes' || confirm.toLowerCase() === 'y';
};

const createPreRestoreBackup = async () => {
  console.log('🔄 Creating pre-restore backup...');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const restoreDir = createRestoreDirectory();
  const preRestoreBackupPath = path.join(restoreDir, `pre-restore-${timestamp}`);
  
  try {
    const { stdout, stderr } = await execAsync(
      `mongodump --uri="${process.env.MONGODB_URI}" --out="${preRestoreBackupPath}"`
    );
    
    if (stderr && !stderr.includes('warning')) {
      console.error('❌ Pre-restore backup failed:', stderr);
      return null;
    }
    
    console.log('✅ Pre-restore backup created');
    return preRestoreBackupPath;
  } catch (error) {
    console.error('❌ Pre-restore backup failed:', error.message);
    return null;
  }
};

const restoreFromBackup = async (backupPath) => {
  try {
    console.log('🔄 Starting database restore...');
    
    // Create pre-restore backup
    const preRestoreBackup = await createPreRestoreBackup();
    
    // Drop existing database
    console.log('🗑️  Dropping existing database...');
    await mongoose.connection.db.dropDatabase();
    
    // Restore from backup
    console.log('📥 Restoring from backup...');
    const databaseName = process.env.MONGODB_URI.split('/').pop();
    const { stdout, stderr } = await execAsync(
      `mongorestore --uri="${process.env.MONGODB_URI}" --drop "${backupPath}/${databaseName}"`
    );
    
    if (stderr && !stderr.includes('warning')) {
      console.error('❌ Restore error:', stderr);
      return false;
    }
    
    console.log('✅ Database restore completed successfully');
    
    // Verify restore
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`📊 Restored ${collections.length} collections:`);
    
    for (const collection of collections) {
      const count = await mongoose.connection.db.collection(collection.name).countDocuments();
      console.log(`   - ${collection.name}: ${count} documents`);
    }
    
    if (preRestoreBackup) {
      console.log(`💾 Pre-restore backup saved at: ${preRestoreBackup}`);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Restore failed:', error.message);
    return false;
  }
};

const restoreFromFile = async (backupFilePath) => {
  try {
    if (!fs.existsSync(backupFilePath)) {
      console.error('❌ Backup file not found:', backupFilePath);
      return false;
    }
    
    const stats = fs.statSync(backupFilePath);
    if (!stats.isDirectory()) {
      console.error('❌ Backup path must be a directory');
      return false;
    }
    
    return await restoreFromBackup(backupFilePath);
  } catch (error) {
    console.error('❌ Restore from file failed:', error.message);
    return false;
  }
};

const interactiveRestore = async () => {
  const backups = listBackups();
  
  if (backups.length === 0) {
    console.log('❌ No backups found');
    return;
  }
  
  console.log('📋 Available backups:');
  backups.forEach((backup, index) => {
    console.log(`\n${index + 1}. ${backup.name}`);
    console.log(`   📅 Created: ${new Date(backup.timestamp).toLocaleString()}`);
    console.log(`   📊 Size: ${backup.size}`);
    if (Object.keys(backup.collections).length > 0) {
      console.log(`   📋 Collections: ${Object.keys(backup.collections).join(', ')}`);
    }
  });
  
  const choice = await askQuestion('\nSelect backup to restore (number): ');
  const backupIndex = parseInt(choice) - 1;
  
  if (isNaN(backupIndex) || backupIndex < 0 || backupIndex >= backups.length) {
    console.log('❌ Invalid selection');
    return;
  }
  
  const selectedBackup = backups[backupIndex];
  
  if (await confirmRestore(selectedBackup.path)) {
    await restoreFromBackup(selectedBackup.path);
  } else {
    console.log('❌ Restore cancelled');
  }
};

const main = async () => {
  const command = process.argv[2];
  const backupPath = process.argv[3];
  
  await connectDB();
  
  switch (command) {
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
      
    case 'restore':
      if (backupPath) {
        if (await confirmRestore(backupPath)) {
          await restoreFromFile(backupPath);
        } else {
          console.log('❌ Restore cancelled');
        }
      } else {
        await interactiveRestore();
      }
      break;
      
    default:
      console.log('Usage:');
      console.log('  node restore.js list                    - List all backups');
      console.log('  node restore.js restore                 - Interactive restore');
      console.log('  node restore.js restore <backup-path>   - Restore from specific path');
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
