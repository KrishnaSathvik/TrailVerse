const path = require('path');
// Load .env file from server directory
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const BlogPost = require('../src/models/BlogPost');

// Categorize image URLs
function categorizeImageUrl(url) {
  if (!url || url.trim() === '') {
    return 'MISSING';
  }
  
  if (url.startsWith('data:image/')) {
    return 'DATA_URL';
  }
  
  if (url.startsWith('https://')) {
    if (url.includes('localhost')) {
      return 'HTTPS_LOCALHOST';
    }
    if (url.includes('trailverse.onrender.com')) {
      return 'HTTPS_RENDER';
    }
    if (url.includes('nationalparksexplorerusa.com')) {
      return 'HTTPS_PRODUCTION';
    }
    return 'HTTPS_OTHER';
  }
  
  if (url.startsWith('http://')) {
    if (url.includes('localhost')) {
      return 'HTTP_LOCALHOST';
    }
    return 'HTTP_OTHER';
  }
  
  if (url.startsWith('/uploads/')) {
    return 'RELATIVE_UPLOADS';
  }
  
  if (url.startsWith('/api/images/file/')) {
    return 'RELATIVE_API';
  }
  
  if (url.startsWith('/')) {
    return 'RELATIVE_OTHER';
  }
  
  return 'UNKNOWN';
}

// Main function
async function checkBlogImages() {
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
    
    // Categorize all posts
    const categories = {};
    const postsByCategory = {};
    
    posts.forEach((post, index) => {
      const category = categorizeImageUrl(post.featuredImage);
      
      if (!categories[category]) {
        categories[category] = 0;
        postsByCategory[category] = [];
      }
      
      categories[category]++;
      postsByCategory[category].push({
        index: index + 1,
        title: post.title,
        slug: post.slug,
        featuredImage: post.featuredImage ? (post.featuredImage.substring(0, 100) + (post.featuredImage.length > 100 ? '...' : '')) : 'null',
        publishedAt: post.publishedAt
      });
    });
    
    // Display summary
    console.log('═'.repeat(80));
    console.log('📊 Featured Image URL Categories:');
    console.log('═'.repeat(80));
    
    Object.keys(categories).sort().forEach(category => {
      console.log(`\n${category}: ${categories[category]} post(s)`);
      console.log('-'.repeat(80));
      
      postsByCategory[category].forEach(post => {
        console.log(`  ${post.index}. "${post.title}"`);
        console.log(`     Slug: ${post.slug}`);
        console.log(`     Image: ${post.featuredImage}`);
        console.log(`     Published: ${post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : 'N/A'}`);
        console.log('');
      });
    });
    
    // Display first 10 posts in detail
    console.log('\n' + '═'.repeat(80));
    console.log('📋 First 10 Blog Posts (Detailed):');
    console.log('═'.repeat(80));
    
    posts.slice(0, 10).forEach((post, index) => {
      const category = categorizeImageUrl(post.featuredImage);
      console.log(`\n${index + 1}. "${post.title}"`);
      console.log(`   Slug: ${post.slug}`);
      console.log(`   Category: ${category}`);
      console.log(`   Featured Image: ${post.featuredImage ? (post.featuredImage.substring(0, 150) + (post.featuredImage.length > 150 ? '...' : '')) : 'null'}`);
      console.log(`   Published: ${post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : 'N/A'}`);
    });
    
    // Summary statistics
    console.log('\n' + '═'.repeat(80));
    console.log('📈 Summary Statistics:');
    console.log('═'.repeat(80));
    console.log(`Total published posts: ${posts.length}`);
    console.log(`Posts with missing images: ${categories['MISSING'] || 0}`);
    console.log(`Posts with data URLs: ${categories['DATA_URL'] || 0}`);
    console.log(`Posts with localhost URLs: ${(categories['HTTPS_LOCALHOST'] || 0) + (categories['HTTP_LOCALHOST'] || 0)}`);
    console.log(`Posts with relative paths: ${(categories['RELATIVE_UPLOADS'] || 0) + (categories['RELATIVE_API'] || 0) + (categories['RELATIVE_OTHER'] || 0)}`);
    console.log(`Posts with production HTTPS: ${categories['HTTPS_PRODUCTION'] || 0}`);
    console.log(`Posts with Render HTTPS: ${categories['HTTPS_RENDER'] || 0}`);
    
    // Close database connection
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the script
checkBlogImages();

