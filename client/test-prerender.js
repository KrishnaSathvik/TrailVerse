/**
 * Test script for prerender function
 * Simulates social media crawler requests
 * 
 * Usage: node test-prerender.js <blog-slug>
 * Example: node test-prerender.js best-national-parks-thanksgiving
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const API_BASE_URL = process.env.API_URL || 'http://localhost:5001';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3001';

// Simulate the prerender function logic
async function testPrerender(slug) {
  console.log(`\n🔍 Testing prerender for blog post: ${slug}\n`);
  
  try {
    // Fetch blog post from API
    console.log(`📡 Fetching blog post from: ${API_BASE_URL}/api/blogs/${slug}`);
    const blogData = await fetchJSON(`${API_BASE_URL}/api/blogs/${slug}`);
    
    if (!blogData.success || !blogData.data) {
      console.error('❌ Blog post not found');
      return;
    }
    
    const post = blogData.data;
    console.log(`✅ Blog post found: "${post.title}"\n`);
    
    // Generate meta tags (same logic as prerender.js)
    const metaTags = generateMetaTags(post);
    
    // Display results
    console.log('📋 Generated Meta Tags:');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Title: ${metaTags.title}`);
    console.log(`Description: ${metaTags.description.substring(0, 100)}...`);
    console.log(`Image URL: ${metaTags.image}`);
    console.log(`URL: ${metaTags.url}`);
    console.log(`Type: ${metaTags.type}`);
    console.log(`Author: ${metaTags.author}`);
    console.log('═══════════════════════════════════════════════════════\n');
    
    // Test image URL accessibility
    console.log('🖼️  Testing image URL accessibility...');
    const imageAccessible = await testImageUrl(metaTags.image);
    if (imageAccessible) {
      console.log('✅ Image URL is accessible\n');
    } else {
      console.log('❌ Image URL is NOT accessible (404 or error)\n');
    }
    
    // Generate HTML preview
    console.log('📄 Generated HTML (first 500 chars):');
    console.log('───────────────────────────────────────────────────────');
    const html = generateHTML(metaTags);
    console.log(html.substring(0, 500) + '...\n');
    
    // Save to file for inspection
    const fs = require('fs');
    const outputFile = `test-prerender-output-${slug}.html`;
    fs.writeFileSync(outputFile, html);
    console.log(`💾 Full HTML saved to: ${outputFile}`);
    console.log(`   Open in browser to see the meta tags\n`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

function generateMetaTags(post) {
  // Normalize image URL
  let imageUrl = normalizeImageUrl(post.featuredImage);
  
  // If featured image is data URL, try to extract from content
  if (post.featuredImage && post.featuredImage.startsWith('data:image/')) {
    console.log('⚠️  Featured image is a data URL (base64) - trying to extract from content');
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
              imageUrl = normalizeImageUrl(contentImgUrl);
              console.log(`   ✅ Found image in content: ${contentImgUrl}`);
              break;
            }
          }
        }
        if (imageUrl && imageUrl.startsWith('http')) break;
      }
    }
  }
  
  // Fallback to default
  if (!imageUrl || !imageUrl.startsWith('http')) {
    console.log('⚠️  Using default image');
    imageUrl = `${CLIENT_URL}/og-image-trailverse.jpg`;
  }
  
  const blogUrl = `${CLIENT_URL}/blog/${post.slug}`;
  const blogTitle = `${post.title} | TrailVerse`;
  const description = post.excerpt || (post.content ? post.content.replace(/<[^>]*>/g, '').substring(0, 200).trim() : '');
  
  return {
    title: blogTitle,
    description: description,
    image: imageUrl,
    url: blogUrl,
    type: 'article',
    published: post.publishedAt ? new Date(post.publishedAt).toISOString() : '',
    modified: post.updatedAt ? new Date(post.updatedAt).toISOString() : '',
    author: typeof post.author === 'string' ? post.author : (post.author?.name || 'TrailVerse Team')
  };
}

function normalizeImageUrl(imageUrl) {
  if (!imageUrl || imageUrl.trim() === '') {
    return null;
  }
  
  // Skip data URLs
  if (imageUrl.startsWith('data:image/')) {
    return null;
  }
  
  // If it's a full URL with /uploads/, convert to API endpoint
  if (imageUrl.includes('/uploads/')) {
    const filePath = imageUrl.split('/uploads/')[1];
    if (filePath) {
      return `${API_BASE_URL}/api/images/file/${filePath}`;
    }
  }
  
  // Already a full URL (and not /uploads/)
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }
  
  // Handle API image paths
  if (imageUrl.startsWith('/api/images/file/')) {
    return `${API_BASE_URL}${imageUrl}`;
  }
  
  // Handle /uploads/ paths (relative)
  if (imageUrl.startsWith('/uploads/')) {
    const filePath = imageUrl.replace('/uploads/', '');
    return `${API_BASE_URL}/api/images/file/${filePath}`;
  }
  
  // Handle relative paths
  if (imageUrl.startsWith('/')) {
    return `${CLIENT_URL}${imageUrl}`;
  }
  
  return `${CLIENT_URL}/${imageUrl}`;
}

function generateHTML(metaTags) {
  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  
  const escapedTitle = escapeHtml(metaTags.title);
  const escapedDescription = escapeHtml(metaTags.description);
  const escapedImage = escapeHtml(metaTags.image);
  const escapedUrl = escapeHtml(metaTags.url);
  const escapedAuthor = escapeHtml(metaTags.author);
  
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    
    <!-- Primary Meta Tags -->
    <title>${escapedTitle}</title>
    <meta name="title" content="${escapedTitle}" />
    <meta name="description" content="${escapedDescription}" />
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="${metaTags.type}" />
    <meta property="og:url" content="${escapedUrl}" />
    <meta property="og:title" content="${escapedTitle}" />
    <meta property="og:description" content="${escapedDescription}" />
    <meta property="og:image" content="${escapedImage}" />
    <meta property="og:image:url" content="${escapedImage}" />
    <meta property="og:image:secure_url" content="${escapedImage}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:alt" content="${escapedTitle}" />
    <meta property="og:site_name" content="TrailVerse" />
    <meta property="og:locale" content="en_US" />
    
    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${escapedUrl}" />
    <meta name="twitter:title" content="${escapedTitle}" />
    <meta name="twitter:description" content="${escapedDescription}" />
    <meta name="twitter:image" content="${escapedImage}" />
    <meta name="twitter:image:src" content="${escapedImage}" />
    <meta name="twitter:site" content="@TrailVerse" />
    
    ${metaTags.published ? `<meta property="article:published_time" content="${metaTags.published}" />` : ''}
    ${metaTags.modified ? `<meta property="article:modified_time" content="${metaTags.modified}" />` : ''}
    <meta property="article:author" content="${escapedAuthor}" />
    <meta property="article:section" content="Travel" />
    
    <!-- Canonical URL -->
    <link rel="canonical" href="${escapedUrl}" />
  </head>
  <body>
    <h1>${escapedTitle}</h1>
    <p>${escapedDescription}</p>
    <p><img src="${escapedImage}" alt="${escapedTitle}" style="max-width: 100%;" /></p>
    <p><a href="${escapedUrl}">Visit Blog Post</a></p>
  </body>
</html>`;
}

async function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const req = client.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${e.message}`));
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function testImageUrl(url) {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const req = client.get(url, (res) => {
      resolve(res.statusCode === 200);
      req.destroy();
    });
    
    req.on('error', () => resolve(false));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// Main
const slug = process.argv[2];
if (!slug) {
  console.error('Usage: node test-prerender.js <blog-slug>');
  console.error('Example: node test-prerender.js best-national-parks-thanksgiving');
  process.exit(1);
}

testPrerender(slug).catch(console.error);

