const User = require('../models/User');
const BlogPost = require('../models/BlogPost');
const TripPlan = require('../models/TripPlan');

// @desc    Get admin dashboard statistics
// @route   GET /api/admin/stats
// @access  Admin only
exports.getStats = async (req, res, next) => {
  try {
    console.log('Admin stats requested');
    
    // Get user statistics
    const totalUsers = await User.countDocuments();
    console.log('Total users found:', totalUsers);
    
    const activeUsers = await User.countDocuments({
      lastActiveAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Active in last 30 days
    });
    console.log('Active users found:', activeUsers);

    // Get trip plan statistics
    const totalTrips = await TripPlan.countDocuments();
    console.log('Total trips found:', totalTrips);

    // Calculate monthly growth
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    
    const usersThisMonth = await User.countDocuments({
      createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }
    });
    
    const usersLastMonth = await User.countDocuments({
      createdAt: { 
        $gte: new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1),
        $lt: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      }
    });

    const monthlyGrowth = usersLastMonth > 0 
      ? ((usersThisMonth - usersLastMonth) / usersLastMonth * 100).toFixed(1)
      : 0;

    const responseData = {
      success: true,
      data: {
        totalUsers,
        totalTrips,
        monthlyGrowth: parseFloat(monthlyGrowth),
        activeUsers
      }
    };
    
    console.log('Sending stats response:', responseData);
    res.status(200).json(responseData);
  } catch (error) {
    next(error);
  }
};

