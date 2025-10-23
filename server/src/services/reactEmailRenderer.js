// Register Babel to handle JSX
require('@babel/register')({
  presets: ['@babel/preset-react']
});

const { render } = require('@react-email/render');
const React = require('react');

// Import React Email components
const WelcomeEmail = require('../emails/WelcomeEmail.jsx').default;
const VerificationEmail = require('../emails/VerificationEmail.jsx').default;
const PasswordResetEmail = require('../emails/PasswordResetEmail.jsx').default;
const NewBlogEmail = require('../emails/NewBlogEmail.jsx').default;
const UnsubscribeEmail = require('../emails/UnsubscribeEmail.jsx').default;
const AdminNotificationEmail = require('../emails/AdminNotificationEmail.jsx').default;
const AccountDeletionEmail = require('../emails/AccountDeletionEmail.jsx').default;

class ReactEmailRenderer {
  /**
   * Render welcome email
   */
  async renderWelcomeEmail(data) {
    const { username, userEmail, loginUrl } = data;
    
    const emailComponent = React.createElement(WelcomeEmail, {
      username: username || 'there',
      userEmail: userEmail || 'user@example.com',
      loginUrl: loginUrl || `${process.env.CLIENT_URL || 'https://nationalparksexplorerusa.com'}/login`
    });

    return await render(emailComponent);
  }

  /**
   * Render email verification email
   */
  async renderVerificationEmail(data) {
    const { username, verificationUrl, verificationCode } = data;
    
    const emailComponent = React.createElement(VerificationEmail, {
      username: username || 'there',
      verificationUrl: verificationUrl || 'https://nationalparksexplorerusa.com/verify?token=abc123',
      verificationCode: verificationCode || '123456'
    });

    return await render(emailComponent);
  }

  /**
   * Render password reset email
   */
  async renderPasswordResetEmail(data) {
    const { username, resetUrl, expirationTime } = data;
    
    const emailComponent = React.createElement(PasswordResetEmail, {
      username: username || 'there',
      resetUrl: resetUrl || 'https://nationalparksexplorerusa.com/reset-password?token=abc123',
      expirationTime: expirationTime || '1 hour'
    });

    return await render(emailComponent);
  }

  /**
   * Render new blog email
   */
  async renderNewBlogEmail(data) {
    const { 
      username, 
      blogTitle, 
      blogExcerpt, 
      blogUrl, 
      blogImageUrl, 
      blogCategory, 
      publishDate, 
      readTime, 
      authorName 
    } = data;
    
    const emailComponent = React.createElement(NewBlogEmail, {
      username: username || 'there',
      blogTitle: blogTitle || 'New TrailVerse Blog Post',
      blogExcerpt: blogExcerpt || 'Check out our latest article about America\'s national parks...',
      blogUrl: blogUrl || 'https://nationalparksexplorerusa.com/blog/latest',
      blogImageUrl: blogImageUrl || 'https://via.placeholder.com/600x300/4F46E5/ffffff?text=TrailVerse+Blog',
      blogCategory: blogCategory || 'Park Guides',
      publishDate: publishDate || new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      readTime: readTime || '5 min read',
      authorName: authorName || 'TrailVerse Team'
    });

    return await render(emailComponent);
  }

  /**
   * Render unsubscribe confirmation email
   */
  async renderUnsubscribeEmail(data) {
    const { username, userEmail, resubscribeUrl, preferencesUrl, reason } = data;
    
    const emailComponent = React.createElement(UnsubscribeEmail, {
      username: username || 'there',
      userEmail: userEmail || 'user@example.com',
      resubscribeUrl: resubscribeUrl || 'https://nationalparksexplorerusa.com/resubscribe?token=abc123',
      preferencesUrl: preferencesUrl || 'https://nationalparksexplorerusa.com/preferences',
      reason: reason || 'all emails'
    });

    return await render(emailComponent);
  }

  /**
   * Render admin notification email
   */
  async renderAdminNotificationEmail(data) {
    const { 
      userName, 
      userEmail, 
      userId, 
      registrationDate, 
      verificationStatus, 
      statusBgColor, 
      statusTextColor, 
      totalUsers, 
      usersThisMonth, 
      adminDashboardUrl, 
      userProfileUrl 
    } = data;
    
    const emailComponent = React.createElement(AdminNotificationEmail, {
      userName: userName || 'John Doe',
      userEmail: userEmail || 'john@example.com',
      userId: userId || '507f1f77bcf86cd799439011',
      registrationDate: registrationDate || new Date().toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit', 
        timeZoneName: 'short' 
      }),
      verificationStatus: verificationStatus || '⏳ Pending Verification',
      statusBgColor: statusBgColor || '#fef3c7',
      statusTextColor: statusTextColor || '#92400e',
      totalUsers: totalUsers || '1,234',
      usersThisMonth: usersThisMonth || '45',
      adminDashboardUrl: adminDashboardUrl || 'https://nationalparksexplorerusa.com/admin/dashboard',
      userProfileUrl: userProfileUrl || 'https://nationalparksexplorerusa.com/admin/users/507f1f77bcf86cd799439011'
    });

    return await render(emailComponent);
  }

  /**
   * Render account deletion confirmation email
   */
  async renderAccountDeletionEmail(data) {
    const { 
      username, 
      userEmail, 
      deletionDate, 
      dataRetentionPeriod, 
      reactivationUrl, 
      supportEmail 
    } = data;
    
    const emailComponent = React.createElement(AccountDeletionEmail, {
      username: username || 'there',
      userEmail: userEmail || 'user@example.com',
      deletionDate: deletionDate || new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      dataRetentionPeriod: dataRetentionPeriod || '30 days',
      reactivationUrl: reactivationUrl || 'https://nationalparksexplorerusa.com/reactivate?token=abc123',
      supportEmail: supportEmail || 'trailverseteam@gmail.com'
    });

    return await render(emailComponent);
  }
}

module.exports = new ReactEmailRenderer();
