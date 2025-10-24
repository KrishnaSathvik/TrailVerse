const mongoose = require('mongoose');
const DailyFeed = require('./src/models/DailyFeed');

// Load environment variables
require('dotenv').config();

async function clearCacheAndData() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const userId = '68e3c993879dc9dd2da10bf1';
    const today = new Date().toISOString().split('T')[0];

    console.log('🗑️ Clearing devteam daily feed data...');
    console.log(`👤 User ID: ${userId}`);
    console.log(`📅 Date: ${today}`);

    // Delete all daily feeds for devteam
    const deleteResult = await DailyFeed.deleteMany({ userId });
    console.log(`🗑️ Deleted ${deleteResult.deletedCount} daily feed(s) for devteam`);

    console.log('\n✅ Database cleaned successfully');
    console.log('🎯 Next API call will generate fresh data with:');
    console.log('  🌅 Accurate sunrise/sunset times');
    console.log('  🌙 Precise moon phase data');
    console.log('  ⭐ Realistic sky conditions');
    console.log('  🤖 AI-generated insights');

    console.log('\n💡 To test:');
    console.log('1. Refresh your browser page');
    console.log('2. The daily feed should now generate fresh data');
    console.log('3. Check the astronomical data for accuracy');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the script
clearCacheAndData();
