/**
 * Recover deleted blog posts from a backup
 * 
 * This script allows you to restore blog posts from a backup without
 * restoring the entire database.
 * 
 * Usage:
 *   node scripts/recover-blog-posts.js list                    - List available backups
 *   node scripts/recover-blog-posts.js restore                 - Interactive restore
 *   node scripts/recover-blog-posts.js restore <backup-path>   - Restore from specific backup
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const readline = require('readline');

const execAsync = util.promisify(exec);

// Import models
require('../src/models/BlogPost');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
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

const restoreBlogPostsFromBackup = async (backupPath) => {
  try {
    console.log('🔄 Restoring blog posts from backup...');
    console.log(`📁 Backup location: ${backupPath}`);
    
    // Get database name from connection string
    const databaseName = process.env.MONGODB_URI.split('/').pop().split('?')[0];
    const backupCollectionPath = path.join(backupPath, databaseName, 'blogposts.bson');
    
    if (!fs.existsSync(backupCollectionPath)) {
      console.error('❌ Blog posts backup not found in this backup');
      console.log(`   Expected: ${backupCollectionPath}`);
      return false;
    }
    
    // Get current blog posts count
    const currentCount = await mongoose.connection.db.collection('blogposts').countDocuments();
    console.log(`📊 Current blog posts in database: ${currentCount}`);
    
    // Create temporary restore directory
    const tempRestoreDir = path.join(__dirname, '..', 'temp-restore');
    if (!fs.existsSync(tempRestoreDir)) {
      fs.mkdirSync(tempRestoreDir, { recursive: true });
    }
    
    const tempDbDir = path.join(tempRestoreDir, databaseName);
    if (!fs.existsSync(tempDbDir)) {
      fs.mkdirSync(tempDbDir, { recursive: true });
    }
    
    // Copy blogposts collection files
    const backupDbDir = path.join(backupPath, databaseName);
    const metadataFile = path.join(backupDbDir, 'blogposts.metadata.json');
    
    if (fs.existsSync(metadataFile)) {
      fs.copyFileSync(metadataFile, path.join(tempDbDir, 'blogposts.metadata.json'));
    }
    fs.copyFileSync(backupCollectionPath, path.join(tempDbDir, 'blogposts.bson'));
    
    console.log('📥 Restoring blog posts collection...');
    
    // Restore only blogposts collection
    const { stdout, stderr } = await execAsync(
      `mongorestore --uri="${process.env.MONGODB_URI}" --collection=blogposts --db=${databaseName} "${tempDbDir}"`
    );
    
    if (stderr && !stderr.includes('warning')) {
      console.error('❌ Restore error:', stderr);
      return false;
    }
    
    // Clean up temp directory
    fs.rmSync(tempRestoreDir, { recursive: true, force: true });
    
    // Get restored count
    const restoredCount = await mongoose.connection.db.collection('blogposts').countDocuments();
    console.log(`✅ Blog posts restored successfully`);
    console.log(`📊 Total blog posts now: ${restoredCount}`);
    console.log(`📈 Restored: ${restoredCount - currentCount} blog post(s)`);
    
    // List restored blog posts
    if (restoredCount > currentCount) {
      console.log('\n📋 Restored blog posts:');
      const allPosts = await mongoose.connection.db.collection('blogposts')
        .find({})
        .sort({ createdAt: -1 })
        .toArray();
      
      allPosts.forEach((post, index) => {
        console.log(`   ${index + 1}. ${post.title} (${post.slug})`);
        console.log(`      Status: ${post.status}`);
        console.log(`      Created: ${new Date(post.createdAt).toLocaleString()}`);
      });
    }
    
    return true;
  } catch (error) {
    console.error('❌ Restore failed:', error.message);
    return false;
  }
};

const interactiveRestore = async () => {
  const backups = listBackups();
  
  if (backups.length === 0) {
    console.log('❌ No backups found');
    console.log('\n💡 Create a backup first:');
    console.log('   cd server');
    console.log('   node scripts/backup.js create');
    return;
  }
  
  console.log('📋 Available backups:');
  backups.forEach((backup, index) => {
    console.log(`\n${index + 1}. ${backup.name}`);
    console.log(`   📅 Created: ${new Date(backup.timestamp).toLocaleString()}`);
    console.log(`   📊 Size: ${backup.size}`);
    if (backup.collections && backup.collections.blogposts !== undefined) {
      console.log(`   📝 Blog posts: ${backup.collections.blogposts}`);
    }
  });
  
  const choice = await askQuestion('\nSelect backup to restore from (number): ');
  const backupIndex = parseInt(choice) - 1;
  
  if (isNaN(backupIndex) || backupIndex < 0 || backupIndex >= backups.length) {
    console.log('❌ Invalid selection');
    return;
  }
  
  const selectedBackup = backups[backupIndex];
  
  console.log(`\n⚠️  This will restore blog posts from: ${selectedBackup.name}`);
  console.log('   Note: This will merge with existing blog posts (duplicates may occur)');
  
  const confirm = await askQuestion('Continue? (yes/no): ');
  if (confirm.toLowerCase() === 'yes' || confirm.toLowerCase() === 'y') {
    await restoreBlogPostsFromBackup(selectedBackup.path);
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
        console.log('\n💡 Create a backup first:');
        console.log('   cd server');
        console.log('   node scripts/backup.js create');
      } else {
        backups.forEach((backup, index) => {
          console.log(`\n${index + 1}. ${backup.name}`);
          console.log(`   📅 Created: ${new Date(backup.timestamp).toLocaleString()}`);
          console.log(`   📊 Size: ${backup.size}`);
          console.log(`   📁 Path: ${backup.path}`);
          if (backup.collections && backup.collections.blogposts !== undefined) {
            console.log(`   📝 Blog posts: ${backup.collections.blogposts}`);
          }
        });
      }
      break;
      
    case 'restore':
      if (backupPath) {
        if (fs.existsSync(backupPath)) {
          await restoreBlogPostsFromBackup(backupPath);
        } else {
          console.error('❌ Backup path not found:', backupPath);
        }
      } else {
        await interactiveRestore();
      }
      break;
      
    default:
      console.log('Usage:');
      console.log('  node scripts/recover-blog-posts.js list                    - List available backups');
      console.log('  node scripts/recover-blog-posts.js restore                 - Interactive restore');
      console.log('  node scripts/recover-blog-posts.js restore <backup-path>   - Restore from specific backup');
      console.log('\nExample:');
      console.log('  node scripts/recover-blog-posts.js restore ../backups/backup-2024-01-01T00-00-00-000Z');
      break;
  }
  
  await mongoose.connection.close();
  console.log('\n✅ Database connection closed');
};

// Handle errors
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled rejection:', err);
  process.exit(1);
});

main();

