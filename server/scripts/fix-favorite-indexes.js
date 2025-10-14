/**
 * Fix Favorite Collection Indexes
 * Drops old parkId index and ensures correct parkCode index exists
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load env vars
dotenv.config({ path: './.env' });

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error);
    process.exit(1);
  }
};

const fixIndexes = async () => {
  try {
    const db = mongoose.connection.db;
    const collection = db.collection('favorites');

    console.log('\n📋 Current indexes:');
    const indexes = await collection.indexes();
    indexes.forEach(index => {
      console.log(`  - ${index.name}:`, JSON.stringify(index.key));
    });

    // Drop the old incorrect indexes if they exist
    console.log('\n🔧 Fixing indexes...');
    
    const oldIndexes = ['user_1_parkId_1', 'parkId_1', 'parkId_1_visitStatus_1'];
    
    for (const indexName of oldIndexes) {
      try {
        await collection.dropIndex(indexName);
        console.log(`✅ Dropped old index: ${indexName}`);
      } catch (error) {
        if (error.code === 27) {
          console.log(`ℹ️  Old index ${indexName} does not exist (already dropped)`);
        } else {
          console.log(`⚠️  Error dropping old index ${indexName}:`, error.message);
        }
      }
    }

    // Ensure correct index exists
    try {
      await collection.createIndex(
        { user: 1, parkCode: 1 }, 
        { unique: true, name: 'user_1_parkCode_1' }
      );
      console.log('✅ Created/verified correct index: user_1_parkCode_1');
    } catch (error) {
      if (error.code === 85 || error.code === 86) {
        console.log('ℹ️  Correct index already exists');
      } else {
        console.log('⚠️  Error creating index:', error.message);
      }
    }

    console.log('\n📋 Updated indexes:');
    const newIndexes = await collection.indexes();
    newIndexes.forEach(index => {
      console.log(`  - ${index.name}:`, JSON.stringify(index.key));
    });

    console.log('\n✅ Index fix completed successfully!');
    
  } catch (error) {
    console.error('❌ Error fixing indexes:', error);
    throw error;
  }
};

const run = async () => {
  console.log('🚀 Starting Favorite Index Fix...\n');
  
  await connectDB();
  await fixIndexes();
  
  console.log('\n🎉 All done!');
  process.exit(0);
};

run().catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});

