const express = require('express');
const rateLimit = require('express-rate-limit');
const Subscriber = require('../models/Subscriber');
const resendEmailService = require('../services/resendEmailService');

const router = express.Router();

// Rate limit: 5 subscribe requests per 15 minutes per IP
const subscribeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, error: 'Too many subscribe requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) =>
    process.env.NODE_ENV === 'development' &&
    (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1')
});

/**
 * @route   POST /api/subscribers
 * @desc    Subscribe to newsletter (double opt-in)
 * @access  Public
 */
router.post('/', subscribeLimiter, async (req, res) => {
  try {
    const { email, firstName, source, category } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required.' });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, error: 'Invalid email address.' });
    }

    const existing = await Subscriber.findOne({ email: email.toLowerCase().trim() });

    if (existing && existing.confirmed) {
      // Already confirmed — return success (don't reveal subscription status)
      return res.json({ success: true, message: 'If this email is not yet subscribed, a confirmation link has been sent.' });
    }

    if (existing && !existing.confirmed) {
      // Resend confirmation email
      const baseUrl = 'https://www.nationalparksexplorerusa.com';
      const confirmUrl = `${baseUrl}/api/subscribers/confirm/${existing.confirmToken}`;

      await resendEmailService.sendNewsletterConfirmation({
        firstName: existing.firstName || firstName || 'there',
        email: existing.email,
        confirmUrl
      });

      return res.json({ success: true, message: 'If this email is not yet subscribed, a confirmation link has been sent.' });
    }

    // New subscriber
    const subscriber = await Subscriber.create({
      email: email.toLowerCase().trim(),
      firstName: firstName || undefined,
      source: source || 'blog-listing',
      category: category || undefined
    });

    const baseUrl = 'https://www.nationalparksexplorerusa.com';
    const confirmUrl = `${baseUrl}/api/subscribers/confirm/${subscriber.confirmToken}`;

    await resendEmailService.sendNewsletterConfirmation({
      firstName: subscriber.firstName || 'there',
      email: subscriber.email,
      confirmUrl
    });

    res.status(201).json({ success: true, message: 'If this email is not yet subscribed, a confirmation link has been sent.' });
  } catch (error) {
    console.error('Error subscribing:', error);
    // Handle duplicate key error (race condition)
    if (error.code === 11000) {
      return res.json({ success: true, message: 'If this email is not yet subscribed, a confirmation link has been sent.' });
    }
    res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
  }
});

/**
 * @route   GET /api/subscribers/confirm/:token
 * @desc    Confirm newsletter subscription (double opt-in)
 * @access  Public
 */
router.get('/confirm/:token', async (req, res) => {
  try {
    const subscriber = await Subscriber.findOne({ confirmToken: req.params.token });

    if (!subscriber) {
      return res.redirect('/blog?subscribe_error=invalid');
    }

    if (subscriber.confirmed) {
      // Already confirmed — just redirect
      return res.redirect('/blog?subscribed=true');
    }

    subscriber.confirmed = true;
    subscriber.confirmedAt = new Date();
    await subscriber.save();

    res.redirect('/blog?subscribed=true');
  } catch (error) {
    console.error('Error confirming subscription:', error);
    res.redirect('/blog?subscribe_error=server');
  }
});

/**
 * @route   GET /api/subscribers/unsubscribe/:token
 * @desc    Unsubscribe from newsletter
 * @access  Public
 */
router.get('/unsubscribe/:token', async (req, res) => {
  try {
    const subscriber = await Subscriber.findOne({ unsubscribeToken: req.params.token });

    if (!subscriber) {
      return res.redirect('/blog?unsubscribe_error=invalid');
    }

    await Subscriber.deleteOne({ _id: subscriber._id });

    res.redirect('/blog?unsubscribed=true');
  } catch (error) {
    console.error('Error unsubscribing:', error);
    res.redirect('/blog?unsubscribe_error=server');
  }
});

module.exports = router;
