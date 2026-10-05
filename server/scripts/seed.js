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

/**
 * Seed credentials are supplied at runtime and are never defaulted.
 *
 * This script used to hardcode the admin account's email and password — with
 * `role: 'admin'` and `isEmailVerified: true` — in a tracked, published file.
 * Anyone with repository access could read the admin credential, and any
 * environment this was ever run against has an admin account whose password is
 * public. Removing the literals stops further spread; the accounts themselves
 * still need rotating.
 */
const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL;
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;
const SEED_DEV_EMAIL = process.env.SEED_DEV_EMAIL || 'devteam@example.com';
const SEED_DEV_PASSWORD = process.env.SEED_DEV_PASSWORD;

const seedData = async () => {
  try {
    if (!SEED_ADMIN_EMAIL || !SEED_ADMIN_PASSWORD || !SEED_DEV_PASSWORD) {
      console.error(
        'Refusing to seed without runtime credentials. Required: '
        + 'SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_DEV_PASSWORD '
        + '(optional: SEED_DEV_EMAIL).'
      );
      process.exit(1);
    }

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
      email: SEED_ADMIN_EMAIL,
      password: SEED_ADMIN_PASSWORD,
      role: 'admin',
      isEmailVerified: true
    });
    console.log('✅ Created admin user:', admin._id);

    // Create development user
    const devUser = await User.create({
      name: 'Development Team',
      email: SEED_DEV_EMAIL,
      password: SEED_DEV_PASSWORD,
      role: 'user',
      isEmailVerified: true
    });
    console.log('✅ Created development user:', devUser._id);

    console.log('\n🎉 Database seeded successfully!\n');
    // Presence only — a seed script must not echo the credentials it just used.
    console.log('Admin user seeded:', SEED_ADMIN_EMAIL);
    console.log('Development user seeded:', SEED_DEV_EMAIL);
    console.log('Passwords were supplied at runtime and are not printed.\n');

  } catch (error) {
    console.error('❌ Seeding error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('✅ Database connection closed');
  }
};

// Run seeding
connectDB().then(seedData);
