const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const BlogPost = require('../src/models/BlogPost');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB Connected');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  }
};

// Main function
const main = async () => {
  try {
    await connectDB();
    
    console.log('\n🔍 Finding all blog posts with images...');
    const posts = await BlogPost.find({ featuredImage: { $exists: true, $ne: null } });
    
    console.log(`📝 Found ${posts.length} blog posts with images\n`);
    
    if (posts.length === 0) {
      console.log('✅ No blog posts with images found. Nothing to remove.');
      await mongoose.disconnect();
      process.exit(0);
    }
    
    // Show what will be removed
    console.log('Blog posts that will have images removed:');
    posts.forEach((post, index) => {
      console.log(`  ${index + 1}. ${post.title}`);
      console.log(`     Current image: ${post.featuredImage}`);
    });
    
    console.log('\n🗑️  Removing all blog post images...');
    
    // Remove all featured images
    const result = await BlogPost.updateMany(
      { featuredImage: { $exists: true, $ne: null } },
      { $set: { featuredImage: null } }
    );
    
    console.log(`\n✅ Successfully removed images from ${result.modifiedCount} blog posts`);
    
    // Verify
    const remaining = await BlogPost.find({ featuredImage: { $exists: true, $ne: null } });
    console.log(`✅ Verification: ${remaining.length} blog posts still have images (should be 0)`);
    
    console.log('\n✅ Done! All blog post images have been removed.');
    console.log('💡 You can now add images again through the admin panel.');
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

main();

