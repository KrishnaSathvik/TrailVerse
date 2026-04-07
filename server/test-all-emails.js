/**
 * Test script: sends all 9 email templates to a given address.
 * Usage: node test-all-emails.js <email>
 */
require('dotenv').config();

const resendEmailService = require('./src/services/resendEmailService');

const TARGET = process.argv[2];
if (!TARGET) {
  console.error('Usage: node test-all-emails.js <email>');
  process.exit(1);
}

const fakeUser = {
  _id: '507f1f77bcf86cd799439011',
  name: 'Krishna',
  firstName: 'Krishna',
  email: TARGET,
  isEmailVerified: false,
  createdAt: new Date()
};

const fakePost = {
  _id: '507f1f77bcf86cd799439012',
  title: 'Best National Parks for Thanksgiving: Skip Dinner, Chase Sunsets',
  excerpt: 'Discover the best national parks to visit during Thanksgiving. From the Grand Canyon to Zion, these parks offer incredible fall experiences...',
  slug: 'best-national-parks-for-thanksgiving-skip-dinner-chase-sunsets',
  category: 'Park Guides',
  readTime: 8,
  author: 'TrailVerse Team',
  featuredImage: 'https://www.nationalparksexplorerusa.com/android-chrome-192x192.png',
  createdAt: new Date()
};

const fakeSubscriber = {
  email: TARGET,
  firstName: 'Krishna',
  confirmUrl: 'https://nationalparksexplorerusa.com/api/subscribers/confirm/test-token-123'
};

const templates = [
  {
    name: '1. Welcome',
    fn: () => resendEmailService.sendWelcomeEmail(fakeUser)
  },
  {
    name: '2. Email Verification',
    fn: () => resendEmailService.sendEmailVerification(fakeUser, 'https://nationalparksexplorerusa.com/verify?token=test123')
  },
  {
    name: '3. Password Reset',
    fn: () => resendEmailService.sendPasswordReset(fakeUser, 'https://nationalparksexplorerusa.com/reset-password?token=test123')
  },
  {
    name: '4. New Blog Post',
    fn: () => resendEmailService.sendBlogNotification(fakeUser, fakePost)
  },
  {
    name: '5. Unsubscribe Confirmation',
    fn: () => resendEmailService.sendUnsubscribeConfirmation(fakeUser, 'all emails')
  },
  {
    name: '6. Admin New User Notification',
    fn: () => {
      // Override ADMIN_EMAIL to send to the test address
      const orig = process.env.ADMIN_EMAIL;
      process.env.ADMIN_EMAIL = TARGET;
      return resendEmailService.sendAdminNewUserNotification(fakeUser).finally(() => {
        process.env.ADMIN_EMAIL = orig;
      });
    }
  },
  {
    name: '7. Account Deletion',
    fn: () => resendEmailService.sendAccountDeletionConfirmation(fakeUser)
  },
  {
    name: '8. Feature Announcement',
    fn: () => resendEmailService.sendFeatureAnnouncementEmail(fakeUser)
  },
  {
    name: '9. Newsletter Confirmation',
    fn: () => resendEmailService.sendNewsletterConfirmation(fakeSubscriber)
  }
];

(async () => {
  console.log(`\n📧 Sending all 9 email templates to: ${TARGET}\n`);

  for (const t of templates) {
    try {
      await t.fn();
      console.log(`  ✅ ${t.name}`);
    } catch (err) {
      console.error(`  ❌ ${t.name}: ${err.message}`);
    }
    // 1s delay between sends to respect rate limits
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n🎉 Done! Check your inbox.\n');
  process.exit(0);
})();
