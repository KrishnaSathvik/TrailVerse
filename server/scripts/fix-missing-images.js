/**
 * Script to fix blog posts with missing images
 * 
 * This script:
 * 1. Finds blog posts with images that return 404
 * 2. Sets them to use the default image
 * 
 * Usage:
 *   node server/scripts/fix-missing-images.js [--dry-run]
 * 
 * Options:
 *   --dry-run: Only show what would be changed without updating
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const BlogPost = require('../src/models/BlogPost');

const API_BASE_URL = process.env.API_URL || 'https://trailverse.onrender.com';
const DEFAULT_IMAGE = 'https://www.nationalparksexplorerusa.com/og-image-trailverse.jpg';

// Normalize image URL (same logic as prerender.js)
function normalizeImageUrl(imageUrl, apiBaseUrl = API_BASE_URL) {
  if (!imageUrl || imageUrl.trim() === '') {
    return null;
  }
  
  if (imageUrl.startsWith('data:image/')) {
    return null;
  }
  
  if (imageUrl.includes('/uploads/')) {
    const filePath = imageUrl.split('/uploads/')[1];
    if (filePath) {
      return `${apiBaseUrl}/api/images/file/${filePath}`;
    }
  }
  
  if (imageUrl.startsWith('https://')) {
    return imageUrl;
  }
  
  if (imageUrl.startsWith('http://')) {
    return imageUrl.replace(/^http:\/\//i, 'https://');
  }
  
  if (imageUrl.startsWith('/api/images/file/')) {
    return `${apiBaseUrl}${imageUrl}`;
  }
  
  if (imageUrl.startsWith('/uploads/')) {
    const filePath = imageUrl.replace('/uploads/', '');
    return `${apiBaseUrl}/api/images/file/${filePath}`;
  }
  
  return null;
}

// Test if image URL is accessible
async function testImageUrl(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch (error) {
    return false;
  }
}

// Process a single blog post
async function processBlogPost(post, options = {}) {
  const { dryRun = false } = options;
  
  console.log(`\n📝 Processing: "${post.title}" (${post.slug})`);
  console.log(`   Current featuredImage: ${post.featuredImage || 'null'}`);
  
  if (!post.featuredImage) {
    console.log(`   ⚠️  No featured image, setting to default`);
    if (!dryRun) {
      post.featuredImage = DEFAULT_IMAGE;
      await post.save();
      console.log(`   ✅ Updated to default image`);
    } else {
      console.log(`   🔍 [DRY RUN] Would update to: ${DEFAULT_IMAGE}`);
    }
    return { processed: true, skipped: false };
  }
  
  // Normalize the image URL
  const normalizedUrl = normalizeImageUrl(post.featuredImage, API_BASE_URL);
  
  if (!normalizedUrl) {
    console.log(`   ⚠️  Could not normalize URL, setting to default`);
    if (!dryRun) {
      post.featuredImage = DEFAULT_IMAGE;
      await post.save();
      console.log(`   ✅ Updated to default image`);
    } else {
      console.log(`   🔍 [DRY RUN] Would update to: ${DEFAULT_IMAGE}`);
    }
    return { processed: true, skipped: false };
  }
  
  console.log(`   Testing: ${normalizedUrl}`);
  
  // Test if image is accessible
  const isAccessible = await testImageUrl(normalizedUrl);
  
  if (!isAccessible) {
    console.log(`   ❌ Image is NOT accessible (404), setting to default`);
    if (!dryRun) {
      post.featuredImage = DEFAULT_IMAGE;
      await post.save();
      console.log(`   ✅ Updated to default image`);
    } else {
      console.log(`   🔍 [DRY RUN] Would update to: ${DEFAULT_IMAGE}`);
    }
    return { processed: true, skipped: false };
  } else {
    console.log(`   ✅ Image is accessible, no changes needed`);
    return { processed: false, skipped: true };
  }
}

// Main function
async function fixMissingImages() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  
  console.log('🚀 Starting missing image fix...');
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
    
    // Find all published blog posts
    console.log('\n🔍 Finding all published blog posts...');
    const posts = await BlogPost.find({ status: 'published' });
    
    console.log(`✅ Found ${posts.length} published blog post(s)`);
    
    if (posts.length === 0) {
      console.log('\n✅ No blog posts found!');
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
    console.log('📊 Fix Summary:');
    console.log(`   Processed: ${results.processed}`);
    console.log(`   Skipped: ${results.skipped}`);
    console.log(`   Errors: ${results.errors}`);
    console.log(`   Total: ${posts.length}`);
    
    if (dryRun) {
      console.log('\n⚠️  This was a DRY RUN. No changes were made.');
      console.log('   Run without --dry-run to apply changes.');
    } else {
      console.log('\n✅ Fix completed!');
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
fixMissingImages();

