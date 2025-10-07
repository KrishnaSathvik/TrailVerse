const mongoose = require('mongoose');

const testimonialSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  name: {
    type: String,
    required: [true, 'Please provide a name'],
    trim: true,
    maxlength: [100, 'Name cannot be more than 100 characters']
  },
  role: {
    type: String,
    trim: true,
    maxlength: [100, 'Role cannot be more than 100 characters'],
    default: 'Park Explorer'
  },
  avatar: {
    type: String,
    default: null
  },
  content: {
    type: String,
    required: [true, 'Please provide testimonial content'],
    trim: true,
    maxlength: [1000, 'Content cannot be more than 1000 characters']
  },
  rating: {
    type: Number,
    required: [true, 'Please provide a rating'],
    min: 1,
    max: 5
  },
  parkCode: {
    type: String,
    default: null,
    trim: true
  },
  parkName: {
    type: String,
    default: null,
    trim: true
  },
  approved: {
    type: Boolean,
    default: false
  },
  featured: {
    type: Boolean,
    default: false
  },
  verified: {
    type: Boolean,
    default: false
  },
  source: {
    type: String,
    enum: ['user-submission', 'social-media', 'email', 'interview', 'admin-created'],
    default: 'user-submission'
  },
  submittedAt: {
    type: Date,
    default: Date.now
  },
  approvedAt: {
    type: Date,
    default: null
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
});

// Add indexes
testimonialSchema.index({ approved: 1, featured: 1 });
testimonialSchema.index({ parkCode: 1, approved: 1 });
testimonialSchema.index({ rating: 1 });
testimonialSchema.index({ submittedAt: -1 });
testimonialSchema.index({ user: 1 });
testimonialSchema.index({ approved: 1, rating: -1 });
testimonialSchema.index({ parkCode: 1, rating: -1 });
testimonialSchema.index({ verified: 1, approved: 1 });

// Text index for search
testimonialSchema.index({ 
  content: 'text',
  name: 'text'
});

// Method to approve testimonial
testimonialSchema.methods.approve = function(adminUserId) {
  this.approved = true;
  this.approvedAt = new Date();
  this.approvedBy = adminUserId;
  return this.save();
};

// Method to feature testimonial
testimonialSchema.methods.feature = function() {
  this.featured = true;
  return this.save();
};

// Method to unfeature testimonial
testimonialSchema.methods.unfeature = function() {
  this.featured = false;
  return this.save();
};

// Method to verify testimonial (mark as verified visitor)
testimonialSchema.methods.verify = function() {
  this.verified = true;
  return this.save();
};

module.exports = mongoose.model('Testimonial', testimonialSchema);
