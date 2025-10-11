const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a name'],
    trim: true,
    maxlength: [50, 'Name cannot be more than 50 characters']
  },
  firstName: {
    type: String,
    trim: true,
    maxlength: [25, 'First name cannot be more than 25 characters']
  },
  lastName: {
    type: String,
    trim: true,
    maxlength: [25, 'Last name cannot be more than 25 characters']
  },
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please provide a valid email'
    ]
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false // Don't return password in queries
  },
  // Additional profile fields
  phone: {
    type: String,
    trim: true,
    match: [
      /^[\+]?[1-9][\d]{0,15}$/,
      'Please provide a valid phone number'
    ]
  },
  location: {
    type: String,
    trim: true,
    maxlength: [100, 'Location cannot be more than 100 characters']
  },
  website: {
    type: String,
    trim: true,
    match: [
      /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
      'Please provide a valid website URL'
    ]
  },
  bio: {
    type: String,
    trim: true,
    maxlength: [500, 'Bio cannot be more than 500 characters']
  },
  avatar: {
    type: String,
    trim: true
  },
  // DEPRECATED: savedParks will be removed in v2.0
  // Use Favorite collection instead for more flexible park tracking
  // This field is kept for backwards compatibility only
  savedParks: [{
    parkCode: {
      type: String,
      required: true
    },
    parkName: String,
    savedAt: {
      type: Date,
      default: Date.now
    },
    visited: {
      type: Boolean,
      default: false
    },
    visitDate: {
      type: Date,
      default: null
    }
  }],
  emailNotifications: {
    blogNotifications: {
      type: Boolean,
      default: true
    }
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: {
    type: String,
    default: null
  },
  emailVerificationExpire: {
    type: Date,
    default: null
  },
  resetPasswordToken: {
    type: String,
    default: null
  },
  resetPasswordExpire: {
    type: Date,
    default: null
  },
  // Token usage tracking
  tokenUsage: {
    dailyTokensUsed: {
      type: Number,
      default: 0
    },
    lastResetDate: {
      type: Date,
      default: Date.now
    },
    totalTokensUsed: {
      type: Number,
      default: 0
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Add indexes
userSchema.index({ role: 1 });
userSchema.index({ createdAt: -1 });
// Note: email index is already created by unique: true in schema
userSchema.index({ 'savedParks.parkCode': 1 });

// Encrypt password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
userSchema.methods.comparePassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// DEPRECATED: Method to save a park
// Use Favorite collection and favoriteController instead
userSchema.methods.savePark = function(parkCode, parkName) {
  console.warn('User.savePark() is deprecated. Use Favorite collection instead.');
  // Check if already saved
  const alreadySaved = this.savedParks.some(p => p.parkCode === parkCode);
  
  if (!alreadySaved) {
    this.savedParks.push({
      parkCode,
      parkName,
      savedAt: new Date()
    });
  }
  
  return this.save();
};

// DEPRECATED: Method to remove a saved park
// Use Favorite collection and favoriteController instead
userSchema.methods.removeSavedPark = function(parkCode) {
  console.warn('User.removeSavedPark() is deprecated. Use Favorite collection instead.');
  this.savedParks = this.savedParks.filter(p => p.parkCode !== parkCode);
  return this.save();
};

// DEPRECATED: Method to check if park is saved
// Use Favorite collection and favoriteController instead
userSchema.methods.isParkSaved = function(parkCode) {
  console.warn('User.isParkSaved() is deprecated. Use Favorite collection instead.');
  return this.savedParks.some(p => p.parkCode === parkCode);
};

// DEPRECATED: Method to mark a park as visited
// Use VisitedPark collection instead
userSchema.methods.markParkVisited = function(parkCode, visitDate = new Date()) {
  console.warn('User.markParkVisited() is deprecated. Use VisitedPark collection instead.');
  const park = this.savedParks.find(p => p.parkCode === parkCode);
  if (park) {
    park.visited = true;
    park.visitDate = visitDate;
  }
  return this.save();
};

// DEPRECATED: Method to get visited parks count
// Use VisitedPark collection instead
userSchema.methods.getVisitedParksCount = function() {
  console.warn('User.getVisitedParksCount() is deprecated. Use VisitedPark collection instead.');
  return this.savedParks.filter(p => p.visited).length;
};

// Method to check if user has exceeded daily token limit
userSchema.methods.hasExceededTokenLimit = function(dailyLimit = 5000) {
  // Check if we need to reset daily usage (new day)
  const today = new Date().toDateString();
  const lastReset = this.tokenUsage.lastResetDate.toDateString();
  
  if (today !== lastReset) {
    // Reset daily usage for new day
    this.tokenUsage.dailyTokensUsed = 0;
    this.tokenUsage.lastResetDate = new Date();
    this.save(); // Save the reset
  }
  
  return this.tokenUsage.dailyTokensUsed >= dailyLimit;
};

// Method to add token usage
userSchema.methods.addTokenUsage = function(inputTokens, outputTokens) {
  const totalTokens = inputTokens + outputTokens;
  
  // Check if we need to reset daily usage (new day)
  const today = new Date().toDateString();
  const lastReset = this.tokenUsage.lastResetDate.toDateString();
  
  if (today !== lastReset) {
    // Reset daily usage for new day
    this.tokenUsage.dailyTokensUsed = 0;
    this.tokenUsage.lastResetDate = new Date();
  }
  
  // Add to daily and total usage
  this.tokenUsage.dailyTokensUsed += totalTokens;
  this.tokenUsage.totalTokensUsed += totalTokens;
  
  return this.save();
};

// Method to get remaining daily tokens
userSchema.methods.getRemainingDailyTokens = function(dailyLimit = 5000) {
  // Check if we need to reset daily usage (new day)
  const today = new Date().toDateString();
  const lastReset = this.tokenUsage.lastResetDate.toDateString();
  
  if (today !== lastReset) {
    return dailyLimit; // New day, full limit available
  }
  
  return Math.max(0, dailyLimit - this.tokenUsage.dailyTokensUsed);
};

// Method to generate reset password token
userSchema.methods.getResetPasswordToken = function() {
  const crypto = require('crypto');
  const resetToken = crypto.randomBytes(20).toString('hex');
  
  // Hash and set to resetPasswordToken
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  // Set expire to 1 hour
  this.resetPasswordExpire = Date.now() + 60 * 60 * 1000;
  
  return resetToken;
};

// Method to generate email verification token
userSchema.methods.getEmailVerificationToken = function() {
  const crypto = require('crypto');
  const verificationToken = crypto.randomBytes(20).toString('hex');
  
  this.emailVerificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');
  
  this.emailVerificationExpire = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  
  return verificationToken;
};

module.exports = mongoose.model('User', userSchema);
