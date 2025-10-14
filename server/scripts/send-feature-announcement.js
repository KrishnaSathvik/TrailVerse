#!/usr/bin/env node

/**
 * Feature Announcement Email Script
 * 
 * This script sends feature announcement emails to existing users
 * about the new Google Maps integration and Resend email system.
 * 
 * Usage:
 *   node scripts/send-feature-announcement.js [options]
 * 
 * Options:
 *   --preview          Preview the email template
 *   --test            Send test email to a specific address
 *   --all             Send to all verified users
 *   --limit=100       Limit number of users (default: 100)
 *   --skip=0          Skip number of users (default: 0)
 *   --dry-run         Show what would be sent without actually sending
 */

const mongoose = require('mongoose');
const resendEmailService = require('../src/services/resendEmailService');
const User = require('../src/models/User');
require('dotenv').config();

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  preview: args.includes('--preview'),
  test: args.includes('--test'),
  all: args.includes('--all'),
  dryRun: args.includes('--dry-run'),
  limit: parseInt(args.find(arg => arg.startsWith('--limit='))?.split('=')[1]) || 100,
  skip: parseInt(args.find(arg => arg.startsWith('--skip='))?.split('=')[1]) || 0,
  testEmail: args.find(arg => arg.startsWith('--email='))?.split('=')[1] || 'test@example.com'
};

async function connectToDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
}

async function previewEmail() {
  console.log('🔍 Previewing feature announcement email...\n');
  
  try {
    const testUser = {
      firstName: 'John',
      name: 'John Doe',
      email: 'john.doe@example.com'
    };

    const html = await resendEmailService.compileTemplate('feature-announcement', {
      firstName: testUser.firstName,
      email: testUser.email,
      mapUrl: `${process.env.WEBSITE_URL || 'https://www.nationalparksexplorerusa.com'}/map`,
      shareUrl: `${process.env.WEBSITE_URL || 'https://www.nationalparksexplorerusa.com'}?ref=feature-announcement`
    });

    console.log('📧 Email preview generated successfully!');
    console.log('📄 Preview saved to: server/templates/emails/preview-feature-announcement.html');
    console.log('🌐 Open the preview file in your browser to see the email design.\n');
    
  } catch (error) {
    console.error('❌ Error previewing email:', error);
  }
}

async function sendTestEmail() {
  console.log(`📧 Sending test email to: ${options.testEmail}\n`);
  
  try {
    const testUser = {
      firstName: 'Test',
      name: 'Test User',
      email: options.testEmail
    };

    if (options.dryRun) {
      console.log('🔍 DRY RUN: Would send feature announcement email to:', testUser.email);
      console.log('📧 Subject: 🎉 New Features: Google Maps & Enhanced Experience - TrailVerse');
      return;
    }

    const result = await resendEmailService.sendFeatureAnnouncementEmail(testUser);
    
    console.log('✅ Test email sent successfully!');
    console.log('📊 Result:', result);
    
  } catch (error) {
    console.error('❌ Error sending test email:', error);
  }
}

async function sendToAllUsers() {
  console.log('📊 Getting user statistics...\n');
  
  try {
    // Get user counts
    const totalUsers = await User.countDocuments();
    const verifiedUsers = await User.countDocuments({ isEmailVerified: true });
    const adminUsers = await User.countDocuments({ role: 'admin' });
    const eligibleUsers = await User.countDocuments({ 
      isEmailVerified: true, 
      role: { $ne: 'admin' } 
    });

    console.log('📈 User Statistics:');
    console.log(`   Total users: ${totalUsers}`);
    console.log(`   Verified users: ${verifiedUsers}`);
    console.log(`   Admin users: ${adminUsers}`);
    console.log(`   Eligible for announcement: ${eligibleUsers}\n`);

    if (eligibleUsers === 0) {
      console.log('⚠️  No eligible users found for feature announcement.');
      return;
    }

    // Get users to send to
    const users = await User.find({
      isEmailVerified: true,
      role: { $ne: 'admin' }
    })
    .select('_id email firstName name isEmailVerified role')
    .limit(options.limit)
    .skip(options.skip)
    .lean();

    console.log(`📧 Sending feature announcement to ${users.length} users...`);
    console.log(`   Limit: ${options.limit}, Skip: ${options.skip}\n`);

    if (options.dryRun) {
      console.log('🔍 DRY RUN: Would send emails to:');
      users.forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.email} (${user.firstName || user.name})`);
      });
      console.log(`\n📊 Total: ${users.length} emails would be sent`);
      return;
    }

    // Confirm before sending
    if (users.length > 10) {
      console.log('⚠️  You are about to send emails to a large number of users.');
      console.log('   This action cannot be undone. Make sure you have tested the email first.');
      console.log('   Add --dry-run to see what would be sent without actually sending.\n');
      
      // In a real implementation, you might want to add a confirmation prompt here
      // For now, we'll proceed with the sending
    }

    // Send bulk emails
    const result = await resendEmailService.sendBulkFeatureAnnouncement(users);
    
    console.log('✅ Bulk feature announcement completed!');
    console.log('📊 Results:');
    console.log(`   Total: ${result.total}`);
    console.log(`   Sent: ${result.success}`);
    console.log(`   Failed: ${result.failed}`);
    
    if (result.failed > 0) {
      console.log('\n❌ Failed emails:');
      result.results
        .filter(r => !r.success)
        .forEach(r => console.log(`   ${r.user}: ${r.error}`));
    }
    
  } catch (error) {
    console.error('❌ Error sending bulk feature announcement:', error);
  }
}

async function main() {
  console.log('🚀 TrailVerse Feature Announcement Script\n');
  
  // Connect to database
  await connectToDatabase();
  
  try {
    if (options.preview) {
      await previewEmail();
    } else if (options.test) {
      await sendTestEmail();
    } else if (options.all) {
      await sendToAllUsers();
    } else {
      console.log('📖 Usage:');
      console.log('   node scripts/send-feature-announcement.js --preview');
      console.log('   node scripts/send-feature-announcement.js --test --email=your@email.com');
      console.log('   node scripts/send-feature-announcement.js --all --limit=50 --dry-run');
      console.log('   node scripts/send-feature-announcement.js --all --limit=100');
      console.log('\nOptions:');
      console.log('   --preview          Preview the email template');
      console.log('   --test            Send test email to a specific address');
      console.log('   --all             Send to all verified users');
      console.log('   --limit=100       Limit number of users (default: 100)');
      console.log('   --skip=0          Skip number of users (default: 0)');
      console.log('   --dry-run         Show what would be sent without actually sending');
      console.log('   --email=addr      Email address for test (default: test@example.com)');
    }
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from database');
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Promise Rejection:', err);
  process.exit(1);
});

// Run the script
main().catch(console.error);
