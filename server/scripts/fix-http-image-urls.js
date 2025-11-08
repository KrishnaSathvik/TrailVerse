/**
 * Migration script to fix HTTP image URLs to HTTPS
 * 
 * This script:
 * 1. Finds all blog posts with HTTP image URLs
 * 2. Converts them to HTTPS
 * 3. Updates the blog post with the new URL
 * 
 * Usage:
 *   node server/scripts/fix-http-image-urls.js [--dry-run]
 * 
 * Options:
 *   --dry-run: Only show what would be changed without updating
 */

const path = require('path');

// Load .env file from server directory
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const BlogPost = require('../src/models/BlogPost');

// Process a single blog post
async function processBlogPost(post, options = {}) {
  const { dryRun = false } = options;
  
  console.log(`\n📝 Processing: "${post.title}" (${post.slug})`);
  console.log(`   Current featuredImage: ${post.featuredImage ? (post.featuredImage.substring(0, 80) + '...') : 'null'}`);
  
  // Check if featured image is an HTTP URL
  if (!post.featuredImage || !post.featuredImage.startsWith('http://')) {
    console.log(`   ✅ Already HTTPS or no image, skipping`);
    return { processed: false, skipped: true };
  }
  
  // Convert HTTP to HTTPS
  const newImageUrl = post.featuredImage.replace('http://', 'https://');
  console.log(`   🔄 Converting HTTP to HTTPS`);
  console.log(`   → New URL: ${newImageUrl.substring(0, 80)}...`);
  
  // Update the blog post
  if (!dryRun) {
    post.featuredImage = newImageUrl;
    await post.save();
    console.log(`   ✅ Updated successfully`);
  } else {
    console.log(`   🔍 [DRY RUN] Would update to: ${newImageUrl.substring(0, 80)}...`);
  }
  
  return { 
    processed: true, 
    skipped: false,
    oldUrl: post.featuredImage,
    newUrl: newImageUrl
  };
}

// Main migration function
async function migrateHttpImageUrls() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  
  console.log('🚀 Starting HTTP to HTTPS image URL migration...');
  console.log(`   Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (will update database)'}`);
  console.log('═'.repeat(60));
  
  try {
    // Connect to database
    console.log('\n📡 Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to database');
    
    // Find all blog posts with HTTP image URLs
    console.log('\n🔍 Finding blog posts with HTTP image URLs...');
    const posts = await BlogPost.find({
      featuredImage: { $regex: /^http:\/\// }
    });
    
    console.log(`✅ Found ${posts.length} blog post(s) with HTTP image URLs`);
    
    if (posts.length === 0) {
      console.log('\n✅ No blog posts need fixing!');
      await mongoose.connection.close();
      return;
    }
    
    // Process each blog post
    const results = {
      processed: 0,
      skipped: 0,
      errors: 0
    };
    
    for (const post of posts) {
      try {
        const result = await processBlogPost(post, { dryRun });
        if (result.processed) {
          results.processed++;
        } else if (result.skipped) {
          results.skipped++;
        }
      } catch (error) {
        console.error(`   ❌ Error processing post: ${error.message}`);
        results.errors++;
      }
    }
    
    // Summary
    console.log('\n' + '═'.repeat(60));
    console.log('📊 Migration Summary:');
    console.log(`   Processed: ${results.processed}`);
    console.log(`   Skipped: ${results.skipped}`);
    console.log(`   Errors: ${results.errors}`);
    console.log(`   Total: ${posts.length}`);
    
    if (dryRun) {
      console.log('\n⚠️  This was a DRY RUN - no changes were made');
      console.log('   Run without --dry-run to apply changes');
    } else {
      console.log('\n✅ Migration completed!');
    }
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log('\n👋 Database connection closed');
  }
}

// Run migration
migrateHttpImageUrls().catch(console.error);

