const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const emailService = require('../services/emailService');
const crypto = require('crypto');

// @desc    Register user
// @route   POST /api/auth/signup
// @access  Public
exports.signup = async (req, res, next) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        success: false,
        error: 'User already exists with this email'
      });
    }

    // Combine first and last name for backward compatibility
    const name = `${firstName} ${lastName}`.trim();

    // Create user
    const user = await User.create({
      name,
      firstName,
      lastName,
      email,
      password
    });

    // Generate verification token
    const verificationToken = user.getEmailVerificationToken();
    await user.save();

    // Try to send verification email (don't let email failures prevent account creation)
    let emailSent = false;
    let emailError = null;
    try {
      const verificationUrl = `${process.env.CLIENT_URL}/verify-email/${verificationToken}`;
      await emailService.sendEmailVerification(user, verificationUrl);
      emailSent = true;
      console.log(`✅ Verification email sent successfully to ${user.email}`);
    } catch (error) {
      emailError = error.message;
      console.error(`❌ Failed to send verification email to ${user.email}:`, error);
      // Don't throw - let signup succeed even if email fails
    }

    // Send admin notification (don't await to avoid blocking user response)
    emailService.sendAdminNewUserNotification(user).catch(error => {
      console.error('Failed to send admin notification:', error);
    });

    // Return success even if email failed
    const message = emailSent 
      ? 'Account created! Please check your email to verify your account.'
      : 'Account created! However, we had trouble sending the verification email. Please try logging in or contact support.';

    res.status(201).json({
      success: true,
      message,
      emailSent,
      ...(emailError && { emailError: 'Failed to send verification email' }),
      data: {
        id: user._id,
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified
      }
    });
  } catch (error) {
    // If user creation failed due to database error after user was created
    // This can happen if there's a race condition or connection issue
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: 'User already exists with this email'
      });
    }
    next(error);
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { email, password, rememberMe } = req.body;

    // Validate email & password
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Please provide email and password'
      });
    }

    // Check for user (include password)
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check if password matches
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Generate token with remember me option
    const token = generateToken(user._id, rememberMe);

    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified
      },
      token
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    res.status(200).json({
      success: true,
      data: {
        id: user._id,
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

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
exports.logout = async (req, res, next) => {
  res.status(200).json({
    success: true,
    message: 'User logged out successfully'
  });
};

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Get reset token
    const resetToken = user.getResetPasswordToken();
    await user.save();
    
    // Create reset URL
    const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;
    
    // Send email
    await emailService.sendPasswordReset(user, resetUrl);
    
    res.status(200).json({
      success: true,
      message: 'Password reset email sent'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    next(error);
  }
};

// @desc    Reset password
// @route   PUT /api/auth/reset-password/:token
// @access  Public
exports.resetPassword = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    
    // Hash token
    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
    
    // Find user
    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() }
    });
    
    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset token'
      });
    }
    
    // Set new password
    user.password = password;
    user.resetPasswordToken = null;
    user.resetPasswordExpire = null;
    await user.save();
    
    res.status(200).json({
      success: true,
      message: 'Password reset successful'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Verify email
// @route   GET /api/auth/verify-email/:token
// @access  Public
exports.verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.params;
    
    const emailVerificationToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
    
    const user = await User.findOne({
      emailVerificationToken,
      emailVerificationExpire: { $gt: Date.now() }
    });
    
    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired verification token'
      });
    }
    
    user.isEmailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpire = null;
    await user.save();
    
    // Send welcome email after verification
    await emailService.sendWelcomeEmail(user);
    
    // Generate login token for auto-login
    const loginToken = generateToken(user._id);
    
    res.status(200).json({
      success: true,
      message: 'Email verified successfully! Welcome to TrailVerse!',
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified
      },
      token: loginToken
    });
  } catch (error) {
    next(error);
  }
};
