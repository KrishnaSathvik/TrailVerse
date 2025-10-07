const express = require('express');
const { protect, admin } = require('../middleware/auth');
const { 
  getStats, 
  getRecentActivity, 
  getUsers, 
  getUser, 
  updateUser, 
  deleteUser, 
  bulkActionUsers,
  getSettings,
  updateSettings,
  resetSettings,
  exportSettings
} = require('../controllers/adminController');

const router = express.Router();

// All admin routes require authentication and admin role
router.use(protect);
router.use(admin);

// @route   GET /api/admin/stats
// @desc    Get admin dashboard statistics
// @access  Admin only
router.get('/stats', getStats);

// @route   GET /api/admin/recent-activity
// @desc    Get recent admin activity
// @access  Admin only
router.get('/recent-activity', getRecentActivity);

// @route   GET /api/admin/users
// @desc    Get all users with pagination and filtering
// @access  Admin only
router.get('/users', getUsers);

// @route   GET /api/admin/users/:id
// @desc    Get single user by ID
// @access  Admin only
router.get('/users/:id', getUser);

// @route   PUT /api/admin/users/:id
// @desc    Update user
// @access  Admin only
router.put('/users/:id', updateUser);

// @route   DELETE /api/admin/users/:id
// @desc    Delete user
// @access  Admin only
router.delete('/users/:id', deleteUser);

// @route   POST /api/admin/users/bulk-action
// @desc    Bulk actions on users (verify, unverify, delete)
// @access  Admin only
router.post('/users/bulk-action', bulkActionUsers);

// @route   POST /api/admin/users/:id/:action
// @desc    Individual user actions (view, edit, verify, delete)
// @access  Admin only
router.post('/users/:id/:action', require('../controllers/adminController').userAction);

// @route   GET /api/admin/settings
// @desc    Get admin settings
// @access  Admin only
router.get('/settings', getSettings);

// @route   PUT /api/admin/settings
// @desc    Update admin settings
// @access  Admin only
router.put('/settings', updateSettings);

// @route   POST /api/admin/settings/reset
// @desc    Reset admin settings to defaults
// @access  Admin only
router.post('/settings/reset', resetSettings);

// @route   GET /api/admin/settings/export
// @desc    Export admin settings
// @access  Admin only
router.get('/settings/export', exportSettings);

module.exports = router;
