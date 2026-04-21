const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Create reusable transporter object using Gmail SMTP
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Simple email tracking (in-memory, capped to prevent unbounded growth)
const EMAIL_TRACKING_MAX = 500;
const emailTracking = new Map();

// Evict oldest entries when the map exceeds the cap
const evictOldTracking = () => {
  if (emailTracking.size <= EMAIL_TRACKING_MAX) return;
  const excess = emailTracking.size - EMAIL_TRACKING_MAX;
  const iter = emailTracking.keys();
  for (let i = 0; i < excess; i++) {
    emailTracking.delete(iter.next().value);
  }
};

// Helper to generate tracking ID
const generateTrackingId = () => uuidv4();

// Helper to generate tracking pixel
const generateTrackingPixel = (trackingId) => {
  return `<img src="${process.env.CLIENT_URL || 'https://www.nationalparksexplorerusa.com'}/api/email/track/open/${trackingId}" width="1" height="1" style="display:none;" alt="" />`;
};

// Helper to track email delivery
const trackEmailDelivery = async (trackingId, status, metadata = {}) => {
  emailTracking.set(trackingId, {
    status,
    metadata,
    timestamp: new Date()
  });
  evictOldTracking();
  console.log(`📧 Email tracking: ${trackingId} - ${status}`, metadata);
};

// Helper to get email delivery status
const getEmailDeliveryStatus = (trackingId) => {
  return emailTracking.get(trackingId) || null;
};

// Helper to compile email template
const compileTemplate = async (templateName, data) => {
  try {
    const templatePath = path.join(__dirname, '../../templates/emails', `${templateName}.html`);
    const templateContent = await fs.readFile(templatePath, 'utf-8');
    const template = handlebars.compile(templateContent);
    
    // Add common variables
    const commonData = {
      logoUrl: 'https://www.nationalparksexplorerusa.com/logo.png',
      websiteUrl: 'https://www.nationalparksexplorerusa.com',
      privacyUrl: 'https://www.nationalparksexplorerusa.com/privacy',
      termsUrl: 'https://www.nationalparksexplorerusa.com/terms',
      helpUrl: 'https://www.nationalparksexplorerusa.com/faq',
      dashboardUrl: 'https://www.nationalparksexplorerusa.com/profile',
      twitterUrl: 'https://twitter.com/TrailVerse',
      instagramUrl: 'https://instagram.com/trailverse',
      facebookUrl: 'https://facebook.com/trailverse',
      unsubscribeUrl: `https://www.nationalparksexplorerusa.com/unsubscribe?email=${data.email || ''}`,
      supportEmail: 'trailverseteam@gmail.com',
      showAddress: false, // Hide the address
      ...data
    };
    
    return template(commonData);
  } catch (error) {
    console.error('Error compiling email template:', error);
    throw error;
  }
};

/**
 * Simple Email Service
 * Sends emails directly without Redis queue
 */
class SimpleEmailService {
  
  /**
   * Send welcome email
   */
  async sendWelcomeEmail(user) {
    const trackingId = generateTrackingId();

    try {
      await trackEmailDelivery(trackingId, 'queued', {
        emailType: 'welcome',
        userEmail: user.email,
        timestamp: new Date(),
      });

      const html = await compileTemplate('welcome', {
        firstName: user.firstName || user.name,
        email: user.email,
        trackingPixel: generateTrackingPixel(trackingId),
        trackingId
      });

      const mailOptions = {
        from: {
          name: process.env.EMAIL_FROM_NAME || 'TrailVerse',
          address: process.env.EMAIL_USER
        },
        to: user.email,
        subject: 'Welcome to TrailVerse! 🏞️',
        html
      };

      const result = await transporter.sendMail(mailOptions);
      
      await trackEmailDelivery(trackingId, 'delivered', {
        emailType: 'welcome',
        userEmail: user.email,
        timestamp: new Date(),
      });

      console.log(`✅ Welcome email sent to: ${user.email}`);
      return result;
    } catch (error) {
      await trackEmailDelivery(trackingId, 'failed', {
        emailType: 'welcome',
        userEmail: user.email,
        error: error.message,
        timestamp: new Date(),
      });
      console.error('❌ Error sending welcome email:', error);
      throw error;
    }
  }

