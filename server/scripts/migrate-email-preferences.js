#!/usr/bin/env node

/**
 * Migration Script: Simplify Email Preferences
 * 
 * This script migrates existing users from complex email preferences
 * to the simplified single emailNotifications toggle
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Connect to MongoDB
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/npe-usa', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

// Migration logic
async function migrateEmailPreferences() {
  try {
    console.log('🔄 Starting email preferences migration...\n');

    // Get all users with old email preferences structure
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
    
    const users = await User.find({
      $or: [
        { emailSubscribed: { $exists: true } },
        { emailPreferences: { $exists: true } }
      ]
    });

    console.log(`📊 Found ${users.length} users to migrate`);

    let migrated = 0;
    let skipped = 0;

    for (const user of users) {
      try {
        const updateData = {};

        // Migrate emailSubscribed to emailNotifications
        if (user.emailSubscribed !== undefined) {
          updateData.emailNotifications = user.emailSubscribed;
          console.log(`📧 User ${user.email}: emailSubscribed (${user.emailSubscribed}) → emailNotifications (${user.emailSubscribed})`);
        }

        // If user has emailPreferences, determine if they should receive emails
        if (user.emailPreferences) {
          // If any email preference is true, set emailNotifications to true
          // Only if ALL preferences are false, set emailNotifications to false
          const hasAnyEnabled = Object.values(user.emailPreferences).some(pref => pref === true);
          updateData.emailNotifications = hasAnyEnabled;
          
          console.log(`📧 User ${user.email}: emailPreferences → emailNotifications (${hasAnyEnabled})`);
          console.log(`   Old preferences:`, user.emailPreferences);
        }

        // Update the user
        await User.findByIdAndUpdate(user._id, { 
          $set: updateData,
          $unset: { 
            emailSubscribed: 1, 
            emailPreferences: 1 
          }
        });

        migrated++;
        console.log(`✅ Migrated user: ${user.email}\n`);

      } catch (error) {
        console.error(`❌ Failed to migrate user ${user.email}:`, error.message);
        skipped++;
      }
    }

    console.log('📊 Migration Summary:');
    console.log(`✅ Successfully migrated: ${migrated} users`);
    console.log(`❌ Failed to migrate: ${skipped} users`);
    console.log(`📧 Total processed: ${users.length} users`);

    // Verify migration
    const remainingOldStructure = await User.find({
      $or: [
        { emailSubscribed: { $exists: true } },
        { emailPreferences: { $exists: true } }
      ]
    });

    if (remainingOldStructure.length === 0) {
      console.log('\n🎉 Migration completed successfully!');
      console.log('✅ All users now have simplified emailNotifications field');
      console.log('✅ Old emailSubscribed and emailPreferences fields removed');
    } else {
      console.log(`\n⚠️  ${remainingOldStructure.length} users still have old structure`);
    }

    // Show new statistics
    const totalUsers = await User.countDocuments();
    const subscribedUsers = await User.countDocuments({ emailNotifications: true });
    const unsubscribedUsers = totalUsers - subscribedUsers;

    console.log('\n📈 New Email Statistics:');
    console.log(`👥 Total users: ${totalUsers}`);
    console.log(`📧 Subscribed users: ${subscribedUsers}`);
    console.log(`🚫 Unsubscribed users: ${unsubscribedUsers}`);
    console.log(`📊 Subscription rate: ${totalUsers > 0 ? (subscribedUsers / totalUsers * 100).toFixed(2) : 0}%`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Main function
async function main() {
  try {
    await connectDB();
    await migrateEmailPreferences();
    
    console.log('\n🎉 Email preferences migration completed!');
    console.log('\n📝 What changed:');
    console.log('✅ Removed: emailSubscribed, emailPreferences');
    console.log('✅ Added: emailNotifications (single boolean)');
    console.log('✅ Logic: If user had ANY email preference enabled, emailNotifications = true');
    console.log('✅ Critical emails (password reset, verification) always sent regardless of setting');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('📝 Database connection closed');
  }
}

// Run migration
if (require.main === module) {
  main();
}

module.exports = { migrateEmailPreferences };
