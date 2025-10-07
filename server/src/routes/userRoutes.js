const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { protect } = require('../middleware/auth');

// @route   PUT /api/user/change-password
// @desc    Change user's password
// @access  Private
router.put('/change-password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        error: 'Please enter current and new passwords' 
      });
    }

    // Password strength validation
    if (newPassword.length < 8) {
      return res.status(400).json({ 
        success: false, 
        error: 'New password must be at least 8 characters long' 
      });
    }

    // Check if new password is different from current
    if (currentPassword === newPassword) {
      return res.status(400).json({ 
        success: false, 
        error: 'New password must be different from current password' 
      });
    }

    // Get user from DB
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    // Check current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false, 
        error: 'Incorrect current password' 
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    console.log(`✅ Password changed successfully for user: ${user.email}`);

    res.json({ 
      success: true, 
      message: 'Password updated successfully' 
    });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error' 
    });
  }
});

// @route   GET /api/user/data/download
// @desc    Download user's data
// @access  Private
router.get('/data/download', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password'); // Exclude password
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    // Prepare comprehensive user data
    const userData = {
      profile: {
        _id: user._id,
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        location: user.location,
        bio: user.bio,
        website: user.website,
        avatar: user.avatar,
        role: user.role,
        emailNotifications: user.emailNotifications,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      },
      accountInfo: {
        accountCreated: user.createdAt,
        lastUpdated: user.updatedAt,
        emailVerified: user.isEmailVerified || false,
        subscriptionStatus: 'Active' // You can add subscription logic later
      },
      dataExportInfo: {
        exportDate: new Date().toISOString(),
        exportVersion: '1.0',
        dataTypes: ['Profile Information', 'Account Settings']
      }
    };

    // Create filename with timestamp
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `trailverse_user_data_${timestamp}.json`;

    // Set headers for file download
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json');
    
    // Send formatted JSON
    res.send(JSON.stringify(userData, null, 2));

    console.log(`📥 User data downloaded for: ${user.email}`);

  } catch (error) {
    console.error('Error downloading user data:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error' 
    });
  }
});

// @route   DELETE /api/user/delete-account
// @desc    Delete user account
// @access  Private
router.delete('/delete-account', protect, async (req, res) => {
  try {
    const { password, confirmation } = req.body;

    // Validate input
    if (!password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Please enter your password to confirm deletion' 
      });
    }

    if (!confirmation || confirmation !== 'DELETE') {
      return res.status(400).json({ 
        success: false, 
        error: 'Please type "DELETE" to confirm account deletion' 
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    // Verify password for confirmation
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false, 
        error: 'Incorrect password' 
      });
    }

    // Log account deletion for audit
    console.log(`🗑️ Account deletion initiated for: ${user.email}`);

    // Delete user and associated data
    // Note: In a production app, you'd want to handle cascading deletes
    // for related data like blog posts, comments, trips, etc.
    await User.findByIdAndDelete(req.user.id);

    // Clear any authentication cookies/tokens
    res.clearCookie('token');
    res.clearCookie('authToken');

    console.log(`✅ Account deleted successfully for: ${user.email}`);

    res.json({ 
      success: true, 
      message: 'Account deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error' 
    });
  }
});

// @route   GET /api/user/privacy-info
// @desc    Get user's privacy and security information
// @access  Private
router.get('/privacy-info', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    const privacyInfo = {
      emailNotifications: user.emailNotifications,
      accountCreated: user.createdAt,
      lastLogin: user.lastLogin || user.updatedAt,
      emailVerified: user.isEmailVerified || false,
      dataRetention: {
        profileData: 'Retained until account deletion',
        activityLogs: 'Retained for 90 days',
        emailPreferences: 'Retained until account deletion'
      }
    };

    res.json({ 
      success: true, 
      data: privacyInfo 
    });
  } catch (error) {
    console.error('Error getting privacy info:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error' 
    });
  }
});

module.exports = router;
