'use strict';

const User = require('../../models/User');
const Subscriber = require('../../models/Subscriber');
const BlogPost = require('../../models/BlogPost');

jest.mock('../../services/resendEmailService', () => ({
  sendBlogNotification: jest.fn().mockResolvedValue(undefined),
}));

const emailService = require('../../services/resendEmailService');
const { sendBlogNotifications } = require('../blogController');

describe('sendBlogNotifications audience', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-resend-key';
    process.env.EMAIL_FROM_ADDRESS = 'noreply@example.com';
    emailService.sendBlogNotification.mockResolvedValue(undefined);
  });

  test('emails registered users with blogNotifications and not Subscriber rows', async () => {
    const user = await User.create({
      name: 'Blog User',
      email: 'blog-user@example.com',
      password: 'password123',
      emailNotifications: { blogNotifications: true },
    });
    await Subscriber.create({
      email: 'newsletter-only@example.com',
      status: 'subscribed',
      confirmed: true,
      confirmedAt: new Date(),
      source: 'newsletter-page',
    });
    const post = await BlogPost.create({
      title: 'Public post',
      excerpt: 'Excerpt',
      content: 'Content',
      author: 'TrailVerse',
      status: 'published',
    });

    await sendBlogNotifications(post);

    expect(emailService.sendBlogNotification).toHaveBeenCalledTimes(1);
    expect(emailService.sendBlogNotification.mock.calls[0][0].email).toBe(user.email);
  });
});