// @desc    Get recent admin activity
// @route   GET /api/admin/recent-activity
// @access  Admin only
exports.getRecentActivity = async (req, res, next) => {
  try {
    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(3)
      .select('name email createdAt')
      .lean();

    const recentPosts = await BlogPost.find()
      .sort({ createdAt: -1 })
      .limit(3)
      .select('title status createdAt author')
      .populate('author', 'name')
      .lean();

    const recentTrips = await TripPlan.find()
      .sort({ createdAt: -1 })
      .limit(3)
      .select('userId createdAt')
      .populate('userId', 'name')
      .lean();

    // Combine and format activities
    const activities = [];

    // Add user registrations
    recentUsers.forEach(user => {
      activities.push({
        id: `user-${user._id}`,
        type: 'user',
        action: 'New user registration',
        user: user.name || 'Anonymous',
        time: formatTimeAgo(user.createdAt)
      });
    });

    // Add blog posts
    recentPosts.forEach(post => {
      activities.push({
        id: `post-${post._id}`,
        type: 'blog',
        action: `New blog post ${post.status}`,
        user: post.author?.name || 'Admin',
        time: formatTimeAgo(post.createdAt)
      });
    });

    // Add trip plans
    recentTrips.forEach(trip => {
      activities.push({
        id: `trip-${trip._id}`,
        type: 'trip',
        action: 'Trip plan created',
        user: trip.userId?.name || 'Anonymous',
        time: formatTimeAgo(trip.createdAt)
      });
    });

    // Sort by creation time (newest first) and limit to 10
    activities.sort((a, b) => new Date(b.time) - new Date(a.time));
    const recentActivity = activities.slice(0, 10);

    res.status(200).json({
      success: true,
      data: recentActivity
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all users with pagination and filtering
// @route   GET /api/admin/users
// @access  Admin only
exports.getUsers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    const role = req.query.role || '';
    const status = req.query.status || '';

    // Build query
    let query = {};

    // Search by name or email
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Filter by role
    if (role && role !== 'all') {
      query.role = role;
    }

    // Filter by email verification status
    if (status && status !== 'all') {
      if (status === 'verified') {
        query.isEmailVerified = true;
      } else if (status === 'unverified') {
        query.isEmailVerified = false;
      }
    }

    // Calculate pagination
    const skip = (page - 1) * limit;
    const total = await User.countDocuments(query);
    const pages = Math.ceil(total / limit);

    // Get users
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.status(200).json({
      success: true,
      data: users,
      pagination: {
        page,
        pages,
        total,
        limit
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single user by ID
// @route   GET /api/admin/users/:id
// @access  Admin only
exports.getUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user
// @route   PUT /api/admin/users/:id
// @access  Admin only
exports.updateUser = async (req, res, next) => {
  try {
    const { name, email, role, isEmailVerified } = req.body;
    
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Update fields
    if (name) user.name = name;
    if (email) user.email = email;
    if (role) user.role = role;
    if (typeof isEmailVerified === 'boolean') user.isEmailVerified = isEmailVerified;

    await user.save();

    res.status(200).json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete user
// @route   DELETE /api/admin/users/:id
// @access  Admin only
exports.deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Prevent admin from deleting themselves
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete your own account'
      });
    }

    await User.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Bulk actions on users
// @route   POST /api/admin/users/bulk-action
// @access  Admin only
exports.bulkActionUsers = async (req, res, next) => {
  try {
    const { userIds, action } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'User IDs are required'
      });
    }

    if (!action) {
      return res.status(400).json({
        success: false,
        error: 'Action is required'
      });
    }

    let result;

    switch (action) {
      case 'verify':
        result = await User.updateMany(
          { _id: { $in: userIds } },
          { isEmailVerified: true }
        );
        break;
      
      case 'unverify':
        result = await User.updateMany(
          { _id: { $in: userIds } },
          { isEmailVerified: false }
        );
        break;
      
      case 'delete':
        // Prevent admin from deleting themselves
        const adminId = req.user._id.toString();
        const filteredIds = userIds.filter(id => id !== adminId);
        
        if (filteredIds.length !== userIds.length) {
          return res.status(400).json({
            success: false,
            error: 'Cannot delete your own account'
          });
        }
        
        result = await User.deleteMany({ _id: { $in: filteredIds } });
        break;
      
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid action'
        });
    }

    res.status(200).json({
      success: true,
      message: `Bulk ${action} completed successfully`,
      modifiedCount: result.modifiedCount || result.deletedCount
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get admin settings
// @route   GET /api/admin/settings
// @access  Admin only
exports.getSettings = async (req, res, next) => {
  try {
    // For now, return default settings
    // In a real application, these would be stored in a database
    const settings = {
      siteName: 'TrailVerse',
      siteDescription: 'National Parks Explorer',
      contactEmail: 'trailverseteam@gmail.com',
      supportEmail: 'trailverseteam@gmail.com',
      emailProvider: 'gmail',
      emailFromName: 'TrailVerse',
      emailFromAddress: 'trailverseteam@gmail.com',
      sessionTimeout: 24,
      maxLoginAttempts: 5,
      requireEmailVerification: true,
      enableTwoFactor: false,
      enableBlog: true,
      enableEvents: true,
      enableReviews: true,
      enableAI: true,
      enableAnalytics: true,
      npsApiKey: '',
      openWeatherApiKey: '',
      googleAnalyticsId: '',
      maintenanceMode: false,
      maintenanceMessage: 'We are currently performing maintenance. Please check back soon.'
    };

    res.status(200).json({
      success: true,
      data: settings
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update admin settings
// @route   PUT /api/admin/settings
// @access  Admin only
exports.updateSettings = async (req, res, next) => {
  try {
    // For now, just return success
    // In a real application, these would be saved to a database
    res.status(200).json({
      success: true,
      message: 'Settings updated successfully',
      data: req.body
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Reset admin settings to defaults
// @route   POST /api/admin/settings/reset
// @access  Admin only
exports.resetSettings = async (req, res, next) => {
  try {
    // For now, just return success
    // In a real application, these would be reset in the database
    res.status(200).json({
      success: true,
      message: 'Settings reset to defaults'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Export admin settings
// @route   GET /api/admin/settings/export
// @access  Admin only
exports.exportSettings = async (req, res, next) => {
  try {
    const settings = {
      siteName: 'TrailVerse',
      siteDescription: 'National Parks Explorer',
      contactEmail: 'trailverseteam@gmail.com',
      supportEmail: 'trailverseteam@gmail.com',
      emailProvider: 'gmail',
      emailFromName: 'TrailVerse',
      emailFromAddress: 'trailverseteam@gmail.com',
      sessionTimeout: 24,
      maxLoginAttempts: 5,
      requireEmailVerification: true,
      enableTwoFactor: false,
      enableBlog: true,
      enableEvents: true,
      enableReviews: true,
      enableAI: true,
      enableAnalytics: true,
      npsApiKey: '',
      openWeatherApiKey: '',
      googleAnalyticsId: '',
      maintenanceMode: false,
      maintenanceMessage: 'We are currently performing maintenance. Please check back soon.'
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=settings-backup-${new Date().toISOString().split('T')[0]}.json`);
    res.status(200).json(settings);
  } catch (error) {
    next(error);
  }
};

// Helper function to format time ago
function formatTimeAgo(date) {
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) {
    return `${diffInSeconds} seconds ago`;
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
}

// @desc    Individual user actions (view, edit, verify, delete)
// @route   POST /api/admin/users/:id/:action
// @access  Admin only
exports.userAction = async (req, res, next) => {
  try {
    const { id, action } = req.params;
    const user = await User.findById(id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    switch (action) {
      case 'view':
        // For view action, just return user data
        res.status(200).json({
          success: true,
          data: {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            isEmailVerified: user.isEmailVerified,
            createdAt: user.createdAt,
            lastActiveAt: user.lastActiveAt
          }
        });
        break;
      
      case 'edit':
        // For edit action, return user data for editing
        res.status(200).json({
          success: true,
          data: {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            isEmailVerified: user.isEmailVerified
          }
        });
        break;
      
      case 'verify':
        user.isEmailVerified = true;
        await user.save();
        res.status(200).json({
          success: true,
          message: 'User verified successfully'
        });
        break;
      
      case 'delete':
        // Prevent admin from deleting themselves
        if (user._id.toString() === req.user._id.toString()) {
          return res.status(400).json({
            success: false,
            error: 'Cannot delete your own account'
          });
        }
        
        await User.findByIdAndDelete(id);
        res.status(200).json({
          success: true,
          message: 'User deleted successfully'
        });
        break;
      
      default:
        res.status(400).json({
          success: false,
          error: 'Invalid action'
        });
    }
  } catch (error) {
    next(error);
  }
};
