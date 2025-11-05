/**
 * Test script to verify image URLs for blog posts and parks
 * This helps diagnose why images might not be showing in social media previews
 */

const API_BASE_URL = process.env.API_URL || 'https://trailverse.onrender.com';

// Test blog post slug - replace with an actual slug from your database
const TEST_BLOG_SLUG = process.argv[2] || 'survive-thanksgiving-flights-best-days-tsa-hacks-and-backup-plans';
// Test park code - replace with an actual park code
const TEST_PARK_CODE = process.argv[3] || 'yell'; // Yellowstone

async function testBlogPostImage(slug) {
  console.log('\n📝 Testing Blog Post Image URL...');
  console.log(`Blog Slug: ${slug}`);
  console.log('─'.repeat(60));
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/blogs/${slug}`);
    
    if (!response.ok) {
      console.error(`❌ API Error: ${response.status} ${response.statusText}`);
      return;
    }
    
    const result = await response.json();
    const post = result.data;
    
    if (!post) {
      console.error('❌ Blog post not found');
      return;
    }
    
    console.log(`✅ Blog post found: "${post.title}"`);
    console.log(`\n📸 Featured Image Info:`);
    console.log(`   Original format: ${post.featuredImage ? (post.featuredImage.substring(0, 80) + '...') : 'null'}`);
    console.log(`   Is data URL: ${post.featuredImage?.startsWith('data:image/') ? 'YES ❌ (Cannot use for social media)' : 'NO ✅'}`);
    console.log(`   Is full URL: ${post.featuredImage?.startsWith('http') ? 'YES ✅' : 'NO'}`);
    console.log(`   Is API path: ${post.featuredImage?.startsWith('/api/images/file/') ? 'YES' : 'NO'}`);
    
    // Test URL construction (same logic as prerender function)
    let imageUrl = 'https://www.nationalparksexplorerusa.com/og-image-trailverse.jpg'; // Default
    
    if (post.featuredImage) {
      if (post.featuredImage.startsWith('data:image/')) {
        console.log('\n⚠️  Featured image is a data URL (base64) - social media crawlers cannot use this!');
        console.log('   Trying to extract image from content...');
        
        if (post.content) {
          const imgMatch = post.content.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
          if (imgMatch && imgMatch[1]) {
            const contentImgUrl = imgMatch[1];
            if (!contentImgUrl.startsWith('data:image/')) {
              console.log(`   ✅ Found image in content: ${contentImgUrl.substring(0, 80)}...`);
              imageUrl = constructImageUrl(contentImgUrl);
            } else {
              console.log('   ❌ Content image is also a data URL');
            }
          } else {
            console.log('   ❌ No images found in content');
          }
        }
      } else {
        imageUrl = constructImageUrl(post.featuredImage);
      }
    }
    
    console.log(`\n🔗 Final Image URL: ${imageUrl}`);
    
    // Test if image is accessible
    console.log('\n🔍 Testing image accessibility...');
    try {
      const imageResponse = await fetch(imageUrl, { method: 'HEAD' });
      if (imageResponse.ok) {
        console.log(`   ✅ Image is accessible (Status: ${imageResponse.status})`);
        console.log(`   Content-Type: ${imageResponse.headers.get('content-type')}`);
        console.log(`   Content-Length: ${imageResponse.headers.get('content-length')} bytes`);
      } else {
        console.log(`   ❌ Image is NOT accessible (Status: ${imageResponse.status})`);
      }
    } catch (error) {
      console.log(`   ❌ Error checking image: ${error.message}`);
    }
    
    // Check content for images
    if (post.content) {
      const imagesInContent = post.content.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi);
      if (imagesInContent && imagesInContent.length > 0) {
        console.log(`\n📷 Images found in content: ${imagesInContent.length}`);
        imagesInContent.slice(0, 3).forEach((img, idx) => {
          const srcMatch = img.match(/src=["']([^"']+)["']/i);
          if (srcMatch) {
            const src = srcMatch[1];
            const isDataUrl = src.startsWith('data:image/');
            console.log(`   ${idx + 1}. ${isDataUrl ? '❌ Data URL' : '✅ URL'}: ${src.substring(0, 80)}${src.length > 80 ? '...' : ''}`);
          }
        });
      } else {
        console.log('\n📷 No images found in content');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function testParkImage(parkCode) {
  console.log('\n\n🏞️  Testing Park Image URL...');
  console.log(`Park Code: ${parkCode}`);
  console.log('─'.repeat(60));
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/parks/${parkCode}`);
    
    if (!response.ok) {
      console.error(`❌ API Error: ${response.status} ${response.statusText}`);
      return;
    }
    
    const result = await response.json();
    const park = result.data;
    
    if (!park) {
      console.error('❌ Park not found');
      return;
    }
    
    console.log(`✅ Park found: "${park.name}"`);
    console.log(`\n📸 Park Images Info:`);
    console.log(`   Number of images: ${park.images?.length || 0}`);
    
    if (park.images && park.images.length > 0) {
      const firstImage = park.images[0];
      console.log(`   First image type: ${typeof firstImage}`);
      
      if (typeof firstImage === 'object') {
        console.log(`   First image object keys: ${Object.keys(firstImage).join(', ')}`);
        console.log(`   First image URL: ${firstImage.url || firstImage.src || 'N/A'}`);
      } else {
        console.log(`   First image (string): ${firstImage.substring(0, 80)}...`);
      }
      
      // Test URL construction (same logic as prerender function)
      const imageString = typeof firstImage === 'string' ? firstImage : (firstImage.url || firstImage.src || '');
      const imageUrl = constructImageUrl(imageString);
      
      console.log(`\n🔗 Final Image URL: ${imageUrl}`);
      
      // Test if image is accessible
      console.log('\n🔍 Testing image accessibility...');
      try {
        const imageResponse = await fetch(imageUrl, { method: 'HEAD' });
        if (imageResponse.ok) {
          console.log(`   ✅ Image is accessible (Status: ${imageResponse.status})`);
          console.log(`   Content-Type: ${imageResponse.headers.get('content-type')}`);
          console.log(`   Content-Length: ${imageResponse.headers.get('content-length')} bytes`);
        } else {
          console.log(`   ❌ Image is NOT accessible (Status: ${imageResponse.status})`);
        }
      } catch (error) {
        console.log(`   ❌ Error checking image: ${error.message}`);
      }
    } else {
      console.log('   ⚠️  No images found for this park');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

function constructImageUrl(imageString) {
  if (!imageString) {
    return 'https://www.nationalparksexplorerusa.com/og-image-trailverse.jpg';
  }
  
  if (imageString.startsWith('http://') || imageString.startsWith('https://')) {
    return imageString;
  } else if (imageString.startsWith('/api/images/file/')) {
    return `https://trailverse.onrender.com${imageString}`;
  } else if (imageString.startsWith('/')) {
    return `https://www.nationalparksexplorerusa.com${imageString}`;
  } else {
    return `https://www.nationalparksexplorerusa.com/${imageString}`;
  }
}

// Main execution
async function main() {
  console.log('🧪 Image URL Verification Test');
  console.log('═'.repeat(60));
  console.log(`API Base URL: ${API_BASE_URL}`);
  
  await testBlogPostImage(TEST_BLOG_SLUG);
  await testParkImage(TEST_PARK_CODE);
  
  console.log('\n\n✅ Test Complete!');
  console.log('\n💡 Tips:');
  console.log('   - If featured image is a data URL, it needs to be uploaded first');
  console.log('   - Images must be publicly accessible (not behind auth)');
  console.log('   - Image URLs should be absolute (https://...)');
  console.log('   - Images should be at least 1200x630px for best social media preview');
}

main().catch(console.error);