  /**
   * Send blog notification email
   */
  async sendBlogNotification(user, post) {
    const trackingId = generateTrackingId();

    try {
      await trackEmailDelivery(trackingId, 'queued', {
        emailType: 'blog_notification',
        userEmail: user.email,
        postId: post._id,
        timestamp: new Date(),
      });

      const html = await compileTemplate('blog-notification', {
        firstName: user.firstName || user.name,
        email: user.email,
        postTitle: post.title,
        postExcerpt: post.excerpt || post.content?.substring(0, 200) + '...',
        postUrl: `${process.env.CLIENT_URL || 'https://www.nationalparksexplorerusa.com'}/blog/${post.slug}`,
        trackingPixel: generateTrackingPixel(trackingId),
        trackingId
      });

      const mailOptions = {
        from: {
          name: process.env.EMAIL_FROM_NAME || 'TrailVerse',
          address: process.env.EMAIL_USER
        },
        to: user.email,
        subject: `New TrailVerse Blog: ${post.title} 📝`,
        html
      };

      const result = await transporter.sendMail(mailOptions);
      
      await trackEmailDelivery(trackingId, 'delivered', {
        emailType: 'blog_notification',
        userEmail: user.email,
        postId: post._id,
        timestamp: new Date(),
      });

      console.log(`✅ Blog notification sent to: ${user.email}`);
      return result;
    } catch (error) {
      await trackEmailDelivery(trackingId, 'failed', {
        emailType: 'blog_notification',
        userEmail: user.email,
        postId: post._id,
        error: error.message,
        timestamp: new Date(),
      });
      console.error('❌ Error sending blog notification:', error);
      throw error;
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset(user, resetToken) {
    const trackingId = generateTrackingId();

    try {
      await trackEmailDelivery(trackingId, 'queued', {
        emailType: 'password_reset',
        userEmail: user.email,
        timestamp: new Date(),
      });

      const html = await compileTemplate('password-reset', {
        firstName: user.firstName || user.name,
        email: user.email,
        resetUrl: `${process.env.CLIENT_URL || 'https://www.nationalparksexplorerusa.com'}/reset-password?token=${resetToken}`,
        trackingPixel: generateTrackingPixel(trackingId),
        trackingId
      });

      const mailOptions = {
        from: {
          name: process.env.EMAIL_FROM_NAME || 'TrailVerse',
          address: process.env.EMAIL_USER
        },
        to: user.email,
        subject: 'Reset Your TrailVerse Password 🔐',
        html
      };

      const result = await transporter.sendMail(mailOptions);
      
      await trackEmailDelivery(trackingId, 'delivered', {
        emailType: 'password_reset',
        userEmail: user.email,
        timestamp: new Date(),
      });

      console.log(`✅ Password reset email sent to: ${user.email}`);
      return result;
    } catch (error) {
      await trackEmailDelivery(trackingId, 'failed', {
        emailType: 'password_reset',
        userEmail: user.email,
        error: error.message,
        timestamp: new Date(),
      });
      console.error('❌ Error sending password reset email:', error);
      throw error;
    }
  }

  /**
   * Send email verification email
   */
  async sendEmailVerification(user, verificationToken) {
    const trackingId = generateTrackingId();

    try {
      await trackEmailDelivery(trackingId, 'queued', {
        emailType: 'email_verification',
        userEmail: user.email,
        timestamp: new Date(),
      });

      const html = await compileTemplate('email-verification', {
        firstName: user.firstName || user.name,
        email: user.email,
        verificationUrl: `${process.env.CLIENT_URL || 'https://www.nationalparksexplorerusa.com'}/verify-email?token=${verificationToken}`,
        trackingPixel: generateTrackingPixel(trackingId),
        trackingId
      });

      const mailOptions = {
        from: {
          name: process.env.EMAIL_FROM_NAME || 'TrailVerse',
          address: process.env.EMAIL_USER
        },
        to: user.email,
        subject: 'Verify Your TrailVerse Email ✉️',
        html
      };

      const result = await transporter.sendMail(mailOptions);
      
      await trackEmailDelivery(trackingId, 'delivered', {
        emailType: 'email_verification',
        userEmail: user.email,
        timestamp: new Date(),
      });

      console.log(`✅ Email verification sent to: ${user.email}`);
      return result;
    } catch (error) {
      await trackEmailDelivery(trackingId, 'failed', {
        emailType: 'email_verification',
        userEmail: user.email,
        error: error.message,
        timestamp: new Date(),
      });
      console.error('❌ Error sending email verification:', error);
      throw error;
    }
  }

  /**
   * Get email delivery status
   */
  getEmailDeliveryStatus(trackingId) {
    return getEmailDeliveryStatus(trackingId);
  }

  /**
   * Get email statistics
   */
  getEmailStats() {
    const stats = {
      total: emailTracking.size,
      delivered: 0,
      failed: 0,
      queued: 0
    };

    for (const [trackingId, data] of emailTracking) {
      stats[data.status] = (stats[data.status] || 0) + 1;
    }

    return stats;
  }
}

module.exports = new SimpleEmailService();
