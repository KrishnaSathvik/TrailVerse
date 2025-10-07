const express = require('express');
const rateLimit = require('express-rate-limit');
const unsubscribeService = require('../services/unsubscribeService');
const simpleEmailService = require('../services/simpleEmailService');
const User = require('../models/User');

const router = express.Router();

// Rate limiting for email-related endpoints
const emailRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: {
    error: 'Too many email requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for localhost in development
  skip: (req) => {
    return process.env.NODE_ENV === 'development' && 
           (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1');
  }
});

// More generous rate limiting for preferences endpoints (read-only operations)
const preferencesRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Increased to 200 requests per 15 minutes for preferences
  message: {
    error: 'Too many preference requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for localhost in development
  skip: (req) => {
    // More comprehensive localhost detection for development
    const isLocalhost = req.ip === '127.0.0.1' || 
                       req.ip === '::1' || 
                       req.ip === '::ffff:127.0.0.1' ||
                       req.ip === 'localhost' ||
                       req.ip === '0.0.0.0' ||
                       req.connection?.remoteAddress === '127.0.0.1' ||
                       req.socket?.remoteAddress === '127.0.0.1';
    
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    if (isDevelopment && isLocalhost) {
      console.log(`🔓 Skipping rate limit for localhost in development mode. IP: ${req.ip}`);
      return true;
    }
    
    return false;
  }
});

// Apply stricter rate limiting to email sending routes (unsubscribe, resubscribe)
router.use('/unsubscribe', emailRateLimit);
router.use('/resubscribe', emailRateLimit);
router.use('/track', emailRateLimit);
router.use('/queue', emailRateLimit);

// Apply more generous rate limiting to preferences endpoints
router.use('/preferences', (req, res, next) => {
  console.log(`📧 Email preferences request from IP: ${req.ip}, User-Agent: ${req.get('User-Agent')?.substring(0, 50)}...`);
  next();
}, preferencesRateLimit);

/**
 * @route   GET /api/email/unsubscribe
 * @desc    Show unsubscribe page/form
 * @access  Public
 */
router.get('/unsubscribe', async (req, res) => {
  try {
    const { email, type, token } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email address is required'
      });
    }

    // Get current user preferences
    const preferences = await unsubscribeService.getUserEmailPreferences(email);
    
    if (!preferences) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Verify token if provided
    if (token && !unsubscribeService.verifyUnsubscribeToken(token, email, type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid unsubscribe token'
      });
    }

    res.json({
      success: true,
      data: {
        email,
        emailNotifications: preferences.emailNotifications,
        tokenValid: token ? unsubscribeService.verifyUnsubscribeToken(token, email, type) : false
      }
    });
  } catch (error) {
    console.error('Error in unsubscribe GET:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * @route   POST /api/email/unsubscribe
 * @desc    Process unsubscribe request
 * @access  Public
 */
router.post('/unsubscribe', async (req, res) => {
  try {
    const { email, emailType, token, preferences } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email address is required'
      });
    }

    let result;

    if (preferences && preferences.emailNotifications !== undefined) {
      // Update email notifications preference
      result = await unsubscribeService.updateEmailPreferences(email, preferences);
    } else {
      // Unsubscribe from all emails (simplified system)
      result = await unsubscribeService.unsubscribe(email, emailType, token);
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error processing unsubscribe:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process unsubscribe request'
    });
  }
});

/**
 * @route   POST /api/email/resubscribe
 * @desc    Resubscribe user to emails
 * @access  Public
 */
router.post('/resubscribe', async (req, res) => {
  try {
    const { email, preferences } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email address is required'
      });
    }

    const result = await unsubscribeService.resubscribe(email, preferences);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error processing resubscribe:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process resubscribe request'
    });
  }
});

/**
 * @route   GET /api/email/track/open/:trackingId
 * @desc    Track email opens (pixel tracking)
 * @access  Public
 */
router.get('/track/open/:trackingId', async (req, res) => {
  try {
    const { trackingId } = req.params;
    const userAgent = req.get('User-Agent');
    const ip = req.ip;

    // Track the email open
    await trackEmailOpen(trackingId, { userAgent, ip });

    // Return a 1x1 transparent pixel
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      'base64'
    );

    res.set({
      'Content-Type': 'image/png',
      'Content-Length': pixel.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    res.send(pixel);
  } catch (error) {
    console.error('Error tracking email open:', error);
    // Still return the pixel even if tracking fails
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      'base64'
    );
    res.set({
      'Content-Type': 'image/png',
      'Content-Length': pixel.length
    });
    res.send(pixel);
  }
});

