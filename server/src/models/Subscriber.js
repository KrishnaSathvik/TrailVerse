const mongoose = require('mongoose');
const crypto = require('crypto');
const { NEWSLETTER_SOURCES } = require('../constants/newsletterSources');
const { SUBSCRIBER_STATUSES } = require('../constants/subscriberStatus');

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
  confirmTokenExpires: {
    type: Date
  },
  unsubscribeToken: {
    type: String,
    default: () => crypto.randomUUID()
  },
  status: {
    type: String,
    enum: SUBSCRIBER_STATUSES,
    default: 'pending',
    index: true
  },
  subscribedAt: {
    type: Date,
    default: Date.now
  },
  unsubscribedAt: {
    type: Date
  },
  suppressedAt: {
    type: Date
  },
  suppressionReason: {
    type: String,
    trim: true
  },
  source: {
    type: String,
    enum: NEWSLETTER_SOURCES,
    default: 'blog-listing'
  },
  sourceDetail: {
    type: String,
    trim: true
  },
  pagePath: {
    type: String,
    trim: true
  },
  parkCode: {
    type: String,
    trim: true,
    lowercase: true
  },
  category: {
    type: String
  },
  utmSource: {
    type: String,
    trim: true
  },
  utmMedium: {
    type: String,
    trim: true
  },
  utmCampaign: {
    type: String,
    trim: true
  },
  consentVersion: {
    type: String,
    trim: true
  },
  confirmedAt: {
    type: Date
  },
  beehiivSubscriberId: {
    type: String,
    trim: true
  },
  beehiivSyncedAt: {
    type: Date
  },
  beehiivSyncStatus: {
    type: String,
    trim: true
  },
  beehiivSyncError: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

subscriberSchema.index({ confirmToken: 1 });
subscriberSchema.index({ unsubscribeToken: 1 });

function effectiveStatus(doc) {
  if (doc.status) return doc.status;
  return doc.confirmed ? 'subscribed' : 'pending';
}

subscriberSchema.methods.effectiveStatus = function effectiveStatusMethod() {
  return effectiveStatus(this);
};

subscriberSchema.statics.effectiveStatus = effectiveStatus;

module.exports = mongoose.model('Subscriber', subscriberSchema);
