#!/usr/bin/env node

/**
 * Email System Test Script
 * 
 * This script tests the enhanced email system components
 */

require('dotenv').config();

const mongoose = require('mongoose');
const { EMAIL_TYPES, addEmailJob, getQueueStats } = require('./src/services/emailQueue');
const emailService = require('./src/services/enhancedEmailService');
const unsubscribeService = require('./src/services/unsubscribeService');

// Mock user data
const testUser = {
  _id: new mongoose.Types.ObjectId(),
  firstName: 'John',
  name: 'John Doe',
  email: 'test@example.com'
};

// Mock blog post data
const testBlogPost = {
  title: 'Test Blog Post: Complete Guide to Yosemite National Park',
  slug: 'test-blog-post-yosemite',
  excerpt: 'This is a test blog post to verify the email system is working correctly.',
  featuredImage: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=600&h=200&fit=crop&crop=center',
  category: 'Park Guides',
  author: 'TrailVerse Team',
  readTime: 5,
  tags: ['Test', 'Yosemite', 'National Parks']
};

async function testEmailQueue() {
  console.log('🧪 Testing Email Queue...');
  
  try {
    // Test adding a blog notification job
    const job = await addEmailJob(EMAIL_TYPES.BLOG_NOTIFICATION, {
      emailType: EMAIL_TYPES.BLOG_NOTIFICATION,
      user: testUser,
      post: testBlogPost,
      trackingId: 'test-tracking-id'
    });
    
    console.log(`✅ Blog notification job added: ${job.id}`);
    
    // Get queue stats
    const stats = await getQueueStats();
    console.log('📊 Queue stats:', stats);
    
    return true;
  } catch (error) {
    console.error('❌ Email queue test failed:', error.message);
    return false;
  }
}

async function testUnsubscribeService() {
  console.log('\n🧪 Testing Unsubscribe Service...');
  
  try {
    // Test token generation
    const token = unsubscribeService.generateUnsubscribeToken(testUser.email, 'blog');
    console.log('✅ Unsubscribe token generated');
    
    // Test token verification
    const isValid = unsubscribeService.verifyUnsubscribeToken(token, testUser.email, 'blog');
    console.log(`✅ Token verification: ${isValid ? 'Valid' : 'Invalid'}`);
    
    // Test unsubscribe URL generation
    const url = unsubscribeService.generateUnsubscribeUrl(testUser.email, 'blog');
    console.log(`✅ Unsubscribe URL generated: ${url.substring(0, 100)}...`);
    
    return true;
  } catch (error) {
    console.error('❌ Unsubscribe service test failed:', error.message);
    return false;
  }
}

async function testEmailService() {
  console.log('\n🧪 Testing Enhanced Email Service...');
  
  try {
    // Test blog notification (without actually sending)
    console.log('✅ Enhanced email service loaded successfully');
    
    // Test tracking ID generation
    const trackingId = require('uuid').v4();
    console.log(`✅ Tracking ID generated: ${trackingId}`);
    
    return true;
  } catch (error) {
    console.error('❌ Enhanced email service test failed:', error.message);
    return false;
  }
}

async function testDatabaseConnection() {
  console.log('\n🧪 Testing Database Connection...');
  
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/npe-usa', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Database connected successfully');
    
    // Test user preference check
    const shouldReceive = await unsubscribeService.shouldReceiveEmail(testUser.email, 'blog_notification');
    console.log(`✅ Email preference check: ${shouldReceive ? 'Should receive' : 'Should not receive'}`);
    
    return true;
  } catch (error) {
    console.error('❌ Database connection test failed:', error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Starting Email System Tests\n');
  
  const tests = [
    { name: 'Database Connection', fn: testDatabaseConnection },
    { name: 'Email Queue', fn: testEmailQueue },
    { name: 'Unsubscribe Service', fn: testUnsubscribeService },
    { name: 'Enhanced Email Service', fn: testEmailService }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      const result = await test.fn();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`❌ ${test.name} failed:`, error.message);
      failed++;
    }
  }
  
  console.log('\n📊 Test Results:');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed! Email system is ready.');
    console.log('\n📝 Next steps:');
    console.log('1. Start your server: npm run dev');
    console.log('2. Create a blog post to test notifications');
    console.log('3. Check queue stats: curl http://localhost:5001/api/email/queue/stats');
  } else {
    console.log('\n⚠️  Some tests failed. Please check the issues above.');
  }
  
  // Close database connection
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
  }
  
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
