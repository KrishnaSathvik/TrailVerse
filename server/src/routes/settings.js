const express = require('express');
const SiteSettings = require('../models/SiteSettings');

const router = express.Router();

// @route   GET /api/settings/public
// @desc    Public site flags (maintenance + feature toggles, no secrets)
// @access  Public
router.get('/public', async (req, res, next) => {
  try {
    const settings = await SiteSettings.getSettings();
    res.status(200).json({
      success: true,
      data: {
        siteName: settings.siteName,
        maintenanceMode: settings.maintenanceMode,
        maintenanceMessage: settings.maintenanceMessage,
        enableBlog: settings.enableBlog,
        enableEvents: settings.enableEvents,
        enableReviews: settings.enableReviews,
        enableAI: settings.enableAI,
        enableAnalytics: settings.enableAnalytics,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
