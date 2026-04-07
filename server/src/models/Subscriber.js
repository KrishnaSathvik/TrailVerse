const mongoose = require('mongoose');
const crypto = require('crypto');

const subscriberSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  firstName: {
    type: String,
    trim: true
  },
  confirmed: {
    type: Boolean,
    default: false
  },
  confirmToken: {
    type: String,
    default: () => crypto.randomUUID()
  },
  unsubscribeToken: {
    type: String,
    default: () => crypto.randomUUID()
  },
  source: {
    type: String,
    enum: ['blog-post', 'blog-listing', 'blog-category'],
    default: 'blog-listing'
  },
  category: {
    type: String
  },
  subscribedAt: {
    type: Date,
    default: Date.now
  },
  confirmedAt: {
    type: Date
  }
});

subscriberSchema.index({ confirmToken: 1 });
subscriberSchema.index({ unsubscribeToken: 1 });

module.exports = mongoose.model('Subscriber', subscriberSchema);
