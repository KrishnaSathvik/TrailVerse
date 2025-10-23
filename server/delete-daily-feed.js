const mongoose = require('mongoose');
require('dotenv').config();

const DailyFeed = require('./src/models/DailyFeed');

async function deleteDailyFeed() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Delete all daily feed entries for today
    const today = new Date().toISOString().split('T')[0];
    const result = await DailyFeed.deleteMany({ date: today });
    
    console.log(`🗑️ Deleted ${result.deletedCount} daily feed entries for ${today}`);
    
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

deleteDailyFeed();
