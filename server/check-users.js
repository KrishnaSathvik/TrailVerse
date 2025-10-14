const mongoose = require('mongoose');
const User = require('./src/models/User');
require('dotenv').config();

async function checkUsers() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get total user count
    const totalUsers = await User.countDocuments();
    console.log(`📊 Total Users: ${totalUsers}\n`);

    if (totalUsers === 0) {
      console.log('❌ No users found in the database');
      return;
    }

    // Get user statistics
    const verifiedUsers = await User.countDocuments({ isEmailVerified: true });
    const unverifiedUsers = await User.countDocuments({ isEmailVerified: false });
    const adminUsers = await User.countDocuments({ role: 'admin' });
    const regularUsers = await User.countDocuments({ role: { $ne: 'admin' } });

    console.log('📈 User Statistics:');
    console.log(`   Total Users: ${totalUsers}`);
    console.log(`   Verified Users: ${verifiedUsers}`);
    console.log(`   Unverified Users: ${unverifiedUsers}`);
    console.log(`   Admin Users: ${adminUsers}`);
    console.log(`   Regular Users: ${regularUsers}\n`);

    // Get all users with basic info
    const users = await User.find({})
      .select('_id email firstName name isEmailVerified role createdAt lastLoginAt')
      .sort({ createdAt: -1 })
      .lean();

    console.log('👥 User List:');
    console.log('─'.repeat(120));
    console.log('ID'.padEnd(25) + 'Email'.padEnd(35) + 'Name'.padEnd(20) + 'Verified'.padEnd(10) + 'Role'.padEnd(10) + 'Created');
    console.log('─'.repeat(120));

    users.forEach((user, index) => {
      const id = user._id.toString().substring(0, 8) + '...';
      const email = user.email.length > 30 ? user.email.substring(0, 30) + '...' : user.email;
      const name = (user.firstName || user.name || 'N/A').substring(0, 15);
      const verified = user.isEmailVerified ? '✅' : '❌';
      const role = user.role || 'user';
      const created = new Date(user.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });

      console.log(
        id.padEnd(25) +
        email.padEnd(35) +
        name.padEnd(20) +
        verified.padEnd(10) +
        role.padEnd(10) +
        created
      );
    });

    console.log('─'.repeat(120));
    console.log(`\n📧 Users eligible for feature announcement: ${verifiedUsers - adminUsers}`);

    // Show recent users (last 7 days)
    const recentUsers = await User.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    });
    console.log(`🆕 New users in last 7 days: ${recentUsers}`);

  } catch (error) {
    console.error('❌ Error checking users:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from database');
  }
}

checkUsers();
