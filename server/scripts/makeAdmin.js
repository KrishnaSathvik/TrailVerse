require('dotenv').config({ path: '/Users/krishnasathvikmantripragada/npe-usa/server/.env.development' });
const mongoose = require('mongoose');
const User = require('../src/models/User');
const connectDB = require('../src/config/database');

const makeAdmin = async (email) => {
  try {
    await connectDB();
    
    const user = await User.findOneAndUpdate(
      { email },
      { role: 'admin' },
      { new: true }
    );
    
    if (user) {
      console.log(`✅ ${email} is now an admin`);
    } else {
      console.log(`❌ User with email ${email} not found`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

// Get email from command line argument
const email = process.argv[2];

if (!email) {
  console.log('Usage: node makeAdmin.js user@example.com');
  process.exit(1);
}

makeAdmin(email);
