const express = require('express');
const router = express.Router();
const { signup, login, getMe, logout, forgotPassword, resetPassword, verifyEmail } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/signup', signup);
router.post('/login', login);
router.get('/me', protect, getMe);
router.post('/logout', protect, logout);
router.post('/forgot-password', forgotPassword);
router.put('/reset-password/:token', resetPassword);
router.get('/verify-email/:token', verifyEmail);

module.exports = router;
