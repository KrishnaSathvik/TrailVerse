require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

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
    console.log('✅ MongoDB connected for migration');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const createMigrationsDirectory = () => {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true });
  }
  return migrationsDir;
};

const getMigrationFiles = () => {
  const migrationsDir = createMigrationsDirectory();
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }
  
  return fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.js'))
    .sort();
};

const createMigration = (name) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${timestamp}-${name}.js`;
  const migrationsDir = createMigrationsDirectory();
  const filepath = path.join(migrationsDir, filename);
  
  const template = `// Migration: ${name}
// Created: ${new Date().toISOString()}

const up = async (db) => {
  // Write your migration logic here
  console.log('Running migration: ${name}');
  
  // Example: Add a new field to users collection
  // await db.collection('users').updateMany(
  //   {},
  //   { $set: { newField: 'defaultValue' } }
  // );
  
  console.log('✅ Migration completed: ${name}');
};

const down = async (db) => {
  // Write your rollback logic here
  console.log('Rolling back migration: ${name}');
  
  // Example: Remove the field added in up()
  // await db.collection('users').updateMany(
  //   {},
  //   { $unset: { newField: '' } }
  // );
  
  console.log('✅ Rollback completed: ${name}');
};

module.exports = {
  up,
  down,
  name: '${name}',
  timestamp: '${timestamp}'
};
`;
  
  fs.writeFileSync(filepath, template);
  console.log(`✅ Migration created: ${filename}`);
  return filepath;
};

const runMigration = async (migrationFile) => {
  try {
    const migration = require(migrationFile);
    console.log(`🔄 Running migration: ${migration.name}`);
    
    await migration.up(mongoose.connection.db);
    
    // Record migration in database
    await mongoose.connection.db.collection('migrations').insertOne({
      name: migration.name,
      timestamp: migration.timestamp,
      file: path.basename(migrationFile),
      appliedAt: new Date(),
      status: 'completed'
    });
    
    console.log(`✅ Migration completed: ${migration.name}`);
  } catch (error) {
    console.error(`❌ Migration failed: ${error.message}`);
    
    // Record failed migration
    try {
      const migration = require(migrationFile);
      await mongoose.connection.db.collection('migrations').insertOne({
        name: migration.name,
        timestamp: migration.timestamp,
        file: path.basename(migrationFile),
        appliedAt: new Date(),
        status: 'failed',
        error: error.message
      });
    } catch (recordError) {
      console.error('Failed to record migration error:', recordError);
    }
    
    throw error;
  }
};

const rollbackMigration = async (migrationFile) => {
  try {
    const migration = require(migrationFile);
    console.log(`🔄 Rolling back migration: ${migration.name}`);
    
    await migration.down(mongoose.connection.db);
    
    // Remove migration record
    await mongoose.connection.db.collection('migrations').deleteOne({
      file: path.basename(migrationFile)
    });
    
    console.log(`✅ Rollback completed: ${migration.name}`);
  } catch (error) {
    console.error(`❌ Rollback failed: ${error.message}`);
    throw error;
  }
};

const getAppliedMigrations = async () => {
  try {
    const migrations = await mongoose.connection.db.collection('migrations')
      .find({})
      .sort({ appliedAt: 1 })
      .toArray();
    return migrations;
  } catch (error) {
    // If migrations collection doesn't exist, return empty array
    return [];
  }
};

const getPendingMigrations = async () => {
  const allMigrations = getMigrationFiles();
  const appliedMigrations = await getAppliedMigrations();
  const appliedFiles = appliedMigrations.map(m => m.file);
  
  return allMigrations.filter(file => !appliedFiles.includes(file));
};

const runAllPendingMigrations = async () => {
  const pendingMigrations = await getPendingMigrations();
  
  if (pendingMigrations.length === 0) {
    console.log('✅ No pending migrations');
    return;
  }
  
  console.log(`🔄 Running ${pendingMigrations.length} pending migrations...`);
  
  const migrationsDir = createMigrationsDirectory();
  
  for (const migrationFile of pendingMigrations) {
    const filepath = path.join(migrationsDir, migrationFile);
    await runMigration(filepath);
  }
  
  console.log('✅ All migrations completed');
};

const listMigrations = async () => {
  const allMigrations = getMigrationFiles();
  const appliedMigrations = await getAppliedMigrations();
  const appliedFiles = appliedMigrations.map(m => m.file);
  
  console.log('📋 Migration Status:');
  console.log('');
  
  if (allMigrations.length === 0) {
    console.log('No migrations found');
    return;
  }
  
  const migrationsDir = createMigrationsDirectory();
  
  for (const migrationFile of allMigrations) {
    const filepath = path.join(migrationsDir, migrationFile);
    const migration = require(filepath);
    const isApplied = appliedFiles.includes(migrationFile);
    const status = isApplied ? '✅ Applied' : '⏳ Pending';
    
    console.log(`${status} ${migrationFile}`);
    console.log(`   Name: ${migration.name}`);
    console.log(`   Created: ${migration.timestamp}`);
    
    if (isApplied) {
      const appliedMigration = appliedMigrations.find(m => m.file === migrationFile);
      console.log(`   Applied: ${appliedMigration.appliedAt.toLocaleString()}`);
      if (appliedMigration.status === 'failed') {
        console.log(`   ❌ Status: Failed - ${appliedMigration.error}`);
      }
    }
    console.log('');
  }
};

const rollbackLastMigration = async () => {
  const appliedMigrations = await getAppliedMigrations();
  
  if (appliedMigrations.length === 0) {
    console.log('❌ No applied migrations to rollback');
    return;
  }
  
  const lastMigration = appliedMigrations[appliedMigrations.length - 1];
  const migrationsDir = createMigrationsDirectory();
  const filepath = path.join(migrationsDir, lastMigration.file);
  
  if (!fs.existsSync(filepath)) {
    console.log(`❌ Migration file not found: ${lastMigration.file}`);
    return;
  }
  
  console.log(`🔄 Rolling back last migration: ${lastMigration.name}`);
  await rollbackMigration(filepath);
};

const main = async () => {
  const command = process.argv[2];
  const name = process.argv[3];
  
  await connectDB();
  
  switch (command) {
    case 'create':
      if (!name) {
        console.log('❌ Migration name required');
        console.log('Usage: node migrate.js create <migration-name>');
        break;
      }
      createMigration(name);
      break;
      
    case 'up':
      await runAllPendingMigrations();
      break;
      
    case 'down':
      await rollbackLastMigration();
      break;
      
    case 'status':
      await listMigrations();
      break;
      
    case 'run':
      if (!name) {
        console.log('❌ Migration file required');
        console.log('Usage: node migrate.js run <migration-file>');
        break;
      }
      const migrationsDir = createMigrationsDirectory();
      const filepath = path.join(migrationsDir, name);
      if (!fs.existsSync(filepath)) {
        console.log(`❌ Migration file not found: ${name}`);
        break;
      }
      await runMigration(filepath);
      break;
      
    case 'rollback':
      if (!name) {
        console.log('❌ Migration file required');
        console.log('Usage: node migrate.js rollback <migration-file>');
        break;
      }
      const rollbackMigrationsDir = createMigrationsDirectory();
      const rollbackFilepath = path.join(rollbackMigrationsDir, name);
      if (!fs.existsSync(rollbackFilepath)) {
        console.log(`❌ Migration file not found: ${name}`);
        break;
      }
      await rollbackMigration(rollbackFilepath);
      break;
      
    default:
      console.log('Database Migration Tool');
      console.log('');
      console.log('Usage:');
      console.log('  node migrate.js create <name>     - Create a new migration');
      console.log('  node migrate.js up                - Run all pending migrations');
      console.log('  node migrate.js down              - Rollback last migration');
      console.log('  node migrate.js status            - Show migration status');
      console.log('  node migrate.js run <file>        - Run specific migration');
      console.log('  node migrate.js rollback <file>   - Rollback specific migration');
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
