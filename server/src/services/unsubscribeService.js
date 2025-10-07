const crypto = require('crypto');
const User = require('../models/User');

/**
 * Unsubscribe Service
 * Handles user unsubscribe preferences and email subscription management
 */
class UnsubscribeService {
  
  /**
   * Generate secure unsubscribe token
   */
  generateUnsubscribeToken(email, emailType = null) {
    const data = emailType ? `${email}:${emailType}` : email;
    const secret = process.env.UNSUBSCRIBE_SECRET || process.env.JWT_SECRET;
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }

  /**
   * Verify unsubscribe token
   */
  verifyUnsubscribeToken(token, email, emailType = null) {
    const expectedToken = this.generateUnsubscribeToken(email, emailType);
    return crypto.timingSafeEqual(
      Buffer.from(token, 'hex'),
      Buffer.from(expectedToken, 'hex')
    );
  }

  /**
   * Get user's current email preferences
   */
  async getUserEmailPreferences(email) {
    try {
      const user = await User.findOne({ email }).select('emailNotifications');
      if (!user) {
        return null;
      }

      return {
        emailNotifications: user.emailNotifications,
        email: user.email
      };
    } catch (error) {
      console.error('Error getting user email preferences:', error);
      throw error;
    }
  }

  /**
   * Update user's email preferences
   */
  async updateEmailPreferences(email, preferences) {
    try {
      const updateData = {};
      
      // Update email notifications setting
      if (preferences.emailNotifications !== undefined) {
        updateData.emailNotifications = preferences.emailNotifications;
      }

      const user = await User.findOneAndUpdate(
        { email },
        { $set: updateData },
        { new: true, select: 'email emailNotifications' }
      );

      if (!user) {
        throw new Error('User not found');
      }

      console.log(`📧 Updated email preferences for ${email}:`, updateData);
      return user;
    } catch (error) {
      console.error('Error updating email preferences:', error);
      throw error;
    }
  }

  /**
   * Unsubscribe user from all emails (simplified system)
   */
  async unsubscribe(email, emailType = null, token = null) {
    try {
      // Verify token if provided
      if (token && !this.verifyUnsubscribeToken(token, email, emailType)) {
        throw new Error('Invalid unsubscribe token');
      }

      const user = await User.findOne({ email });
      if (!user) {
        throw new Error('User not found');
      }

      // Turn off email notifications (affects all email types)
      const updateData = { emailNotifications: false };
      await User.findOneAndUpdate({ email }, { $set: updateData });
      
      const message = `Successfully unsubscribed ${email} from all TrailVerse emails`;
      console.log(`📧 ${message}`);
      
      return {
        success: true,
        message,
        email,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error processing unsubscribe:', error);
      throw error;
    }
  }

  /**
   * Resubscribe user to emails
   */
  async resubscribe(email, preferences = {}) {
    try {
      const user = await User.findOne({ email });
      if (!user) {
        throw new Error('User not found');
      }

      const updateData = {
        emailNotifications: true
      };

      await User.findOneAndUpdate({ email }, { $set: updateData });
      
      console.log(`📧 Resubscribed ${email} to TrailVerse emails`);
      return {
        success: true,
        message: `Successfully resubscribed ${email} to TrailVerse emails`,
        email,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error processing resubscribe:', error);
      throw error;
    }
  }

  /**
   * Generate unsubscribe URL for email
   */
  generateUnsubscribeUrl(email, emailType = null, baseUrl = null) {
    const token = this.generateUnsubscribeToken(email, emailType);
    const url = baseUrl || process.env.CLIENT_URL || 'https://www.nationalparksexplorerusa.com';
    
    if (emailType) {
      return `${url}/unsubscribe?email=${encodeURIComponent(email)}&type=${emailType}&token=${token}`;
    } else {
      return `${url}/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
    }
  }

  /**
   * Check if user should receive emails (simplified system)
   */
  async shouldReceiveEmail(email, emailType) {
    try {
      const user = await User.findOne({ email }).select('emailNotifications');
      if (!user) {
        return false;
      }

      // Always send critical emails (password reset, verification)
      const criticalEmails = ['password_reset', 'email_verification'];
      if (criticalEmails.includes(emailType)) {
        return true;
      }

      // For all other emails, check the single toggle
      return user.emailNotifications === true;
    } catch (error) {
      console.error('Error checking email preferences:', error);
      return false; // Default to not sending if there's an error
    }
  }

  /**
   * Get unsubscribe statistics
   */
  async getUnsubscribeStats() {
    try {
      const totalUsers = await User.countDocuments();
      const subscribedUsers = await User.countDocuments({ emailNotifications: true });
      const unsubscribedUsers = totalUsers - subscribedUsers;

      return {
        totalUsers,
        subscribedUsers,
        unsubscribedUsers,
        subscriptionRate: totalUsers > 0 ? (subscribedUsers / totalUsers * 100).toFixed(2) : 0
      };
    } catch (error) {
      console.error('Error getting unsubscribe stats:', error);
      throw error;
    }
  }
}

module.exports = new UnsubscribeService();
