const express = require('express');
const rateLimit = require('express-rate-limit');
const subscriberService = require('../services/subscriberService');

const router = express.Router();

const subscribeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, error: 'Too many subscribe requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (process.env.NODE_ENV === 'test' && req.get('x-test-enable-rate-limit') !== '1') {
      return true;
    }
    return (
      process.env.NODE_ENV === 'development' &&
      (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1')
    );
  }
});

/**
 * @route   POST /api/subscribers
 * @desc    Subscribe to Where Next? (double opt-in)
 * @access  Public
 */
router.post('/', subscribeLimiter, async (req, res) => {
  try {
    const result = await subscriberService.subscribe(req.body);
    return res.status(result.created ? 201 : 200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, error: error.message });
    }
    console.error('Error subscribing:', error);
    if (error.code === 11000) {
      return res.json({
        success: true,
        message: subscriberService.GENERIC_SUBSCRIBE_MESSAGE,
      });
    }
    return res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
  }
});

/**
 * @route   GET /api/subscribers/confirm/:token
 * @desc    Confirm Where Next? subscription (double opt-in)
 * @access  Public
 */
router.get('/confirm/:token', async (req, res) => {
  try {
    const { redirect } = await subscriberService.confirmByToken(req.params.token);
    return res.redirect(redirect);
  } catch (error) {
    console.error('Error confirming subscription:', error);
    return res.redirect('/newsletter?subscribe_error=server');
  }
});

/**
 * @route   GET /api/subscribers/unsubscribe/:token
 * @desc    Unsubscribe from Where Next?
 * @access  Public
 */
router.get('/unsubscribe/:token', async (req, res) => {
  try {
    const { redirect } = await subscriberService.unsubscribeByToken(req.params.token);
    return res.redirect(redirect);
  } catch (error) {
    console.error('Error unsubscribing:', error);
    return res.redirect('/newsletter?unsubscribe_error=server');
  }
});

module.exports = router;
