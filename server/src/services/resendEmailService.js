const { Resend } = require('resend');
const handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');

// Initialize Resend with API key
const apiKey = process.env.RESEND_API_KEY || 're_55uKwRN8_Nz9u7nJ4drCscszKbQuKhUf5';
console.log('🔑 Resend API Key:', apiKey ? 'Found' : 'Missing');
const resend = new Resend(apiKey);

// Helper to compile email template
const compileTemplate = async (templateName, data) => {
  try {
    const templatePath = path.join(__dirname, '../../templates/emails', `${templateName}.html`);
    const templateContent = await fs.readFile(templatePath, 'utf-8');
    const template = handlebars.compile(templateContent);
    
    // Add common variables
    const commonData = {
      logoUrl: `${process.env.WEBSITE_URL || 'https://www.nationalparksexplorerusa.com'}/android-chrome-192x192.png`,
      websiteUrl: process.env.WEBSITE_URL || 'https://www.nationalparksexplorerusa.com',
      privacyUrl: `${process.env.WEBSITE_URL || 'https://www.nationalparksexplorerusa.com'}/privacy`,
      termsUrl: `${process.env.WEBSITE_URL || 'https://www.nationalparksexplorerusa.com'}/terms`,
      helpUrl: `${process.env.WEBSITE_URL || 'https://www.nationalparksexplorerusa.com'}/faq`,
      dashboardUrl: `${process.env.WEBSITE_URL || 'https://www.nationalparksexplorerusa.com'}/profile`,
      unsubscribeUrl: `${process.env.WEBSITE_URL || 'https://www.nationalparksexplorerusa.com'}/unsubscribe?email=${data.email || ''}`,
      supportEmail: process.env.SUPPORT_EMAIL || 'trailverseteam@gmail.com',
      showAddress: false,
      ...data
    };
    
    return template(commonData);
  } catch (error) {
    console.error('Error compiling email template:', error);
    throw error;
  }
};

class ResendEmailService {
  async sendWelcomeEmail(user) {
    try {
      const html = await compileTemplate('welcome', {
        firstName: user.firstName || user.name,
        email: user.email
      });

      const { data, error } = await resend.emails.send({
        from: `${process.env.EMAIL_FROM_NAME || 'TrailVerse'} <${process.env.EMAIL_FROM_ADDRESS}>`,
        to: user.email,
        reply_to: 'trailverseteam@gmail.com',
        subject: 'Welcome to TrailVerse! 🏞️',
        html,
        // Add tags for tracking
        tags: [
          { name: 'category', value: 'welcome' }
        ]
      });

      if (error) {
        throw error;
      }

      console.log(`✅ Welcome email sent to: ${user.email}`, data);
    } catch (error) {
      console.error('❌ Error sending welcome email:', error);
      throw error;
    }
  }

  async sendEmailVerification(user, verificationUrl) {
    try {
      const html = await compileTemplate('email-verification', {
        firstName: user.firstName || user.name,
        email: user.email,
        verificationUrl
      });

      const { data, error } = await resend.emails.send({
        from: `${process.env.EMAIL_FROM_NAME || 'TrailVerse'} <${process.env.EMAIL_FROM_ADDRESS}>`,
        to: user.email,
        reply_to: 'trailverseteam@gmail.com',
        subject: 'Verify Your TrailVerse Account',
        html,
        // Add tags for tracking
        tags: [
          { name: 'category', value: 'verification' },
          { name: 'priority', value: 'high' }
        ]
      });

      if (error) {
        throw error;
      }

      console.log(`✅ Verification email sent to: ${user.email}`, data);
    } catch (error) {
      console.error('❌ Error sending verification email:', error);
      throw error;
    }
  }

  async sendPasswordReset(user, resetUrl) {
    try {
      const html = await compileTemplate('password-reset', {
        firstName: user.firstName || user.name,
        email: user.email,
        resetUrl
      });

      const { data, error } = await resend.emails.send({
        from: `${process.env.EMAIL_FROM_NAME || 'TrailVerse'} <${process.env.EMAIL_FROM_ADDRESS}>`,
        to: user.email,
        reply_to: 'trailverseteam@gmail.com',
        subject: 'Reset Your TrailVerse Password',
        html,
        // Add tags for tracking
        tags: [
          { name: 'category', value: 'password-reset' },
          { name: 'priority', value: 'high' }
        ]
      });

      if (error) {
        throw error;
      }

      console.log(`✅ Password reset email sent to: ${user.email}`, data);
    } catch (error) {
      console.error('❌ Error sending password reset email:', error);
      throw error;
    }
  }

  async sendBlogNotification(user, post) {
    try {
      // Generate author initials for avatar
      const authorInitials = post.author 
        ? post.author.split(' ').map(name => name.charAt(0)).join('').toUpperCase().slice(0, 2) 
        : 'TV';

      const html = await compileTemplate('blog-notification', {
        firstName: user.firstName || user.name,
        email: user.email,
        title: post.title,
        excerpt: post.excerpt,
        featuredImage: post.featuredImage,
        category: post.category,
        author: post.author,
        authorInitials: authorInitials,
        readTime: post.readTime,
        tags: post.tags,
        slug: post.slug
      });

      const { data, error } = await resend.emails.send({
        from: `${process.env.EMAIL_FROM_NAME || 'TrailVerse'} <${process.env.EMAIL_FROM_ADDRESS}>`,
        to: user.email,
        reply_to: 'trailverseteam@gmail.com',
        subject: `New Blog Post: ${post.title}`,
        html,
        // Add tags for tracking
        tags: [
          { name: 'category', value: 'blog-notification' },
          { name: 'blog-category', value: post.category || 'general' }
        ]
      });

      if (error) {
        throw error;
      }

      console.log(`✅ Blog notification sent to: ${user.email}`, data);
    } catch (error) {
      console.error(`❌ Failed to send blog notification to ${user.email}:`, error);
      throw error;
    }
  }

