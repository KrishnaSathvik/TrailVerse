#!/usr/bin/env node

/**
 * Email System Setup Script
 * 
 * This script helps set up and test the enhanced email system
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Setting up Enhanced Email System for TrailVerse\n');

// Check if Redis is installed
function checkRedis() {
  try {
    const output = execSync('redis-cli ping', { encoding: 'utf8' });
    if (output.trim() === 'PONG') {
      console.log('✅ Redis is running');
      return true;
    }
  } catch (error) {
    console.log('❌ Redis is not running or not installed');
    return false;
  }
}

// Check environment variables
function checkEnvironment() {
  const requiredVars = [
    'EMAIL_USER',
    'EMAIL_PASS',
    'JWT_SECRET',
    'MONGODB_URI'
  ];

  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.log('❌ Missing required environment variables:');
    missing.forEach(varName => console.log(`   - ${varName}`));
    return false;
  }

  console.log('✅ Required environment variables are set');
  return true;
}

// Test email queue connection
async function testEmailQueue() {
  try {
    const { getQueueStats } = require('../src/services/emailQueue');
    const stats = await getQueueStats();
    console.log('✅ Email queue is working');
    console.log(`   Queue stats: ${JSON.stringify(stats, null, 2)}`);
    return true;
  } catch (error) {
    console.log('❌ Email queue test failed:', error.message);
    return false;
  }
}

// Test email service
async function testEmailService() {
  try {
    const emailService = require('../src/services/enhancedEmailService');
    console.log('✅ Enhanced email service is loaded');
    return true;
  } catch (error) {
    console.log('❌ Enhanced email service test failed:', error.message);
    return false;
  }
}

// Test unsubscribe service
async function testUnsubscribeService() {
  try {
    const unsubscribeService = require('../src/services/unsubscribeService');
    console.log('✅ Unsubscribe service is loaded');
    return true;
  } catch (error) {
    console.log('❌ Unsubscribe service test failed:', error.message);
    return false;
  }
}

// Generate test email preview
async function generateTestPreview() {
  try {
    const { generatePreview } = require('../preview-blog-email');
    const previewPath = await generatePreview();
    console.log(`✅ Test email preview generated: ${previewPath}`);
    return true;
  } catch (error) {
    console.log('❌ Failed to generate test preview:', error.message);
    return false;
  }
}

// Main setup function
async function main() {
  console.log('📋 Running email system checks...\n');

  const checks = [
    { name: 'Redis Connection', fn: checkRedis },
    { name: 'Environment Variables', fn: checkEnvironment },
    { name: 'Email Queue', fn: testEmailQueue },
    { name: 'Enhanced Email Service', fn: testEmailService },
    { name: 'Unsubscribe Service', fn: testUnsubscribeService },
    { name: 'Email Preview', fn: generateTestPreview }
  ];

  let passed = 0;
  let failed = 0;

  for (const check of checks) {
    try {
      const result = await check.fn();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${check.name} failed:`, error.message);
      failed++;
    }
    console.log('');
  }

  console.log('📊 Setup Summary:');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);

  if (failed === 0) {
    console.log('\n🎉 Email system setup complete!');
    console.log('\n📝 Next steps:');
    console.log('1. Start your server: npm run dev');
    console.log('2. Test by creating a blog post');
    console.log('3. Check queue stats: curl http://localhost:5001/api/email/queue/stats');
    console.log('4. View email preview in your browser');
  } else {
    console.log('\n⚠️  Some checks failed. Please review the issues above.');
    console.log('\n📖 For help, see: EMAIL_SYSTEM_SETUP.md');
  }

  // Installation instructions if Redis is missing
  if (!checkRedis()) {
    console.log('\n🔧 Redis Installation Instructions:');
    console.log('macOS: brew install redis && brew services start redis');
    console.log('Ubuntu: sudo apt install redis-server && sudo systemctl start redis');
    console.log('Windows: docker run -d -p 6379:6379 redis:alpine');
    console.log('Or use Redis Cloud: https://redis.com/redis-enterprise-cloud/overview/');
  }
}

// Run setup
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
