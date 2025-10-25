const mongoose = require('mongoose');
const DailyFeed = require('./src/models/DailyFeed');
require('dotenv').config();

async function checkDailyFeedUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/npe-usa');
    console.log('✅ Connected to MongoDB');
    
    // Count total daily feed documents
    const totalFeeds = await DailyFeed.countDocuments();
    console.log(`📊 Total Daily Feed documents: ${totalFeeds}`);
    
    // Count unique users with daily feeds
    const uniqueUsers = await DailyFeed.distinct('userId');
    console.log(`👥 Unique users with Daily Feeds: ${uniqueUsers.length}`);
    
    // Get some sample data
    const sampleFeeds = await DailyFeed.find({})
      .select('userId date generatedAt parkOfDay.name')
      .sort({ generatedAt: -1 })
      .limit(5);
    
    console.log('\n📅 Recent Daily Feeds:');
    sampleFeeds.forEach((feed, index) => {
      console.log(`${index + 1}. User: ${feed.userId}, Date: ${feed.date}, Park: ${feed.parkOfDay?.name || 'Unknown'}, Generated: ${feed.generatedAt}`);
    });
    
    // Check for today's feeds
    const today = new Date().toISOString().split('T')[0];
    const todayFeeds = await DailyFeed.countDocuments({ date: today });
    console.log(`\n🗓️  Today's Daily Feeds (${today}): ${todayFeeds}`);
    
    // Check feeds by date (last 7 days)
    const last7Days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const count = await DailyFeed.countDocuments({ date: dateStr });
      last7Days.push({ date: dateStr, count });
    }
    
    console.log('\n📈 Daily Feeds by Date (Last 7 Days):');
    last7Days.forEach(day => {
      console.log(`${day.date}: ${day.count} feeds`);
    });
    
    // Check AI content availability
    const feedsWithAI = await DailyFeed.countDocuments({
      $or: [
        { quickStatsInsights: { $exists: true, $ne: [] } },
        { skyDataInsights: { $exists: true, $ne: [] } },
        { parkInfoInsights: { $exists: true, $ne: [] } },
        { weatherInsights: { $exists: true, $ne: null } },
        { personalizedRecommendations: { $exists: true, $ne: [] } },
        { natureFact: { $exists: true, $ne: null } }
      ]
    });
    
    console.log(`\n🤖 Feeds with AI content: ${feedsWithAI}`);
    
    // Check cache expiration
    const expiredFeeds = await DailyFeed.countDocuments({
      expiresAt: { $lt: new Date() }
    });
    console.log(`⏰ Expired feeds (should be auto-deleted): ${expiredFeeds}`);
    
    // Get user details for each user with daily feeds
    console.log('\n👤 User Details:');
    for (const userId of uniqueUsers) {
      const userFeeds = await DailyFeed.find({ userId })
        .select('date parkOfDay.name generatedAt')
        .sort({ generatedAt: -1 });
      
      console.log(`\nUser ${userId}:`);
      console.log(`  - Total feeds: ${userFeeds.length}`);
      console.log(`  - Latest feed: ${userFeeds[0]?.date} (${userFeeds[0]?.parkOfDay?.name || 'Unknown'})`);
      console.log(`  - Generated: ${userFeeds[0]?.generatedAt}`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkDailyFeedUsers();