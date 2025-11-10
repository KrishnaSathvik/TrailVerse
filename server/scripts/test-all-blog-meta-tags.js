const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const BlogPost = require('../src/models/BlogPost');

const API_BASE_URL = process.env.API_URL || 'https://trailverse.onrender.com';
const CLIENT_URL = 'https://www.nationalparksexplorerusa.com';
const DEFAULT_IMAGE = 'https://www.nationalparksexplorerusa.com/og-image-trailverse.jpg';

// Normalize image URL (same logic as prerender.js)
function normalizeImageUrl(imageUrl, apiBaseUrl = API_BASE_URL, defaultImage = DEFAULT_IMAGE) {
  if (!imageUrl || imageUrl.trim() === '') {
    return defaultImage;
  }
  
  if (imageUrl.startsWith('data:image/')) {
    return defaultImage;
  }
  
  // If image URL contains localhost and we're in production, extract the path and rebuild
  if (imageUrl.includes('localhost')) {
    const localhostMatch = imageUrl.match(/localhost[:\d]*\/(.+)/);
    if (localhostMatch && localhostMatch[1]) {
      const path = localhostMatch[1];
      if (path.startsWith('uploads/')) {
        const filePath = path.replace('uploads/', '');
        return `${apiBaseUrl}/api/images/file/${filePath}`;
      }
      if (path.startsWith('api/images/file/')) {
        return `${apiBaseUrl}/${path}`;
      }
    }
  }
  
  // If it's a full URL with /uploads/, convert to API endpoint
  if (imageUrl.includes('/uploads/')) {
    const filePath = imageUrl.split('/uploads/')[1];
    if (filePath) {
      return `${apiBaseUrl}/api/images/file/${filePath}`;
    }
  }
  
  // Already a full HTTPS URL (and not /uploads/)
  if (imageUrl.startsWith('https://')) {
    return imageUrl;
  }
  
  // Already a full HTTP URL (convert to HTTPS in prod)
  if (imageUrl.startsWith('http://')) {
    let httpsUrl = imageUrl.replace(/^http:\/\//i, 'https://');
    if (httpsUrl.includes('localhost')) {
      httpsUrl = httpsUrl.replace(/https?:\/\/[^\/]+/, apiBaseUrl);
    }
    return httpsUrl;
  }
  
  // Handle API image paths
  if (imageUrl.startsWith('/api/images/file/')) {
    return `${apiBaseUrl}${imageUrl}`;
  }
  
  // Handle /uploads/ paths - convert to API endpoint
  if (imageUrl.startsWith('/uploads/')) {
    const filePath = imageUrl.replace('/uploads/', '');
    return `${apiBaseUrl}/api/images/file/${filePath}`;
  }
  
  // Handle relative paths
  if (imageUrl.startsWith('/')) {
    return `${CLIENT_URL}${imageUrl}`;
  }
  
  // Handle relative paths without leading slash
  return `${CLIENT_URL}/${imageUrl}`;
}

// Test if image URL is accessible
async function testImageUrl(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return {
      accessible: response.ok,
      status: response.status,
      contentType: response.headers.get('content-type')
    };
  } catch (error) {
    return {
      accessible: false,
      error: error.message
    };
  }
}

// Generate meta tags (same logic as prerender.js)
function generateMetaTags(post) {
  let imageUrl = null;
  
  // First, try to use featured image if it's a valid URL (not data URL)
  if (post.featuredImage && !post.featuredImage.startsWith('data:image/')) {
    imageUrl = normalizeImageUrl(post.featuredImage, API_BASE_URL, DEFAULT_IMAGE);
  }
  
  // If featured image is a data URL or not available, try to extract from content
  if (!imageUrl || post.featuredImage?.startsWith('data:image/')) {
    if (post.content) {
      const imgPatterns = [
        /<img[^>]+src=["']([^"']+)["'][^>]*>/gi,
        /<img[^>]+src=([^\s>]+)[^>]*>/gi,
        /background-image:\s*url\(["']?([^"')]+)["']?\)/gi,
      ];
      
      for (const pattern of imgPatterns) {
        const matches = [...post.content.matchAll(pattern)];
        for (const match of matches) {
          if (match[1]) {
            const contentImgUrl = match[1].trim();
            if (contentImgUrl && !contentImgUrl.startsWith('data:image/') && contentImgUrl.length > 10) {
              const normalized = normalizeImageUrl(contentImgUrl, API_BASE_URL, DEFAULT_IMAGE);
              if (normalized && normalized.startsWith('http')) {
                imageUrl = normalized;
                break;
              }
            }
          }
        }
        if (imageUrl) break;
      }
    }
  }
  
  // Final fallback to default image
  if (!imageUrl || !imageUrl.startsWith('http')) {
    imageUrl = DEFAULT_IMAGE;
  }
  
  // Clean description
  let description = post.excerpt || '';
  if (!description && post.content) {
    description = post.content.replace(/<[^>]*>/g, '').substring(0, 200).trim();
  }
  
  // Handle author
  let author = 'TrailVerse Team';
  if (post.author) {
    if (typeof post.author === 'string') {
      author = post.author;
    } else if (post.author.name) {
      author = post.author.name;
    }
  }
  
  // Format dates
  const publishedTime = post.publishedAt ? (new Date(post.publishedAt).toISOString()) : '';
  const modifiedTime = post.updatedAt ? (new Date(post.updatedAt).toISOString()) : '';
  
  return {
    title: `${post.title} | TrailVerse`,
    description: description,
    image: imageUrl,
    url: `${CLIENT_URL}/blog/${post.slug}`,
    type: 'article',
    published: publishedTime,
    modified: modifiedTime,
    author: author
  };
}

// Main function
async function testAllBlogMetaTags() {
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
      .select('title slug excerpt content featuredImage author publishedAt updatedAt')
      .sort({ publishedAt: -1 })
      .lean();
    
    console.log(`✅ Found ${posts.length} published blog post(s)\n`);
    
    if (posts.length === 0) {
      console.log('✅ No blog posts found!');
      await mongoose.connection.close();
      return;
    }
    
    console.log('═'.repeat(100));
    console.log('🧪 Testing All Blog Posts Meta Tags:');
    console.log('═'.repeat(100));
    
    const results = {
      total: posts.length,
      withImage: 0,
      withTitle: 0,
      withLink: 0,
      withDescription: 0,
      accessibleImages: 0,
      inaccessibleImages: 0,
      missingImages: 0
    };
    
    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      console.log(`\n${'─'.repeat(100)}`);
      console.log(`📝 ${i + 1}. "${post.title}"`);
      console.log(`   Slug: ${post.slug}`);
      console.log(`   URL: ${CLIENT_URL}/blog/${post.slug}`);
      
      // Generate meta tags
      const metaTags = generateMetaTags(post);
      
      // Check title
      if (metaTags.title && metaTags.title.length > 0) {
        console.log(`   ✅ Title: ${metaTags.title}`);
        results.withTitle++;
      } else {
        console.log(`   ❌ Title: MISSING`);
      }
      
      // Check description
      if (metaTags.description && metaTags.description.length > 0) {
        console.log(`   ✅ Description: ${metaTags.description.substring(0, 100)}...`);
        results.withDescription++;
      } else {
        console.log(`   ❌ Description: MISSING`);
      }
      
      // Check image
      if (metaTags.image && metaTags.image.startsWith('http')) {
        console.log(`   ✅ Image URL: ${metaTags.image}`);
        results.withImage++;
        
        // Test if image is accessible
        console.log(`   Testing image accessibility...`);
        const imageTest = await testImageUrl(metaTags.image);
        if (imageTest.accessible) {
          console.log(`   ✅ Image is accessible (Status: ${imageTest.status}, Type: ${imageTest.contentType})`);
          results.accessibleImages++;
        } else {
          console.log(`   ❌ Image is NOT accessible (Status: ${imageTest.status || 'Error'})`);
          results.inaccessibleImages++;
        }
      } else {
        console.log(`   ❌ Image URL: MISSING or INVALID`);
        results.missingImages++;
      }
      
      // Check link
      if (metaTags.url && metaTags.url.startsWith('http')) {
        console.log(`   ✅ Link: ${metaTags.url}`);
        results.withLink++;
      } else {
        console.log(`   ❌ Link: MISSING or INVALID`);
      }
      
      // Check type
      if (metaTags.type) {
        console.log(`   ✅ Type: ${metaTags.type}`);
      } else {
        console.log(`   ❌ Type: MISSING`);
      }
      
      // Check author
      if (metaTags.author) {
        console.log(`   ✅ Author: ${metaTags.author}`);
      } else {
        console.log(`   ❌ Author: MISSING`);
      }
      
      // Check dates
      if (metaTags.published) {
        console.log(`   ✅ Published: ${metaTags.published}`);
      } else {
        console.log(`   ⚠️  Published: MISSING`);
      }
      
      if (metaTags.modified) {
        console.log(`   ✅ Modified: ${metaTags.modified}`);
      } else {
        console.log(`   ⚠️  Modified: MISSING`);
      }
    }
    
    // Summary
    console.log(`\n${'═'.repeat(100)}`);
    console.log('📊 Test Summary:');
    console.log('═'.repeat(100));
    console.log(`Total blog posts: ${results.total}`);
    console.log(`\n✅ Meta Tags Status:`);
    console.log(`   Posts with title: ${results.withTitle}/${results.total} (${Math.round(results.withTitle/results.total*100)}%)`);
    console.log(`   Posts with description: ${results.withDescription}/${results.total} (${Math.round(results.withDescription/results.total*100)}%)`);
    console.log(`   Posts with image: ${results.withImage}/${results.total} (${Math.round(results.withImage/results.total*100)}%)`);
    console.log(`   Posts with link: ${results.withLink}/${results.total} (${Math.round(results.withLink/results.total*100)}%)`);
    console.log(`\n📸 Image Status:`);
    console.log(`   Accessible images: ${results.accessibleImages}/${results.withImage} (${results.withImage > 0 ? Math.round(results.accessibleImages/results.withImage*100) : 0}%)`);
    console.log(`   Inaccessible images: ${results.inaccessibleImages}/${results.withImage}`);
    console.log(`   Missing images: ${results.missingImages}/${results.total}`);
    
    // Overall status
    console.log(`\n${'═'.repeat(100)}`);
    const allGood = results.withTitle === results.total && 
                    results.withDescription === results.total && 
                    results.withImage === results.total && 
                    results.withLink === results.total && 
                    results.accessibleImages === results.withImage;
    
    if (allGood) {
      console.log('✅ ALL BLOG POSTS HAVE COMPLETE META TAGS (Title, Description, Image, Link)');
      console.log('✅ ALL IMAGES ARE ACCESSIBLE');
      console.log('\n🎉 All blog posts should show correctly when shared on social media!');
    } else {
      console.log('⚠️  SOME BLOG POSTS ARE MISSING META TAGS OR HAVE INACCESSIBLE IMAGES');
      if (results.withTitle < results.total) {
        console.log(`   ❌ ${results.total - results.withTitle} post(s) missing title`);
      }
      if (results.withDescription < results.total) {
        console.log(`   ❌ ${results.total - results.withDescription} post(s) missing description`);
      }
      if (results.withImage < results.total) {
        console.log(`   ❌ ${results.total - results.withImage} post(s) missing image`);
      }
      if (results.withLink < results.total) {
        console.log(`   ❌ ${results.total - results.withLink} post(s) missing link`);
      }
      if (results.accessibleImages < results.withImage) {
        console.log(`   ❌ ${results.withImage - results.accessibleImages} image(s) not accessible`);
      }
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
testAllBlogMetaTags();

