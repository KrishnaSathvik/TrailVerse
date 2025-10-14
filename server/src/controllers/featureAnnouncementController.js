const resendEmailService = require('../services/resendEmailService');
const User = require('../models/User');

class FeatureAnnouncementController {
  // Send feature announcement to a single user
  async sendToUser(req, res) {
    try {
      const { userId } = req.params;
      
      // Find user
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          message: 'User not found' 
        });
      }

      // Send feature announcement email
      await resendEmailService.sendFeatureAnnouncementEmail(user);

      res.json({
        success: true,
        message: 'Feature announcement email sent successfully',
        user: {
          id: user._id,
          email: user.email,
          name: user.firstName || user.name
        }
      });
    } catch (error) {
      console.error('Error sending feature announcement to user:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send feature announcement email',
        error: error.message
      });
    }
  }

  // Send feature announcement to all users (bulk)
  async sendToAllUsers(req, res) {
    try {
      const { 
        limit = 100, 
        skip = 0, 
        verifiedOnly = true,
        excludeAdmins = true 
      } = req.query;

      // Build query
      let query = {};
      
      if (verifiedOnly === 'true') {
        query.isEmailVerified = true;
      }
      
      if (excludeAdmins === 'true') {
        query.role = { $ne: 'admin' };
      }

      // Get users
      const users = await User.find(query)
        .select('_id email firstName name isEmailVerified role')
        .limit(parseInt(limit))
        .skip(parseInt(skip))
        .lean();

      if (users.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No users found matching criteria'
        });
      }

      // Send bulk feature announcement
      const result = await resendEmailService.sendBulkFeatureAnnouncement(users);

      res.json({
        success: true,
        message: 'Bulk feature announcement completed',
        stats: {
          total: result.total,
          sent: result.success,
          failed: result.failed
        },
        details: result.results
      });
    } catch (error) {
      console.error('Error sending bulk feature announcement:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send bulk feature announcement',
        error: error.message
      });
    }
  }

  // Send feature announcement to users by criteria
  async sendToUsersByCriteria(req, res) {
    try {
      const { 
        criteria = {},
        limit = 100,
        skip = 0 
      } = req.body;

      // Add default criteria
      const query = {
        isEmailVerified: true,
        role: { $ne: 'admin' },
        ...criteria
      };

      // Get users
      const users = await User.find(query)
        .select('_id email firstName name isEmailVerified role')
        .limit(parseInt(limit))
        .skip(parseInt(skip))
        .lean();

      if (users.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No users found matching criteria'
        });
      }

      // Send bulk feature announcement
      const result = await resendEmailService.sendBulkFeatureAnnouncement(users);

      res.json({
        success: true,
        message: 'Feature announcement sent to users by criteria',
        criteria: query,
        stats: {
          total: result.total,
          sent: result.success,
          failed: result.failed
        },
        details: result.results
      });
    } catch (error) {
      console.error('Error sending feature announcement by criteria:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send feature announcement by criteria',
        error: error.message
      });
    }
  }

  // Get user statistics for feature announcement
  async getUserStats(req, res) {
    try {
      const { verifiedOnly = true, excludeAdmins = true } = req.query;

      // Build query
      let query = {};
      
      if (verifiedOnly === 'true') {
        query.isEmailVerified = true;
      }
      
      if (excludeAdmins === 'true') {
        query.role = { $ne: 'admin' };
      }

      // Get statistics
      const totalUsers = await User.countDocuments(query);
      const verifiedUsers = await User.countDocuments({ ...query, isEmailVerified: true });
      const adminUsers = await User.countDocuments({ role: 'admin' });
      const recentUsers = await User.countDocuments({ 
        ...query, 
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
      });

      res.json({
        success: true,
        stats: {
          total: totalUsers,
          verified: verifiedUsers,
          admins: adminUsers,
          recent: recentUsers,
          eligible: totalUsers // Users that would receive the announcement
        }
      });
    } catch (error) {
      console.error('Error getting user stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get user statistics',
        error: error.message
      });
    }
  }

  // Preview feature announcement email
  async previewEmail(req, res) {
    try {
      const { userId } = req.params;
      
      // Find user or use default data
      let user;
      if (userId && userId !== 'preview') {
        user = await User.findById(userId);
      }
      
      if (!user) {
        user = {
          firstName: 'John',
          name: 'John Doe',
          email: 'john.doe@example.com'
        };
      }

      // Generate preview HTML
      const html = await resendEmailService.compileTemplate('feature-announcement', {
        firstName: user.firstName || user.name,
        email: user.email,
        mapUrl: `${process.env.WEBSITE_URL || 'https://www.nationalparksexplorerusa.com'}/map`,
        shareUrl: `${process.env.WEBSITE_URL || 'https://www.nationalparksexplorerusa.com'}?ref=feature-announcement`
      });

      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      console.error('Error previewing feature announcement email:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to preview email',
        error: error.message
      });
    }
  }
}

module.exports = new FeatureAnnouncementController();
