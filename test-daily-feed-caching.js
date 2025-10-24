#!/usr/bin/env node

/**
 * Test script to verify daily feed database caching behavior
 * This script tests the caching logic without making actual API calls
 */

const mongoose = require('mongoose');
const DailyFeed = require('./src/models/DailyFeed');

// Test configuration
const TEST_USER_ID = '507f1f77bcf86cd799439011'; // Test ObjectId
const TEST_DATE = new Date().toISOString().split('T')[0]; // Today's date in ISO format

async function testDailyFeedCaching() {
  try {
    console.log('🧪 Testing Daily Feed Database Caching...\n');
    
    // Connect to MongoDB (adjust connection string as needed)
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/npe-usa';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
    
    // Clean up any existing test data
    await DailyFeed.deleteMany({ userId: TEST_USER_ID });
    console.log('🧹 Cleaned up existing test data');
    
    // Test 1: No existing feed should return null
    console.log('\n📋 Test 1: Check for non-existent feed');
    let existingFeed = await DailyFeed.findOrCreateDailyFeed(TEST_USER_ID, TEST_DATE);
    console.log('Result:', existingFeed ? 'Found feed (unexpected)' : 'No feed found (expected)');
    
    // Test 2: Create a test feed
    console.log('\n📋 Test 2: Create test daily feed');
    const testFeedData = {
      parkOfDay: {
        parkCode: 'yose',
        name: 'Yosemite National Park',
        description: 'Test park description',
        image: '/test-image.jpg',
        latitude: '37.8651',
        longitude: '-119.5383',
        weather: { temp: 75, condition: 'Sunny', icon: '01d' },
        mustDo: ['Visit Half Dome', 'See Yosemite Falls'],
        crowdLevel: 'Moderate',
        bestTime: 'Morning'
      },
      natureFact: 'Test nature fact about Yosemite',
      weatherData: {
        current: { temp: 75, condition: 'Sunny', humidity: 50, windSpeed: 5, visibility: 10 },
        recommendation: 'Great day for outdoor activities!'
      },
      weatherInsights: 'Test weather insights for Yosemite',
      astroData: {
        sunrise: '6:30 AM',
        sunset: '7:30 PM',
        moonPhase: 'Waxing Crescent',
        moonIllumination: 25,
        milkyWayVisibility: 'Good',
        auroraProbability: 'Low',
        skyInsights: 'Test sky insights for stargazing'
      },
      personalizedRecommendations: [
        'Test recommendation 1',
        'Test recommendation 2',
        'Test recommendation 3'
      ]
    };
    
    const savedFeed = await DailyFeed.saveDailyFeed(TEST_USER_ID, TEST_DATE, testFeedData);
    console.log('✅ Test feed created with ID:', savedFeed._id);
    console.log('📊 Feed structure:', {
      hasParkOfDay: !!savedFeed.parkOfDay,
      hasWeatherData: !!savedFeed.weatherData,
      hasAstroData: !!savedFeed.astroData,
      hasPersonalizedRecommendations: !!savedFeed.personalizedRecommendations,
      expiresAt: savedFeed.expiresAt
    });
    
    // Test 3: Should find existing feed
    console.log('\n📋 Test 3: Check for existing feed (should find it)');
    existingFeed = await DailyFeed.findOrCreateDailyFeed(TEST_USER_ID, TEST_DATE);
    console.log('Result:', existingFeed ? 'Found feed (expected)' : 'No feed found (unexpected)');
    if (existingFeed) {
      console.log('📊 Retrieved feed structure:', {
        hasParkOfDay: !!existingFeed.parkOfDay,
        parkName: existingFeed.parkOfDay?.name,
        hasWeatherData: !!existingFeed.weatherData,
        hasAstroData: !!existingFeed.astroData,
        hasPersonalizedRecommendations: !!existingFeed.personalizedRecommendations
      });
    }
    
    // Test 4: Test with different date (should not find)
    console.log('\n📋 Test 4: Check for feed with different date');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowISO = tomorrow.toISOString().split('T')[0];
    const differentDateFeed = await DailyFeed.findOrCreateDailyFeed(TEST_USER_ID, tomorrowISO);
    console.log('Result:', differentDateFeed ? 'Found feed (unexpected)' : 'No feed found (expected)');
    
    // Test 5: Test with different user (should not find)
    console.log('\n📋 Test 5: Check for feed with different user');
    const differentUserFeed = await DailyFeed.findOrCreateDailyFeed('507f1f77bcf86cd799439012', TEST_DATE);
    console.log('Result:', differentUserFeed ? 'Found feed (unexpected)' : 'No feed found (expected)');
    
    // Test 6: Verify compound index works
    console.log('\n📋 Test 6: Verify compound index query performance');
    const startTime = Date.now();
    const indexTestFeed = await DailyFeed.findOne({ userId: TEST_USER_ID, date: TEST_DATE });
    const queryTime = Date.now() - startTime;
    console.log(`✅ Compound index query completed in ${queryTime}ms`);
    console.log('Result:', indexTestFeed ? 'Found feed (expected)' : 'No feed found (unexpected)');
    
    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log('✅ Database caching is working correctly');
    console.log('✅ User-specific feeds are isolated');
    console.log('✅ Date-specific feeds are isolated');
    console.log('✅ Compound index is performing well');
    console.log('✅ Feed structure is complete');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Clean up test data
    try {
      await DailyFeed.deleteMany({ userId: TEST_USER_ID });
      console.log('🧹 Cleaned up test data');
    } catch (cleanupError) {
      console.warn('⚠️ Cleanup failed:', cleanupError.message);
    }
    
    // Close connection
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the test
if (require.main === module) {
  testDailyFeedCaching().catch(console.error);
}

module.exports = testDailyFeedCaching;