  async sendAdminNewUserNotification(user) {
    try {
      const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_FROM_ADDRESS;
      
      if (!adminEmail) {
        console.warn('⚠️ ADMIN_EMAIL not configured, skipping admin notification');
        return;
      }

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 30px;">
            <h1 style="color: white; margin: 0; font-size: 24px;">🎉 New User Registration!</h1>
          </div>
          
          <div style="background-color: #f8fafc; padding: 25px; border-radius: 8px; border-left: 4px solid #059669;">
            <h2 style="color: #111827; margin: 0 0 20px 0;">User Details:</h2>
            
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 10px 0; font-weight: bold; color: #374151;">Name:</td>
                <td style="padding: 10px 0; color: #111827;">${user.name}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; font-weight: bold; color: #374151;">Email:</td>
                <td style="padding: 10px 0; color: #111827;">${user.email}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; font-weight: bold; color: #374151;">Registration Date:</td>
                <td style="padding: 10px 0; color: #111827;">${new Date(user.createdAt).toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; font-weight: bold; color: #374151;">Email Verified:</td>
                <td style="padding: 10px 0; color: ${user.isEmailVerified ? '#059669' : '#dc2626'};">
                  ${user.isEmailVerified ? '✅ Yes' : '❌ No'}
                </td>
              </tr>
            </table>
          </div>
          
          <div style="margin-top: 30px; text-align: center;">
            <a href="${process.env.CLIENT_URL}/admin/dashboard" 
               style="display: inline-block; background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              View Admin Dashboard
            </a>
          </div>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; text-align: center;">
            <p>This is an automated notification from TrailVerse.</p>
            <p>You're receiving this because you're an administrator.</p>
          </div>
        </div>
      `;

      const { data, error } = await resend.emails.send({
        from: `${process.env.EMAIL_FROM_NAME || 'TrailVerse'} <${process.env.EMAIL_FROM_ADDRESS}>`,
        to: adminEmail,
        subject: '🎉 New User Registration - TrailVerse',
        html,
        tags: [
          { name: 'category', value: 'admin-notification' }
        ]
      });

      if (error) {
        console.error('❌ Error sending admin notification:', error);
        return; // Don't throw - admin notification shouldn't break user registration
      }

      console.log(`✅ Admin notification sent for new user: ${user.email}`, data);
    } catch (error) {
      console.error('❌ Error sending admin notification:', error);
      // Don't throw error to avoid breaking user registration
    }
  }

  async sendFeatureAnnouncementEmail(user) {
    try {
      const html = await compileTemplate('feature-announcement', {
        firstName: user.firstName || user.name,
        email: user.email,
        mapUrl: `${process.env.WEBSITE_URL || 'https://www.nationalparksexplorerusa.com'}/map`,
        shareUrl: `${process.env.WEBSITE_URL || 'https://www.nationalparksexplorerusa.com'}?ref=feature-announcement`
      });

      // Use a verified domain for Resend
      const fromAddress = process.env.EMAIL_FROM_ADDRESS || 'onboarding@resend.dev';
      const fromName = process.env.EMAIL_FROM_NAME || 'TrailVerse';
      
      const { data, error } = await resend.emails.send({
        from: `${fromName} <${fromAddress}>`,
        to: user.email,
        reply_to: 'trailverseteam@gmail.com',
        subject: '🎉 New Features: Google Maps & Enhanced Experience - TrailVerse',
        html,
        tags: [
          { name: 'category', value: 'feature-announcement' },
          { name: 'user-type', value: 'existing' }
        ]
      });

      if (error) {
        console.error('❌ Error sending feature announcement email:', error);
        throw error;
      }

      console.log(`✅ Feature announcement email sent to: ${user.email}`, data);
      return data;
    } catch (error) {
      console.error('❌ Error sending feature announcement email:', error);
      throw error;
    }
  }

  async sendBulkFeatureAnnouncement(users) {
    try {
      const results = [];
      const batchSize = 1; // Process one at a time to respect rate limits
      
      for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (user) => {
          try {
            const result = await this.sendFeatureAnnouncementEmail(user);
            return { success: true, user: user.email, data: result };
          } catch (error) {
            console.error(`❌ Failed to send feature announcement to ${user.email}:`, error);
            return { success: false, user: user.email, error: error.message };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        // Add delay between emails to respect rate limits (2 requests per second)
        if (i + batchSize < users.length) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay between emails
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;
      
      console.log(`📊 Bulk feature announcement completed: ${successCount} sent, ${failureCount} failed`);
      
      return {
        total: users.length,
        success: successCount,
        failed: failureCount,
        results
      };
    } catch (error) {
      console.error('❌ Error sending bulk feature announcement:', error);
      throw error;
    }
  }
}

module.exports = new ResendEmailService();

