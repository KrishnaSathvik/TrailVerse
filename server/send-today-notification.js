/**
 * One-off script: Send blog notification for today's post to all subscribed users.
 * Usage: cd server && node ../send-today-notification.js
 */
require('dotenv').config({ path: __dirname + '/../.env.production' });
const mongoose = require('mongoose');
const { Resend } = require('resend');
const reactEmailRenderer = require('./src/services/reactEmailRenderer');

const resend = new Resend(process.env.RESEND_API_KEY);

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;

  // Find today's blog post
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const post = await db.collection('blogposts').findOne({
    status: 'published',
    publishedAt: { $gte: today }
  });

  if (!post) {
    console.error('No blog post published today!');
    process.exit(1);
  }
  console.log(`Found post: "${post.title}"`);
  console.log(`Slug: ${post.slug}\n`);

  // All subscribed registered users
  const users = await db.collection('users').find({
    $or: [
      { emailNotifications: true },
      { 'emailNotifications.blogNotifications': true }
    ]
  }, { projection: { email: 1, name: 1, firstName: 1 } }).toArray();

  // Also include confirmed newsletter subscribers (deduplicate later)
  const subscribers = await db.collection('subscribers').find(
    { confirmed: true },
    { projection: { email: 1, firstName: 1 } }
  ).toArray();

  const userEmails = new Set(users.map(u => u.email.toLowerCase()));
  const newSubs = subscribers.filter(s => !userEmails.has(s.email.toLowerCase()));
  for (const s of newSubs) {
    users.push({ email: s.email, firstName: s.firstName, name: s.firstName });
  }

  console.log(`Sending to ${users.length} users...\n`);

  let sent = 0;
  let failed = 0;

  for (const user of users) {
    try {
      const html = await reactEmailRenderer.renderNewBlogEmail({
        username: user.firstName || user.name,
        blogTitle: post.title,
        blogExcerpt: post.excerpt,
        blogUrl: `https://www.nationalparksexplorerusa.com/blog/${post.slug}`,
        blogImageUrl: post.featuredImage || 'https://via.placeholder.com/600x300/4F46E5/ffffff?text=TrailVerse+Blog',
        blogCategory: post.category || 'Park Guides',
        publishDate: new Date(post.publishedAt || post.createdAt).toLocaleDateString('en-US', {
          year: 'numeric', month: 'long', day: 'numeric'
        }),
        readTime: post.readTime ? `${post.readTime} min read` : '5 min read',
        authorName: post.author || 'Krishna'
      });

      const { error } = await resend.emails.send({
        from: `${process.env.EMAIL_FROM_NAME || 'TrailVerse'} <${process.env.EMAIL_FROM_ADDRESS}>`,
        to: user.email,
        reply_to: 'trailverseteam@gmail.com',
        subject: `New on TrailVerse: ${post.title}`,
        html,
        tags: [
          { name: 'category', value: 'blog-notification' },
          { name: 'blog-category', value: (post.category || 'general').toLowerCase().replace(/[^a-z0-9-]/g, '-') }
        ]
      });

      if (error) throw error;
      sent++;
      console.log(`  ✅ ${user.email}`);
    } catch (err) {
      failed++;
      console.error(`  ❌ ${user.email}: ${err.message}`);
    }

    // Small delay to respect Resend rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`\nDone: ${sent} sent, ${failed} failed`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
