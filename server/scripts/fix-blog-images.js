/**
 * Migration script to fix existing blog posts with base64 featured images
 * 
 * This script:
 * 1. Finds all blog posts with base64 data URL featured images
 * 2. For each post:
 *    - Tries to extract an image URL from the content HTML
 *    - If no image found in content, sets to default image URL
 * 3. Updates the blog post with the new URL
 * 
 * Usage:
 *   node server/scripts/fix-blog-images.js [--dry-run] [--default-only]
 * 
 * Options:
 *   --dry-run: Only show what would be changed without updating
 *   --default-only: Only set default image, don't try to extract from content
 */

const path = require('path');

// Load .env file from server directory
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const BlogPost = require('../src/models/BlogPost');

// Default image URL to use when no image is found
const DEFAULT_IMAGE_URL = 'https://www.nationalparksexplorerusa.com/og-image-trailverse.jpg';

// Extract image URL from HTML content
function extractImageFromContent(content) {
  if (!content) return null;
  
  // Try to find first <img> tag with src attribute
  const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
  if (imgMatch && imgMatch[1]) {
    const imgUrl = imgMatch[1];
    
    // Skip data URLs
    if (imgUrl.startsWith('data:image/')) {
      return null;
    }
    
    // Return the URL (it might be relative or absolute)
    return imgUrl;
  }
  
  return null;
}

// Convert relative URL to absolute URL
function normalizeImageUrl(url) {
  if (!url) return DEFAULT_IMAGE_URL;
  
  // If already absolute URL, return as is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  
  // If it's an API path, convert to full URL
  if (url.startsWith('/api/images/file/')) {
    return `https://trailverse.onrender.com${url}`;
  }
  
  // If it's a relative path, convert to production URL
  if (url.startsWith('/')) {
    return `https://www.nationalparksexplorerusa.com${url}`;
  }
  
  // Otherwise, assume it's a relative path
  return `https://www.nationalparksexplorerusa.com/${url}`;
}

// Process a single blog post
async function processBlogPost(post, options = {}) {
  const { dryRun = false, defaultOnly = false } = options;
  
  console.log(`\n📝 Processing: "${post.title}" (${post.slug})`);
  console.log(`   Current featuredImage: ${post.featuredImage ? (post.featuredImage.substring(0, 80) + '...') : 'null'}`);
  
  // Check if featured image is a data URL
  if (!post.featuredImage || !post.featuredImage.startsWith('data:image/')) {
    console.log(`   ✅ Already has proper URL, skipping`);
    return { processed: false, skipped: true };
  }
  
  let newImageUrl = null;
  
  // Try to extract image from content (unless defaultOnly is true)
  if (!defaultOnly) {
    const extractedUrl = extractImageFromContent(post.content);
    if (extractedUrl) {
      newImageUrl = normalizeImageUrl(extractedUrl);
      console.log(`   📷 Found image in content: ${extractedUrl}`);
      console.log(`   → Normalized to: ${newImageUrl}`);
    } else {
      console.log(`   ⚠️  No valid image found in content`);
    }
  }
  
  // If no image found in content, use default
  if (!newImageUrl) {
    newImageUrl = DEFAULT_IMAGE_URL;
    console.log(`   🔄 Using default image: ${newImageUrl}`);
  }
  
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
async function migrateBlogImages() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const defaultOnly = args.includes('--default-only');
  
  console.log('🚀 Starting blog image migration...');
  console.log(`   Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (will update database)'}`);
  console.log(`   Strategy: ${defaultOnly ? 'Use default image only' : 'Extract from content, fallback to default'}`);
  console.log('═'.repeat(60));
  
  try {
    // Connect to database
    console.log('\n📡 Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to database');
    
    // Find all blog posts with base64 featured images
    console.log('\n🔍 Finding blog posts with base64 featured images...');
    const posts = await BlogPost.find({
      featuredImage: { $regex: /^data:image\// }
    });
    
    console.log(`✅ Found ${posts.length} blog post(s) with base64 featured images`);
    
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
        const result = await processBlogPost(post, { dryRun, defaultOnly });
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
migrateBlogImages().catch(console.error);

