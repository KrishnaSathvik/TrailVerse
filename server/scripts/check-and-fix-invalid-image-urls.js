const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const BlogPost = require('../src/models/BlogPost');
const DailyFeed = require('../src/models/DailyFeed');
const Event = require('../src/models/Event');
const VisitedPark = require('../src/models/VisitedPark');
const ImageUpload = require('../src/models/ImageUpload');

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

// Check if a URL is invalid (just a filename without proper path)
const isInvalidImageUrl = (url) => {
  if (!url || typeof url !== 'string' || url.trim() === '') {
    return false; // Empty/null is not invalid, just missing
  }
  
  const trimmed = url.trim();
  
  // Valid URLs should start with http://, https://, or /, or contain /uploads/
  // If it's just a filename like "image.jpg" without any path indicators, it's invalid
  if (!trimmed.startsWith('http://') && 
      !trimmed.startsWith('https://') && 
      !trimmed.startsWith('/') && 
      !trimmed.includes('/') && 
      trimmed.includes('.')) {
    return true; // This is just a filename
  }
  
  return false;
};

// Check BlogPost featuredImage
const checkBlogPosts = async () => {
  console.log('\n📝 Checking BlogPost featuredImage...');
  const posts = await BlogPost.find({ featuredImage: { $exists: true, $ne: null } });
  let fixed = 0;
  
  for (const post of posts) {
    if (isInvalidImageUrl(post.featuredImage)) {
      console.log(`  ❌ Invalid: ${post.title} - ${post.featuredImage}`);
      post.featuredImage = null;
      await post.save();
      fixed++;
    }
  }
  
  console.log(`  ✅ Checked ${posts.length} posts, fixed ${fixed}`);
  return fixed;
};

// Check DailyFeed parkOfDay.image
const checkDailyFeeds = async () => {
  console.log('\n📅 Checking DailyFeed parkOfDay.image...');
  const feeds = await DailyFeed.find({ 'parkOfDay.image': { $exists: true, $ne: null } });
  let fixed = 0;
  
  for (const feed of feeds) {
    if (feed.parkOfDay && feed.parkOfDay.image && isInvalidImageUrl(feed.parkOfDay.image)) {
      console.log(`  ❌ Invalid: Feed ${feed.date} - ${feed.parkOfDay.image}`);
      // Set to null or use a default - you might want to fetch a valid image from NPS API
      feed.parkOfDay.image = null;
      await feed.save();
      fixed++;
    }
  }
  
  console.log(`  ✅ Checked ${feeds.length} feeds, fixed ${fixed}`);
  return fixed;
};

// Check Event imageUrl
const checkEvents = async () => {
  console.log('\n🎉 Checking Event imageUrl...');
  const events = await Event.find({ imageUrl: { $exists: true, $ne: null } });
  let fixed = 0;
  
  for (const event of events) {
    if (isInvalidImageUrl(event.imageUrl)) {
      console.log(`  ❌ Invalid: ${event.title} - ${event.imageUrl}`);
      event.imageUrl = null;
      await event.save();
      fixed++;
    }
  }
  
  console.log(`  ✅ Checked ${events.length} events, fixed ${fixed}`);
  return fixed;
};

// Check VisitedPark imageUrl and photos
const checkVisitedParks = async () => {
  console.log('\n🗺️  Checking VisitedPark imageUrl and photos...');
  const visitedParks = await VisitedPark.find({
    $or: [
      { imageUrl: { $exists: true, $ne: null, $ne: '' } },
      { photos: { $exists: true, $ne: [] } }
    ]
  });
  let fixed = 0;
  
  for (const visited of visitedParks) {
    let needsSave = false;
    
    if (visited.imageUrl && isInvalidImageUrl(visited.imageUrl)) {
      console.log(`  ❌ Invalid imageUrl: ${visited.parkName} - ${visited.imageUrl}`);
      visited.imageUrl = '';
      needsSave = true;
      fixed++;
    }
    
    if (visited.photos && Array.isArray(visited.photos)) {
      const invalidPhotos = visited.photos.filter(photo => isInvalidImageUrl(photo));
      if (invalidPhotos.length > 0) {
        console.log(`  ❌ Invalid photos: ${visited.parkName} - ${invalidPhotos.join(', ')}`);
        visited.photos = visited.photos.filter(photo => !isInvalidImageUrl(photo));
        needsSave = true;
        fixed += invalidPhotos.length;
      }
    }
    
    if (needsSave) {
      await visited.save();
    }
  }
  
  console.log(`  ✅ Checked ${visitedParks.length} visited parks, fixed ${fixed} issues`);
  return fixed;
};

// Check ImageUpload records
const checkImageUploads = async () => {
  console.log('\n🖼️  Checking ImageUpload records...');
  const uploads = await ImageUpload.find({ url: { $exists: true, $ne: null } });
  let fixed = 0;
  
  for (const upload of uploads) {
    if (isInvalidImageUrl(upload.url)) {
      console.log(`  ❌ Invalid: ${upload.filename} - ${upload.url}`);
      // Don't delete ImageUpload records, but log them
      console.log(`    ⚠️  ImageUpload record ${upload._id} has invalid URL`);
      fixed++;
    }
  }
  
  console.log(`  ✅ Checked ${uploads.length} uploads, found ${fixed} invalid URLs`);
  return fixed;
};

// Main function
const main = async () => {
  try {
    await connectDB();
    
    console.log('\n🔍 Checking database for invalid image URLs...\n');
    
    const blogFixed = await checkBlogPosts();
    const feedFixed = await checkDailyFeeds();
    const eventFixed = await checkEvents();
    const visitedFixed = await checkVisitedParks();
    const uploadFixed = await checkImageUploads();
    
    const totalFixed = blogFixed + feedFixed + eventFixed + visitedFixed;
    
    console.log('\n📊 Summary:');
    console.log(`  BlogPost: ${blogFixed} fixed`);
    console.log(`  DailyFeed: ${feedFixed} fixed`);
    console.log(`  Event: ${eventFixed} fixed`);
    console.log(`  VisitedPark: ${visitedFixed} fixed`);
    console.log(`  ImageUpload: ${uploadFixed} invalid URLs found (not fixed)`);
    console.log(`  Total: ${totalFixed} records fixed`);
    
    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

main();

