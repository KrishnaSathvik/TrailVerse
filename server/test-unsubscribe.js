#!/usr/bin/env node

/**
 * Test script for unsubscribe functionality
 * Run with: node test-unsubscribe.js
 */

require('dotenv').config({ path: './.env.development' });
const unsubscribeService = require('./src/services/unsubscribeService');

async function testUnsubscribeService() {
  console.log('🧪 Testing Unsubscribe Service...\n');

  const testEmail = 'travelswithkrishna@gmail.com';

  try {
    // Test 1: Generate unsubscribe token
    console.log('📝 Test 1: Generating unsubscribe token...');
    const token = unsubscribeService.generateUnsubscribeToken(testEmail);
    console.log(`✅ Token generated: ${token.substring(0, 20)}...`);

    // Test 2: Verify token
    console.log('\n🔍 Test 2: Verifying token...');
    const isValid = unsubscribeService.verifyUnsubscribeToken(token, testEmail);
    console.log(`✅ Token verification: ${isValid ? 'VALID' : 'INVALID'}`);

    // Test 3: Get user preferences
    console.log('\n📧 Test 3: Getting user email preferences...');
    const preferences = await unsubscribeService.getUserEmailPreferences(testEmail);
    console.log(`✅ Preferences:`, preferences);

    // Test 4: Generate unsubscribe URL
    console.log('\n🔗 Test 4: Generating unsubscribe URL...');
    const unsubscribeUrl = unsubscribeService.generateUnsubscribeUrl(testEmail, 'blog_notification');
    console.log(`✅ Unsubscribe URL: ${unsubscribeUrl}`);

    // Test 5: Unsubscribe from all emails
    console.log('\n🚫 Test 5: Unsubscribing from all emails...');
    const unsubscribeResult = await unsubscribeService.unsubscribe(testEmail, 'all', token);
    console.log(`✅ Unsubscribe result:`, unsubscribeResult);

    // Test 6: Get preferences after unsubscribe
    console.log('\n📧 Test 6: Getting preferences after unsubscribe...');
    const updatedPreferences = await unsubscribeService.getUserEmailPreferences(testEmail);
    console.log(`✅ Updated preferences:`, updatedPreferences);

    // Test 7: Resubscribe
    console.log('\n✅ Test 7: Resubscribing...');
    const resubscribeResult = await unsubscribeService.resubscribe(testEmail, {
      blogNotifications: true,
      tripReminders: true,
      parkUpdates: true,
      promotionalEmails: false
    });
    console.log(`✅ Resubscribe result:`, resubscribeResult);

    // Test 8: Get final preferences
    console.log('\n📧 Test 8: Getting final preferences...');
    const finalPreferences = await unsubscribeService.getUserEmailPreferences(testEmail);
    console.log(`✅ Final preferences:`, finalPreferences);

    console.log('\n🎉 All unsubscribe service tests passed!');
    console.log('\n💡 Frontend unsubscribe page is now available at:');
    console.log(`   https://www.nationalparksexplorerusa.com/unsubscribe?email=${encodeURIComponent(testEmail)}`);

  } catch (error) {
    console.error('❌ Unsubscribe test failed:', error.message);
    console.error('\n🔧 Troubleshooting:');
    console.error('   1. Make sure MongoDB is running');
    console.error('   2. Verify your database connection');
    console.error('   3. Check that the user exists in the database');
    process.exit(1);
  }
}

// Run the test
testUnsubscribeService();
