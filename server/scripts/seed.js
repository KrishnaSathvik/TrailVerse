require('dotenv').config({ path: './.env.development' });
const mongoose = require('mongoose');
const User = require('../src/models/User');
const BlogPost = require('../src/models/BlogPost');
const Event = require('../src/models/Event');
const Testimonial = require('../src/models/Testimonial');
const Favorite = require('../src/models/Favorite');
const TripPlan = require('../src/models/TripPlan');
const Review = require('../src/models/Review');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const seedData = async () => {
  try {
    console.log('🌱 Seeding database...\n');

    // Clear existing data
    await Promise.all([
      User.deleteMany({}),
      BlogPost.deleteMany({}),
      Event.deleteMany({}),
      Testimonial.deleteMany({}),
      Favorite.deleteMany({}),
      TripPlan.deleteMany({}),
      Review.deleteMany({})
    ]);
    console.log('✅ Cleared existing data');

    // Create admin user
    const admin = await User.create({
      name: 'Admin User',
      email: 'trailverseteam@gmail.com',
      password: 'TrailVerseAdmin@2025*',
      role: 'admin',
      isEmailVerified: true
    });
    console.log('✅ Created admin user:', admin._id);

    // Create development user
    const devUser = await User.create({
      name: 'Development Team',
      email: 'devteam@example.com',
      password: 'dev123',
      role: 'user',
      isEmailVerified: true
    });
    console.log('✅ Created development user:', devUser._id);

    console.log('\n🎉 Database seeded successfully!\n');
    console.log('Admin credentials:');
    console.log('Email: trailverseteam@gmail.com');
    console.log('Password: TrailVerseAdmin@2025*\n');
    console.log('Development user credentials:');
    console.log('Email: devteam@example.com');
    console.log('Password: dev123\n');

  } catch (error) {
    console.error('❌ Seeding error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('✅ Database connection closed');
  }
};

// Run seeding
connectDB().then(seedData);
