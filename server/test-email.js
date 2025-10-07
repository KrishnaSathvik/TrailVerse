#!/usr/bin/env node

/**
 * Test script for Gmail SMTP email functionality
 * Run with: node test-email.js
 */

require('dotenv').config({ path: './.env.development' });
const emailService = require('./src/services/emailService');

async function testEmailService() {
  console.log('🧪 Testing Gmail SMTP Email Service...\n');

  // Check if required environment variables are set
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('❌ Missing required environment variables:');
    console.error('   EMAIL_USER and EMAIL_PASS must be set in your .env file');
    console.error('\n📝 Example .env configuration:');
    console.error('   EMAIL_USER=your-email@gmail.com');
    console.error('   EMAIL_PASS=your-gmail-app-password');
    console.error('   EMAIL_FROM_NAME=TrailVerse');
    process.exit(1);
  }

  console.log('✅ Environment variables configured');
  console.log(`📧 From: ${process.env.EMAIL_USER}`);
  console.log(`🏷️  Name: ${process.env.EMAIL_FROM_NAME || 'TrailVerse'}\n`);

  // Test user object
  const testUser = {
    name: 'Krishna',
    firstName: 'Krishna',
    email: 'travelswithkrishna@gmail.com' // Send test email to specific test address
  };

  try {
    console.log('📤 Sending test welcome email...');
    await emailService.sendWelcomeEmail(testUser);
    console.log('✅ Welcome email sent successfully!\n');

    console.log('📤 Sending test password reset email...');
    const resetUrl = `${process.env.WEBSITE_URL || 'https://www.nationalparksexplorerusa.com'}/reset-password?token=test-token`;
    await emailService.sendPasswordReset(testUser, resetUrl);
    console.log('✅ Password reset email sent successfully!\n');

    console.log('📤 Sending test email verification...');
    const verificationUrl = `${process.env.WEBSITE_URL || 'https://www.nationalparksexplorerusa.com'}/verify-email?token=test-token`;
    await emailService.sendEmailVerification(testUser, verificationUrl);
    console.log('✅ Email verification sent successfully!\n');

    console.log('📤 Sending test blog notification...');
    const testBlogPost = {
      title: 'Test Blog Post: Complete Guide to Yellowstone National Park',
      excerpt: 'Discover the wonders of America\'s first national park with our comprehensive guide to Yellowstone. From geysers to wildlife, we\'ve got you covered!',
      featuredImage: 'https://www.nationalparksexplorerusa.com/images/yellowstone-hero.jpg',
      category: 'Travel Guide',
      author: 'TrailVerse Team',
      readTime: 8,
      tags: ['yellowstone', 'national-parks', 'travel-guide', 'hiking'],
      slug: 'complete-guide-yellowstone-national-park'
    };
    await emailService.sendBlogNotification(testUser, testBlogPost);
    console.log('✅ Blog notification sent successfully!\n');

    console.log('🎉 All email tests passed! Check your inbox for the test emails.');
    console.log('\n💡 Tips:');
    console.log('   - Check your spam folder if emails don\'t appear');
    console.log('   - Make sure you\'re using a Gmail App Password, not your regular password');
    console.log('   - App Passwords are required for Gmail SMTP authentication');

  } catch (error) {
    console.error('❌ Email test failed:', error.message);
    console.error('\n🔧 Troubleshooting:');
    console.error('   1. Verify your Gmail App Password is correct');
    console.error('   2. Ensure 2-factor authentication is enabled on your Google account');
    console.error('   3. Check that "Less secure app access" is not required (App Passwords should work)');
    console.error('   4. Verify your EMAIL_USER matches the Gmail account');
    process.exit(1);
  }
}

// Run the test
testEmailService();
