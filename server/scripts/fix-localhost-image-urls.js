/**
 * Script to fix blog posts with localhost image URLs
 * 
 * This script:
 * 1. Finds all blog posts with localhost image URLs
 * 2. Converts them to relative paths (/uploads/...)
 * 3. Updates the blog post with the new URL
 * 
 * Usage:
 *   node server/scripts/fix-localhost-image-urls.js [--dry-run]
 * 
 * Options:
 *   --dry-run: Only show what would be changed without updating
 */

const path = require('path');
// Load .env file from server directory
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const BlogPost = require('../src/models/BlogPost');

// Convert localhost URL to relative path
function convertLocalhostToRelative(url) {
  if (!url || !url.includes('localhost')) {
    return null;
  }
  
  // Extract the path from localhost URL
  // Examples:
  // http://localhost:5001/uploads/general/image.jpg -> /uploads/general/image.jpg
  // https://localhost:5001/uploads/general/image.jpg -> /uploads/general/image.jpg
  // http://localhost:5001/api/images/file/general/image.jpg -> /api/images/file/general/image.jpg
  
  const match = url.match(/localhost[:\d]*\/(.+)/);
  if (match && match[1]) {
    const path = match[1];
    // If it's an API path, keep it as is
    if (path.startsWith('api/images/file/')) {
      return `/${path}`;
    }
    // If it's an uploads path, convert to relative
    if (path.startsWith('uploads/')) {
      return `/${path}`;
    }
    // Otherwise, assume it's uploads
    return `/uploads/${path}`;
  }
  
  return null;
}

// Process a single blog post
async function processBlogPost(post, options = {}) {
  const { dryRun = false } = options;
  
  console.log(`\n📝 Processing: "${post.title}" (${post.slug})`);
  console.log(`   Current featuredImage: ${post.featuredImage ? (post.featuredImage.substring(0, 80) + '...') : 'null'}`);
  
  // Check if featured image contains localhost
  if (!post.featuredImage || !post.featuredImage.includes('localhost')) {
    console.log(`   ✅ No localhost URL, skipping`);
    return { processed: false, skipped: true };
  }
  
  // Convert to relative path
  const newImageUrl = convertLocalhostToRelative(post.featuredImage);
  
  if (!newImageUrl) {
    console.log(`   ⚠️  Could not convert URL, skipping`);
    return { processed: false, skipped: true };
  }
  
  console.log(`   🔄 Converting to: ${newImageUrl}`);
  
  // Update the blog post
  if (!dryRun) {
    post.featuredImage = newImageUrl;
    await post.save();
    console.log(`   ✅ Updated successfully`);
  } else {
    console.log(`   🔍 [DRY RUN] Would update to: ${newImageUrl}`);
  }
  
  return { 
    processed: true, 
    skipped: false,
    oldUrl: post.featuredImage,
    newUrl: newImageUrl
  };
}

// Main migration function
async function migrateLocalhostImageUrls() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  
  console.log('🚀 Starting localhost image URL migration...');
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
    
    // Find all blog posts with localhost image URLs
    console.log('\n🔍 Finding blog posts with localhost image URLs...');
    const posts = await BlogPost.find({
      featuredImage: { $regex: /localhost/ }
    });
    
    console.log(`✅ Found ${posts.length} blog post(s) with localhost image URLs`);
    
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
      console.log('\n⚠️  This was a DRY RUN. No changes were made.');
      console.log('   Run without --dry-run to apply changes.');
    } else {
      console.log('\n✅ Migration completed!');
    }
    
    // Close database connection
    await mongoose.connection.close();
    console.log('✅ Database connection closed');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the script
migrateLocalhostImageUrls();

