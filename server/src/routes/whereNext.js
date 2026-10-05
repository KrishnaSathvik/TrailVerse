'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { optionalAuth } = require('../middleware/auth');
const {
  createOrReplacePick,
  patchPick,
  getMyPick,
  getStats,
} = require('../controllers/whereNextController');

const router = express.Router();

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: 'Too many destination picks. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) =>
    process.env.NODE_ENV === 'development'
    && (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1'),
});

router.get('/stats', getStats);
router.get('/me', getMyPick);
router.post('/pick', writeLimiter, optionalAuth, createOrReplacePick);
router.patch('/pick', writeLimiter, optionalAuth, patchPick);

module.exports = router;
