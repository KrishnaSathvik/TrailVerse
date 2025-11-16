/**
 * Quick script to check current image status in blog posts
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const BlogPost = require('../src/models/BlogPost');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    const posts = await BlogPost.find({}).select('title slug featuredImage').sort({ createdAt: -1 }).lean();
    
    console.log('\n📊 Current Blog Post Image Status:\n');
    console.log('═'.repeat(80));
    
    let defaultCount = 0;
    let customCount = 0;
    let missingCount = 0;
    
    posts.forEach((post, i) => {
      const isDefault = post.featuredImage && post.featuredImage.includes('og-image-trailverse.jpg');
      const hasImage = !!post.featuredImage;
      
      if (isDefault) defaultCount++;
      else if (hasImage) customCount++;
      else missingCount++;
      
      console.log(`${i+1}. ${post.title.substring(0, 60)}${post.title.length > 60 ? '...' : ''}`);
      if (isDefault) {
        console.log(`   ✅ Using default image (working, but generic)`);
      } else if (hasImage) {
        console.log(`   🖼️  Custom image: ${post.featuredImage.substring(0, 60)}...`);
      } else {
        console.log(`   ❌ No image`);
      }
      console.log('');
    });
    
    console.log('═'.repeat(80));
    console.log('📈 Summary:');
    console.log(`   Default images: ${defaultCount}`);
    console.log(`   Custom images: ${customCount}`);
    console.log(`   Missing images: ${missingCount}`);
    console.log(`   Total posts: ${posts.length}`);
    
    if (defaultCount > 0) {
      console.log('\n💡 Note: Posts with default images are working (no 404 errors),');
      console.log('   but they all show the same generic image.');
      console.log('   Re-upload custom images if you want unique images per post.');
    }
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
})();

