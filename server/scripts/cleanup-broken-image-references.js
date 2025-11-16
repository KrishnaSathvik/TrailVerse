/**
 * Script to clean up broken image references in blog posts
 * 
 * This script:
 * 1. Finds all blog posts (published and draft)
 * 2. Checks featuredImage field for broken references
 * 3. Checks image URLs in content HTML
 * 4. Verifies files exist on disk
 * 5. Removes or replaces broken references
 * 
 * Usage:
 *   node server/scripts/cleanup-broken-image-references.js [--dry-run] [--remove-only]
 * 
 * Options:
 *   --dry-run: Only show what would be changed without updating
 *   --remove-only: Remove broken references instead of replacing with default
 */

const path = require('path');
const fs = require('fs').promises;
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const BlogPost = require('../src/models/BlogPost');

const DEFAULT_IMAGE = 'https://www.nationalparksexplorerusa.com/og-image-trailverse.jpg';
const UPLOADS_DIR = path.join(__dirname, '../uploads');

// Extract file path from image URL
function extractFilePath(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') {
    return null;
  }

  // Handle /uploads/category/filename.jpg
  if (imageUrl.includes('/uploads/')) {
    const match = imageUrl.match(/\/uploads\/(.+)$/);
    if (match) {
      return match[1]; // Returns "category/filename.jpg"
    }
  }

  // Handle /api/images/file/category/filename.jpg
  if (imageUrl.includes('/api/images/file/')) {
    const match = imageUrl.match(/\/api\/images\/file\/(.+)$/);
    if (match) {
      return match[1]; // Returns "category/filename.jpg"
    }
  }

  // Handle full URLs with /uploads/ or /api/images/file/
  if (imageUrl.includes('uploads/')) {
    const match = imageUrl.match(/uploads\/(.+)$/);
    if (match) {
      return match[1];
    }
  }

  if (imageUrl.includes('api/images/file/')) {
    const match = imageUrl.match(/api\/images\/file\/(.+)$/);
    if (match) {
      return match[1];
    }
  }

  return null;
}

// Check if file exists on disk
async function fileExists(filePath) {
  try {
    const fullPath = path.join(UPLOADS_DIR, filePath);
    await fs.access(fullPath);
    return true;
  } catch (error) {
    return false;
  }
}

// Extract all image URLs from HTML content
function extractImageUrlsFromContent(content) {
  if (!content || typeof content !== 'string') {
    return [];
  }

  const imageUrls = [];
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;

  while ((match = imgRegex.exec(content)) !== null) {
    const url = match[1];
    if (url && !url.startsWith('data:') && !url.startsWith('http')) {
      // Only process relative/local URLs
      imageUrls.push(url);
    }
  }

  return imageUrls;
}

// Replace image URL in HTML content
function replaceImageUrlInContent(content, oldUrl, newUrl) {
  if (!content || typeof content !== 'string') {
    return content;
  }

  // Replace all occurrences of the old URL
  const escapedOldUrl = oldUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escapedOldUrl, 'g');
  
  if (newUrl) {
    return content.replace(regex, newUrl);
  } else {
    // Remove the img tag if newUrl is null
    return content.replace(new RegExp(`<img[^>]+src=["']${escapedOldUrl}["'][^>]*>`, 'gi'), '');
  }
}