/**
 * @route   GET /api/email/track/status/:trackingId
 * @desc    Get email delivery status
 * @access  Private (Admin)
 */
router.get('/track/status/:trackingId', async (req, res) => {
  try {
    const { trackingId } = req.params;
    
    const status = simpleEmailService.getEmailDeliveryStatus(trackingId);
    
    if (!status) {
      return res.status(404).json({
        success: false,
        error: 'Tracking ID not found'
      });
    }

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Error getting email status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get email status'
    });
  }
});

/**
 * @route   GET /api/email/queue/stats
 * @desc    Get email queue statistics
 * @access  Private (Admin)
 */
router.get('/queue/stats', async (req, res) => {
  try {
    const emailStats = simpleEmailService.getEmailStats();
    const unsubscribeStats = await unsubscribeService.getUnsubscribeStats();

    res.json({
      success: true,
      data: {
        email: emailStats,
        unsubscribe: unsubscribeStats
      }
    });
  } catch (error) {
    console.error('Error getting queue stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get queue statistics'
    });
  }
});

/**
 * @route   GET /api/email/preferences/:email
 * @desc    Get user email preferences
 * @access  Private
 */
router.get('/preferences/:email', async (req, res) => {
  try {
    const { email } = req.params;
    
    const preferences = await unsubscribeService.getUserEmailPreferences(email);
    
    if (!preferences) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: preferences
    });
  } catch (error) {
    console.error('Error getting email preferences:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get email preferences'
    });
  }
});

/**
 * @route   PUT /api/email/preferences/:email
 * @desc    Update user email preferences
 * @access  Private
 */
router.put('/preferences/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const { emailNotifications, preferences } = req.body;

    // Handle both old format (simple boolean) and new format (object)
    let updatePreferences;
    if (preferences) {
      // New format: complex preferences object
      updatePreferences = preferences;
    } else if (emailNotifications !== undefined) {
      // Old format: simple boolean - convert to new format
      updatePreferences = {
        blogNotifications: emailNotifications
      };
    } else {
      return res.status(400).json({
        success: false,
        error: 'emailNotifications or preferences is required'
      });
    }

    const result = await unsubscribeService.updateEmailPreferences(email, updatePreferences);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error updating email preferences:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update email preferences'
    });
  }
});

/**
 * Helper function to track email opens
 */
async function trackEmailOpen(trackingId, metadata) {
  try {
    const Redis = require('redis');
    const redis = Redis.createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: process.env.REDIS_DB || 0,
    });

    const openData = {
      trackingId,
      openedAt: new Date(),
      metadata,
      timestamp: new Date(),
    };

    // Store open tracking with expiration (30 days)
    await redis.setex(
      `email_open:${trackingId}`,
      30 * 24 * 60 * 60, // 30 days
      JSON.stringify(openData)
    );

    // Also store in a list for analytics
    await redis.lpush(
      `email_opens:${trackingId}`,
      JSON.stringify(openData)
    );
    await redis.expire(`email_opens:${trackingId}`, 30 * 24 * 60 * 60);

    console.log(`📊 Email opened: ${trackingId}`);
  } catch (error) {
    console.error('Failed to track email open:', error);
  }
}

/**
 * @route   GET /api/email/preferences
 * @desc    Get user email preferences (for unsubscribe page)
 * @access  Public
 */
router.get('/preferences', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email parameter is required'
      });
    }

    const preferences = await unsubscribeService.getUserEmailPreferences(email);

    if (!preferences) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: preferences
    });
  } catch (error) {
    console.error('Error getting email preferences:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get email preferences'
    });
  }
});

/**
 * @route   POST /api/email/preferences
 * @desc    Update user email preferences (for unsubscribe page)
 * @access  Public
 */
router.post('/preferences', async (req, res) => {
  try {
    const { email, preferences } = req.body;

    if (!email || !preferences) {
      return res.status(400).json({
        success: false,
        error: 'Email and preferences are required'
      });
    }

    const result = await unsubscribeService.updateEmailPreferences(email, preferences);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error updating email preferences:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update email preferences'
    });
  }
});

module.exports = router;
