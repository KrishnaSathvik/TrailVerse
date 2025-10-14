const mongoose = require('mongoose');

const parkReviewSchema = new mongoose.Schema({
  parkCode: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  userName: {
    type: String,
    required: true,
    trim: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  comment: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },
  visitYear: {
    type: Number,
    required: true,
    min: 1900,
    max: new Date().getFullYear() + 1
  },
  visitDuration: {
    type: String,
    enum: ['Day Trip', 'Weekend', '3-5 Days', 'Week+', 'Multiple Visits'],
    required: false
  },
  activities: [{
    type: String,
    trim: true
  }],
  highlights: [{
    type: String,
    trim: true,
    maxlength: 100
  }],
  challenges: [{
    type: String,
    trim: true,
    maxlength: 100
  }],
  photos: [{
    url: String,
    caption: String
  }],
  helpfulVotes: {
    type: Number,
    default: 0
  },
  notHelpfulVotes: {
    type: Number,
    default: 0
  },
  // Track which users have voted (to prevent duplicate votes)
  helpfulUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  verified: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved'
  },
  response: {
    text: String,
    respondedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    respondedAt: Date
  }
}, {
  timestamps: true
});

// Compound index to prevent duplicate reviews from same user for same park
parkReviewSchema.index({ parkCode: 1, userId: 1 }, { unique: true });

// Index for efficient querying
parkReviewSchema.index({ parkCode: 1, rating: 1, createdAt: -1 });
parkReviewSchema.index({ userId: 1, createdAt: -1 });

// Virtual for helpful score
parkReviewSchema.virtual('helpfulScore').get(function() {
  const total = this.helpfulVotes + this.notHelpfulVotes;
  return total > 0 ? this.helpfulVotes / total : 0;
});

// Instance methods
parkReviewSchema.methods.vote = async function(userId, isHelpful) {
  // Check if user already voted (would need separate Vote model for full implementation)
  if (isHelpful) {
    this.helpfulVotes += 1;
  } else {
    this.notHelpfulVotes += 1;
  }
  return this.save();
};

parkReviewSchema.methods.addResponse = async function(responseText, responderId) {
  this.response = {
    text: responseText,
    respondedBy: responderId,
    respondedAt: new Date()
  };
  return this.save();
};

// Static methods
parkReviewSchema.statics.getParkStats = async function(parkCode) {
  const stats = await this.aggregate([
    { $match: { parkCode, status: 'approved' } },
    {
      $group: {
        _id: null,
        totalReviews: { $sum: 1 },
        averageRating: { $avg: '$rating' },
        ratingDistribution: {
          $push: {
            $switch: {
              branches: [
                { case: { $eq: ['$rating', 1] }, then: 1 },
                { case: { $eq: ['$rating', 2] }, then: 2 },
                { case: { $eq: ['$rating', 3] }, then: 3 },
                { case: { $eq: ['$rating', 4] }, then: 4 },
                { case: { $eq: ['$rating', 5] }, then: 5 }
              ],
              default: 0
            }
          }
        }
      }
    }
  ]);

  if (stats.length === 0) {
    return {
      totalReviews: 0,
      averageRating: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    };
  }

  const stat = stats[0];
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  
  stat.ratingDistribution.forEach(rating => {
    if (rating > 0) distribution[rating]++;
  });

  return {
    totalReviews: stat.totalReviews,
    averageRating: Math.round(stat.averageRating * 10) / 10,
    ratingDistribution: distribution
  };
};

parkReviewSchema.statics.getRecentReviews = function(parkCode, limit = 10) {
  return this.find({ parkCode, status: 'approved' })
    .populate('userId', 'name avatar')
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('-__v');
};

parkReviewSchema.statics.getTopRatedParks = function(limit = 10) {
  return this.aggregate([
    { $match: { status: 'approved' } },
    {
      $group: {
        _id: '$parkCode',
        averageRating: { $avg: '$rating' },
        reviewCount: { $sum: 1 }
      }
    },
    { $match: { reviewCount: { $gte: 5 } } }, // At least 5 reviews
    { $sort: { averageRating: -1, reviewCount: -1 } },
    { $limit: limit }
  ]);
};

// Pre-save middleware
parkReviewSchema.pre('save', function(next) {
  // Ensure activities and highlights are trimmed
  if (this.activities) {
    this.activities = this.activities.map(activity => activity.trim()).filter(activity => activity.length > 0);
  }
  if (this.highlights) {
    this.highlights = this.highlights.map(highlight => highlight.trim()).filter(highlight => highlight.length > 0);
  }
  if (this.challenges) {
    this.challenges = this.challenges.map(challenge => challenge.trim()).filter(challenge => challenge.length > 0);
  }
  next();
});

module.exports = mongoose.model('ParkReview', parkReviewSchema);