// Process a single blog post
async function processBlogPost(post, options = {}) {
  const { dryRun = false, removeOnly = false } = options;
  let updated = false;
  const changes = [];

  console.log(`\n📝 Processing: "${post.title}" (${post.slug || post._id})`);

  // Check featuredImage
  if (post.featuredImage) {
    const filePath = extractFilePath(post.featuredImage);
    
    if (filePath) {
      const exists = await fileExists(filePath);
      
      if (!exists) {
        console.log(`   ❌ Featured image not found: ${filePath}`);
        changes.push({
          field: 'featuredImage',
          oldValue: post.featuredImage,
          newValue: removeOnly ? null : DEFAULT_IMAGE
        });

        if (!dryRun) {
          post.featuredImage = removeOnly ? null : DEFAULT_IMAGE;
          updated = true;
        } else {
          console.log(`   🔍 [DRY RUN] Would ${removeOnly ? 'remove' : 'replace'} featured image`);
        }
      } else {
        console.log(`   ✅ Featured image exists: ${filePath}`);
      }
    } else {
      // External URL or invalid format - skip
      console.log(`   ⚠️  Featured image is external URL or invalid format: ${post.featuredImage}`);
    }
  } else {
    console.log(`   ℹ️  No featured image`);
  }

  // Check images in content
  if (post.content) {
    const imageUrls = extractImageUrlsFromContent(post.content);
    let contentUpdated = false;
    let newContent = post.content;

    for (const imageUrl of imageUrls) {
      const filePath = extractFilePath(imageUrl);
      
      if (filePath) {
        const exists = await fileExists(filePath);
        
        if (!exists) {
          console.log(`   ❌ Content image not found: ${filePath}`);
          changes.push({
            field: 'content',
            oldValue: imageUrl,
            newValue: removeOnly ? null : DEFAULT_IMAGE
          });

          if (!dryRun) {
            newContent = replaceImageUrlInContent(newContent, imageUrl, removeOnly ? null : DEFAULT_IMAGE);
            contentUpdated = true;
          } else {
            console.log(`   🔍 [DRY RUN] Would ${removeOnly ? 'remove' : 'replace'} image in content: ${imageUrl}`);
          }
        } else {
          console.log(`   ✅ Content image exists: ${filePath}`);
        }
      }
    }

    if (contentUpdated) {
      post.content = newContent;
      updated = true;
    }
  }

  if (updated && !dryRun) {
    await post.save();
    console.log(`   ✅ Post updated`);
  }

  return {
    updated: changes.length > 0, // Has changes (even if dry run)
    changes: changes.length,
    skipped: changes.length === 0
  };
}

// Main function
async function cleanupBrokenImageReferences() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const removeOnly = args.includes('--remove-only');

  console.log('🚀 Starting broken image reference cleanup...');
  console.log(`   Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (will update database)'}`);
  console.log(`   Action: ${removeOnly ? 'Remove broken references' : 'Replace with default image'}`);
  console.log('═'.repeat(80));

  try {
    // Check if uploads directory exists
    try {
      await fs.access(UPLOADS_DIR);
      console.log(`✅ Uploads directory exists: ${UPLOADS_DIR}`);
    } catch (error) {
      console.error(`❌ Uploads directory not found: ${UPLOADS_DIR}`);
      process.exit(1);
    }

    // Connect to database
    console.log('\n📡 Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to database');

    // Find all blog posts (published and draft)
    console.log('\n🔍 Finding all blog posts...');
    const posts = await BlogPost.find({}).sort({ createdAt: -1 });

    console.log(`✅ Found ${posts.length} blog post(s)`);

    if (posts.length === 0) {
      console.log('\n✅ No blog posts found!');
      await mongoose.connection.close();
      return;
    }

    // Process each blog post
    const results = {
      processed: 0,
      skipped: 0,
      errors: 0,
      totalChanges: 0
    };

    for (const post of posts) {
      try {
        const result = await processBlogPost(post, { dryRun, removeOnly });
        if (result.changes > 0) {
          results.processed++;
          results.totalChanges += result.changes;
        } else {
          results.skipped++;
        }
      } catch (error) {
        console.error(`   ❌ Error processing post: ${error.message}`);
        results.errors++;
      }
    }

    // Summary
    console.log('\n' + '═'.repeat(80));
    console.log('📊 Cleanup Summary:');
    console.log(`   Posts processed: ${results.processed}`);
    console.log(`   Posts skipped: ${results.skipped}`);
    console.log(`   Total changes: ${results.totalChanges}`);
    console.log(`   Errors: ${results.errors}`);
    console.log(`   Total posts: ${posts.length}`);

    if (dryRun) {
      console.log('\n⚠️  This was a DRY RUN. No changes were made.');
      console.log('   Run without --dry-run to apply changes.');
    } else {
      console.log('\n✅ Cleanup completed!');
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
cleanupBrokenImageReferences();

