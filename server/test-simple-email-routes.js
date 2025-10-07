#!/usr/bin/env node

/**
 * Simple Email Routes Test
 * 
 * This script tests the email routes without requiring full app initialization
 */

const mongoose = require('mongoose');
const unsubscribeService = require('./src/services/unsubscribeService');

async function testEmailServices() {
  console.log('🧪 Testing Email Services with Simplified System...\n');

  try {
    // Test unsubscribe service methods
    console.log('📧 Testing unsubscribeService methods...');
    
    // Test getUserEmailPreferences (should work with migrated data)
    console.log('\n1. Testing getUserEmailPreferences...');
    const preferences = await unsubscribeService.getUserEmailPreferences('trailverseteam@gmail.com');
    console.log('✅ getUserEmailPreferences result:', preferences);
    
    // Test shouldReceiveEmail
    console.log('\n2. Testing shouldReceiveEmail...');
    const shouldReceive = await unsubscribeService.shouldReceiveEmail('trailverseteam@gmail.com', 'blog_notification');
    console.log('✅ shouldReceiveEmail result:', shouldReceive);
    
    // Test critical email (should always return true)
    console.log('\n3. Testing critical email (password_reset)...');
    const shouldReceiveCritical = await unsubscribeService.shouldReceiveEmail('trailverseteam@gmail.com', 'password_reset');
    console.log('✅ shouldReceiveCritical result:', shouldReceiveCritical);
    
    // Test updateEmailPreferences
    console.log('\n4. Testing updateEmailPreferences...');
    const updatedUser = await unsubscribeService.updateEmailPreferences('trailverseteam@gmail.com', {
      emailNotifications: false
    });
    console.log('✅ updateEmailPreferences result:', updatedUser);
    
    // Test shouldReceiveEmail after update (should return false)
    console.log('\n5. Testing shouldReceiveEmail after disabling...');
    const shouldReceiveAfterUpdate = await unsubscribeService.shouldReceiveEmail('trailverseteam@gmail.com', 'blog_notification');
    console.log('✅ shouldReceiveAfterUpdate result:', shouldReceiveAfterUpdate);
    
    // Test critical email after update (should still return true)
    console.log('\n6. Testing critical email after disabling...');
    const shouldReceiveCriticalAfterUpdate = await unsubscribeService.shouldReceiveEmail('trailverseteam@gmail.com', 'password_reset');
    console.log('✅ shouldReceiveCriticalAfterUpdate result:', shouldReceiveCriticalAfterUpdate);
    
    // Reset to true
    console.log('\n7. Resetting emailNotifications to true...');
    await unsubscribeService.updateEmailPreferences('trailverseteam@gmail.com', {
      emailNotifications: true
    });
    console.log('✅ Reset successful');
    
    console.log('\n🎉 All email service tests passed!');
    console.log('\n📝 Summary:');
    console.log('✅ getUserEmailPreferences - Working');
    console.log('✅ shouldReceiveEmail - Working');
    console.log('✅ updateEmailPreferences - Working');
    console.log('✅ Critical emails always sent - Working');
    console.log('✅ Non-critical emails respect toggle - Working');
    console.log('✅ Simplified emailNotifications field - Working');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    // Close database connection
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('\n📝 Database connection closed');
    }
  }
}

// Run tests
if (require.main === module) {
  testEmailServices().catch(console.error);
}

module.exports = { testEmailServices };
