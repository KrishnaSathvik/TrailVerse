/**
 * Migration Script: Consolidate Review and ParkReview Collections
 * 
 * This script migrates data from the legacy Review collection to the ParkReview collection
 * and provides options to remove the duplicate Review collection.
 * 
 * Usage:
 *   node scripts/migrate-reviews.js [options]
 * 
 * Options:
 *   --dry-run    Show what would be migrated without making changes
 *   --delete     Delete legacy Review collection after successful migration
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Review = require('../src/models/Review');
const ParkReview = require('../src/models/ParkReview');

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const shouldDelete = args.includes('--delete');

async function migrateReviews() {
  console.log('\n🔄 Review Collection Migration Tool\n');
  console.log('====================================\n');
  
  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }
  
  try {
    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB\n');

    // Get statistics
    const legacyCount = await Review.countDocuments();
    const modernCount = await ParkReview.countDocuments();
    
    console.log('📊 Current Statistics:');
    console.log(`   Legacy Reviews (Review):     ${legacyCount}`);
    console.log(`   Modern Reviews (ParkReview): ${modernCount}\n`);
    
    if (legacyCount === 0) {
      console.log('✅ No legacy reviews to migrate. Migration complete!\n');
      process.exit(0);
    }

    // Fetch all legacy reviews
    console.log(`🔍 Analyzing ${legacyCount} legacy reviews...`);
    const legacyReviews = await Review.find({})
      .populate('user', 'name')
      .lean();
    
    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errors = [];

    console.log('\n📝 Migration Plan:');
    console.log('─'.repeat(50));
    
    for (const legacyReview of legacyReviews) {
      try {
        // Check if review already exists in ParkReview collection
        const exists = await ParkReview.findOne({
          parkCode: legacyReview.park.parkCode,
          userId: legacyReview.user._id || legacyReview.user
        });

        if (exists) {
          console.log(`⏭️  Skipped: Review for ${legacyReview.park.parkCode} by ${legacyReview.userName} (already exists in ParkReview)`);
          skippedCount++;
          continue;
        }

        // Map legacy review to modern ParkReview format
        const modernReview = {
          parkCode: legacyReview.park.parkCode,
          userId: legacyReview.user._id || legacyReview.user,
          userName: legacyReview.userName,
          rating: legacyReview.rating,
          title: legacyReview.title,
          comment: legacyReview.content,
          visitYear: legacyReview.visitDate ? new Date(legacyReview.visitDate).getFullYear() : new Date().getFullYear(),
          visitDuration: 'Day Trip', // Default value as legacy doesn't have this
          activities: [], // Legacy reviews don't have activities
          highlights: [], // Legacy reviews don't have highlights
          challenges: [], // Legacy reviews don't have challenges
          photos: legacyReview.images?.map(url => ({ url, caption: '' })) || [],
          helpfulVotes: legacyReview.helpful?.length || 0,
          notHelpfulVotes: 0, // Legacy reviews don't track this
          verified: false,
          status: 'approved', // Assume all legacy reviews are approved
          createdAt: legacyReview.createdAt,
          updatedAt: legacyReview.updatedAt
        };

        if (!isDryRun) {
          // Create new ParkReview
          await ParkReview.create(modernReview);
        }

        console.log(`✅ Migrated: ${legacyReview.park.parkName} - "${legacyReview.title}" by ${legacyReview.userName}`);
        migratedCount++;
        
      } catch (error) {
        console.error(`❌ Error migrating review ${legacyReview._id}: ${error.message}`);
        errors.push({
          reviewId: legacyReview._id,
          parkCode: legacyReview.park.parkCode,
          error: error.message
        });
        errorCount++;
      }
    }

    // Summary
    console.log('\n');
    console.log('=' .repeat(50));
    console.log('📊 Migration Summary\n');
    console.log(`   Total Legacy Reviews:  ${legacyCount}`);
    console.log(`   ✅ Migrated:           ${migratedCount}`);
    console.log(`   ⏭️  Skipped (existing): ${skippedCount}`);
    console.log(`   ❌ Errors:             ${errorCount}`);
    console.log('=' .repeat(50));
    console.log('');

    if (errorCount > 0) {
      console.log('\n⚠️  Migration completed with errors:');
      errors.forEach((err, idx) => {
        console.log(`   ${idx + 1}. Review ${err.reviewId} (${err.parkCode}): ${err.error}`);
      });
      console.log('');
    }

    // Verify migration
    if (!isDryRun && migratedCount > 0) {
      console.log('\n🔍 Verifying migration...');
      const newTotalCount = await ParkReview.countDocuments();
      console.log(`✅ ParkReview collection now has ${newTotalCount} reviews\n`);
    }

    // Handle deletion of legacy collection
    if (shouldDelete && !isDryRun && errorCount === 0) {
      console.log('🗑️  Deleting legacy Review collection...');
      const deleteResult = await Review.deleteMany({});
      console.log(`✅ Deleted ${deleteResult.deletedCount} legacy reviews\n`);
      
      // Drop the collection
      await mongoose.connection.dropCollection('reviews');
      console.log('✅ Dropped legacy Review collection\n');
    } else if (shouldDelete && errorCount > 0) {
      console.log('⚠️  Skipping deletion due to migration errors. Please fix errors and run again.\n');
    } else if (shouldDelete && isDryRun) {
      console.log('ℹ️  Would delete legacy Review collection (dry-run mode)\n');
    }

    // Recommendations
    console.log('\n💡 Next Steps:\n');
    if (isDryRun) {
      console.log('   1. Review the migration plan above');
      console.log('   2. Run without --dry-run to perform migration:');
      console.log('      node scripts/migrate-reviews.js\n');
    } else if (!shouldDelete) {
      console.log('   1. Verify that all reviews migrated correctly');
      console.log('   2. Update frontend to use ParkReview API endpoints');
      console.log('   3. Run migration again with --delete flag:');
      console.log('      node scripts/migrate-reviews.js --delete\n');
    } else {
      console.log('   1. Update frontend code to remove Review model references');
      console.log('   2. Remove Review model file: server/src/models/Review.js');
      console.log('   3. Update routes to use only ParkReview endpoints\n');
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('📡 Disconnected from MongoDB\n');
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n\n⚠️  Migration interrupted by user');
  await mongoose.disconnect();
  process.exit(0);
});

// Run migration
migrateReviews()
  .then(() => {
    console.log('✅ Migration completed successfully!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });

