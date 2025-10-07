const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  park: {
    parkCode: {
      type: String,
      required: true
    },
    parkName: {
      type: String,
      required: true
    }
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userName: {
    type: String,
    required: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  title: {
    type: String,
    required: [true, 'Review title is required'],
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  content: {
    type: String,
    required: [true, 'Review content is required'],
    maxlength: [1000, 'Review cannot exceed 1000 characters']
  },
  visitDate: {
    type: Date,
    required: true
  },
  helpful: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  images: [{
    type: String
  }]
}, {
  timestamps: true
});

// Add indexes for frequently queried fields
reviewSchema.index({ 'park.parkCode': 1, createdAt: -1 });
reviewSchema.index({ user: 1 });
reviewSchema.index({ rating: -1 });
reviewSchema.index({ visitDate: -1 });
reviewSchema.index({ 'park.parkCode': 1, rating: -1 });
reviewSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Review', reviewSchema);
