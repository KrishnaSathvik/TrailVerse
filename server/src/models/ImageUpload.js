const mongoose = require('mongoose');

const imageUploadSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  filename: {
    type: String,
    required: true,
    unique: true
  },
  mimeType: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  url: {
    type: String,
    required: true
  },
  thumbnailUrl: {
    type: String,
    default: null
  },
  category: {
    type: String,
    enum: ['profile', 'blog', 'review', 'event', 'testimonial', 'park', 'general'],
    default: 'general'
  },
  relatedId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  relatedType: {
    type: String,
    enum: ['user', 'blog', 'review', 'event', 'testimonial', 'park'],
    default: null
  },
  metadata: {
    width: Number,
    height: Number,
    format: String,
    colorSpace: String,
    exif: mongoose.Schema.Types.Mixed
  },
  tags: [{
    type: String,
    trim: true
  }],
  isPublic: {
    type: Boolean,
    default: false
  },
  isProcessed: {
    type: Boolean,
    default: false
  },
  processingStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  processingError: {
    type: String,
    default: null
  },
  downloadCount: {
    type: Number,
    default: 0
  },
  lastAccessed: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Add indexes
imageUploadSchema.index({ userId: 1, createdAt: -1 });
imageUploadSchema.index({ category: 1 });
imageUploadSchema.index({ relatedId: 1, relatedType: 1 });
imageUploadSchema.index({ isPublic: 1 });
// Note: filename index is already created by unique: true in schema
imageUploadSchema.index({ tags: 1 });

// Virtual for file size in human readable format
imageUploadSchema.virtual('sizeFormatted').get(function() {
  const bytes = this.size;
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
});

// Method to increment download count
imageUploadSchema.methods.incrementDownload = function() {
  this.downloadCount += 1;
  this.lastAccessed = new Date();
  return this.save();
};

// Method to mark as processed
imageUploadSchema.methods.markProcessed = function() {
  this.isProcessed = true;
  this.processingStatus = 'completed';
  return this.save();
};

// Method to mark processing failed
imageUploadSchema.methods.markFailed = function(error) {
  this.processingStatus = 'failed';
  this.processingError = error;
  return this.save();
};

module.exports = mongoose.model('ImageUpload', imageUploadSchema);
