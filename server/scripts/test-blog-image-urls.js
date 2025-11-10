const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const BlogPost = require('../src/models/BlogPost');

const API_BASE_URL = process.env.API_URL || 'https://trailverse.onrender.com';

// Normalize image URL (same logic as prerender.js)
function normalizeImageUrl(imageUrl, apiBaseUrl = API_BASE_URL) {
  if (!imageUrl || imageUrl.trim() === '') {
    return null;
  }
  
  if (imageUrl.startsWith('data:image/')) {
    return null;
  }
  
  // If it's a full URL with /uploads/, convert to API endpoint
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
    return {
      accessible: response.ok,
      status: response.status,
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length')
    };
  } catch (error) {
    return {
      accessible: false,
      error: error.message
    };
  }
}

// Main function
async function testBlogImageUrls() {
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
    const posts = await BlogPost.find({ status: 'published' })
      .select('title slug featuredImage publishedAt')
      .sort({ publishedAt: -1 })
      .lean();
    
    console.log(`✅ Found ${posts.length} published blog post(s)\n`);
    
    if (posts.length === 0) {
      console.log('✅ No blog posts found!');
      await mongoose.connection.close();
      return;
    }
    
    console.log('═'.repeat(80));
    console.log('🧪 Testing Blog Post Image URLs:');
    console.log('═'.repeat(80));
    
    const results = {
      accessible: 0,
      notAccessible: 0,
      missing: 0
    };
    
    for (const post of posts) {
      console.log(`\n📝 "${post.title}"`);
      console.log(`   Slug: ${post.slug}`);
      console.log(`   Original URL: ${post.featuredImage || 'MISSING'}`);
      
      if (!post.featuredImage) {
        console.log(`   ❌ No featured image`);
        results.missing++;
        continue;
      }
      
      // Normalize the image URL
      const normalizedUrl = normalizeImageUrl(post.featuredImage, API_BASE_URL);
      
      if (!normalizedUrl) {
        console.log(`   ❌ Could not normalize URL`);
        results.notAccessible++;
        continue;
      }
      
      console.log(`   Normalized URL: ${normalizedUrl}`);
      
      // Test if image is accessible
      console.log(`   Testing accessibility...`);
      const testResult = await testImageUrl(normalizedUrl);
      
      if (testResult.accessible) {
        console.log(`   ✅ Image is accessible (Status: ${testResult.status})`);
        console.log(`   Content-Type: ${testResult.contentType}`);
        console.log(`   Content-Length: ${testResult.contentLength} bytes`);
        results.accessible++;
      } else {
        console.log(`   ❌ Image is NOT accessible`);
        if (testResult.status) {
          console.log(`   Status: ${testResult.status}`);
        }
        if (testResult.error) {
          console.log(`   Error: ${testResult.error}`);
        }
        results.notAccessible++;
      }
    }
    
    // Summary
    console.log('\n' + '═'.repeat(80));
    console.log('📊 Test Summary:');
    console.log('═'.repeat(80));
    console.log(`Total posts: ${posts.length}`);
    console.log(`✅ Accessible images: ${results.accessible}`);
    console.log(`❌ Not accessible images: ${results.notAccessible}`);
    console.log(`⚠️  Missing images: ${results.missing}`);
    
    if (results.notAccessible > 0) {
      console.log('\n⚠️  Some images are not accessible. This could be because:');
      console.log('   1. Images don\'t exist on the production server');
      console.log('   2. API endpoint is not working correctly');
      console.log('   3. Images need to be re-uploaded');
    }
    
    // Close database connection
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the script
testBlogImageUrls();

